/**
 * Shared SSRF guard for OUTBOUND-to-internet fetches (SSRF-01/SSRF-02,
 * 2026-07-28 audit; PHP `is_safe_remote_url`).
 *
 * The previous per-tool guards were STRING BLOCKLISTS ("host !== '127.0.0.1'
 * && !/^10\./…"), trivially bypassed by `[::1]`, `127.0.0.2`, `0.0.0.0`,
 * decimal/octal IP literals, IPv4-mapped IPv6, or ANY DNS name pointing at an
 * internal address. This guard instead:
 *   1. requires http/https;
 *   2. RESOLVES the hostname (so a public name pointing at 169.254.169.254 or
 *      127.0.0.1 is caught);
 *   3. vets EVERY resolved address — and an IP literal host — against the full
 *      private / loopback / link-local / reserved range set (v4 and v6).
 *
 * Residual (documented, not closed here): DNS REBINDING between this check and
 * the actual fetch — a full close needs pinning the socket to the vetted IP
 * (PHP used CURLOPT_RESOLVE). Callers should also cap body size + timeout and
 * NOT follow redirects (a redirect re-opens the target choice). See
 * `fetchGuarded`.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { DedaloError } from '../errors/index.ts';

/**
 * The guard's refusals, as ONE registered code. `security.ssrf_blocked` is
 * OPERATOR disclosure on purpose: the wire sentence is the registry's fixed
 * English, and the URL, the protocol, the host and the resolved address ride
 * only as LOG-ONLY `coordinates` — echoing them back would turn a blocked
 * fetch into an internal-network oracle. `Error.message` keeps the old
 * sentence verbatim (logs, and the per-URI report lists that already render it).
 */
function ssrfRefusal(message: string, coordinates: Record<string, string | number>): DedaloError {
	return new DedaloError('security.ssrf_blocked', { message, coordinates });
}

/**
 * True when an error came from THIS guard's refusal, so a caller can answer with
 * its own stable, non-disclosing message.
 *
 * The guard's own text names the address it refused (`… refused private/reserved
 * address 127.0.0.1`). That is right for the log and wrong for the wire: it hands
 * an unauthenticated caller a probe oracle, and it silently rewrote the `msg` two
 * doors had published for years. Callers catch, ask this, and answer in their own
 * words — the detail stays in the DedaloError for the operator.
 */
export function isSsrfRefusal(error: unknown): boolean {
	return error instanceof DedaloError && error.code === 'security.ssrf_blocked';
}

/** Parse an IPv4 dotted string to its 32-bit value, or null if malformed. */
function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const n = Number(part);
		if (n > 255) return null;
		value = value * 256 + n;
	}
	return value >>> 0;
}

/** True when an IPv4 address is private / loopback / link-local / reserved. */
function isPrivateIpv4(ip: string): boolean {
	const v = ipv4ToInt(ip);
	if (v === null) return true; // unparseable ⇒ refuse
	const inRange = (base: string, bits: number): boolean => {
		const b = ipv4ToInt(base);
		if (b === null) return false;
		const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
		return (v & mask) === (b & mask);
	};
	return (
		inRange('0.0.0.0', 8) || // "this" network / 0.0.0.0
		inRange('10.0.0.0', 8) || // private
		inRange('100.64.0.0', 10) || // CGNAT
		inRange('127.0.0.0', 8) || // loopback
		inRange('169.254.0.0', 16) || // link-local (incl. cloud metadata 169.254.169.254)
		inRange('172.16.0.0', 12) || // private
		inRange('192.0.0.0', 24) || // IETF protocol assignments
		inRange('192.168.0.0', 16) || // private
		inRange('198.18.0.0', 15) || // benchmarking
		inRange('224.0.0.0', 4) || // multicast
		inRange('240.0.0.0', 4) // reserved / broadcast
	);
}

/**
 * The embedded IPv4 of an IPv4-mapped/-compatible IPv6 address, dotted, or null.
 *
 * BOTH spellings, because the WHATWG URL parser rewrites one into the other:
 * `new URL('http://[::ffff:127.0.0.1]/').hostname` is `[::ffff:7f00:1]`. A check
 * that only understood the DOTTED tail was therefore dead for every address that
 * arrived as a URL — which is all of them — and `::ffff:127.0.0.1` (loopback) and
 * `::ffff:a00:1` (10.0.0.1) both read as PUBLIC. Measured 2026-08-31.
 */
function mappedIpv4(addr: string): string | null {
	const dotted = addr.match(/(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)?.[1];
	if (dotted !== undefined) return dotted;
	// ::ffff:7f00:1 — the same address, hex, as the URL parser emits it.
	const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (hex?.[1] === undefined || hex[2] === undefined) return null;
	const high = Number.parseInt(hex[1], 16);
	const low = Number.parseInt(hex[2], 16);
	return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** True when an IPv6 address is loopback / link-local / ULA / mapped-private. */
function isPrivateIpv6(ip: string): boolean {
	const addr = ip.toLowerCase().split('%')[0] ?? ip; // drop any zone id
	if (addr === '::1' || addr === '::' || addr === '::0') return true;
	// IPv4-mapped / -compatible: vet the embedded v4, in EITHER spelling.
	const mapped = mappedIpv4(addr);
	if (mapped !== null) return isPrivateIpv4(mapped);
	// fc00::/7 unique-local, fe80::/10 link-local.
	const head = addr.split(':')[0] ?? '';
	if (/^f[cd][0-9a-f]{0,2}$/.test(head)) return true; // fc.. / fd..
	if (/^fe[89ab][0-9a-f]?$/.test(head)) return true; // fe80..febf
	return false;
}

/** True when an already-resolved IP literal is not a public address. */
export function isPrivateIp(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) return isPrivateIpv4(ip);
	if (kind === 6) return isPrivateIpv6(ip);
	return true; // not an IP ⇒ refuse
}

/**
 * True when a URL HOSTNAME names this machine's own loopback — the "nobody else
 * can reach this" question, which is NOT the same question as isPrivateIp.
 *
 * A LAN address (192.168.x, 10.x) is private but perfectly reachable, and it is
 * a LEGITIMATE advertised origin: the docker museum install fetches its releases
 * from the master over exactly such an address. So callers asking "would this
 * URL be unfetchable from anywhere but here?" must ask THIS, not isPrivateIp.
 *
 * Takes a `URL.hostname`, so it strips the brackets IPv6 literals arrive in —
 * `new URL('http://[::1]/').hostname` is `[::1]`, and every hand-rolled copy of
 * this check so far compared against a bare `'::1'` and so never matched.
 */
/** The loopback NAME family, including the RFC 6761 `.localhost` TLD. */
function isLoopbackName(host: string): boolean {
	// A trailing dot is the FULLY-QUALIFIED spelling of the same name: `localhost.`
	// resolves exactly where `localhost` does, and the URL parser keeps the dot.
	const name = host.endsWith('.') ? host.slice(0, -1) : host;
	if (name === '' || name === 'localhost' || name.endsWith('.localhost')) return true;
	return name === 'localhost.localdomain' || name === 'ip6-localhost' || name === 'ip6-loopback';
}

/** All of 127/8 (not merely .1), plus the unspecified address. */
function isLoopbackIpv4(host: string): boolean {
	return host === '0.0.0.0' || host.startsWith('127.');
}

/** `::1`/`::`, and loopback wearing a v6 coat (`::ffff:127.0.0.1`). */
function isLoopbackIpv6(host: string): boolean {
	const addr = host.split('%')[0] ?? host; // drop any zone id
	if (addr === '::1' || addr === '::' || addr === '::0') return true;
	const mapped = mappedIpv4(addr);
	return mapped !== null && isLoopbackIpv4(mapped);
}

export function isLoopbackHost(hostname: string): boolean {
	const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
	const kind = isIP(host);
	if (kind === 4) return isLoopbackIpv4(host);
	if (kind === 6) return isLoopbackIpv6(host);
	return isLoopbackName(host);
}

export interface SafeUrlResult {
	url: URL;
	/** The vetted resolved addresses (for optional socket pinning by the caller). */
	addresses: string[];
}

/**
 * Resolve + vet an outbound URL. Throws (fail closed) unless it is http/https
 * AND every resolved address is public. Returns the parsed URL + vetted IPs.
 */
export async function assertPublicUrl(uri: string): Promise<SafeUrlResult> {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		throw ssrfRefusal('ssrf: unparseable URL', { reason: 'unparseable' });
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw ssrfRefusal(`ssrf: refused non-http(s) URL (${url.protocol})`, {
			reason: 'protocol',
			protocol: url.protocol,
		});
	}
	const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

	if (isIP(host) !== 0) {
		if (isPrivateIp(host)) {
			throw ssrfRefusal(`ssrf: refused private/reserved address ${host}`, {
				reason: 'private_literal',
				host,
			});
		}
		return { url, addresses: [host] };
	}
	// DNS name: resolve ALL records and vet every one.
	let records: { address: string }[];
	try {
		records = await lookup(host, { all: true });
	} catch {
		throw ssrfRefusal(`ssrf: DNS resolution failed for ${host}`, { reason: 'dns_failed', host });
	}
	if (records.length === 0) {
		throw ssrfRefusal(`ssrf: no addresses for ${host}`, { reason: 'no_addresses', host });
	}
	for (const record of records) {
		if (isPrivateIp(record.address)) {
			throw ssrfRefusal(
				`ssrf: ${host} resolves to a private/reserved address (${record.address})`,
				{ reason: 'private_resolved', host, address: record.address },
			);
		}
	}
	return { url, addresses: records.map((r) => r.address) };
}

/** Convenience boolean form for call sites that only branch. */
export async function isPublicUrl(uri: string): Promise<boolean> {
	try {
		await assertPublicUrl(uri);
		return true;
	} catch {
		return false;
	}
}

export interface GuardedFetchOptions {
	/** Max response bytes read before abort (default 25 MiB). */
	maxBytes?: number;
	/** Abort after this many ms (default 15s). */
	timeoutMs?: number;
	/** Extra fetch init (method/headers/body). Redirects are always 'error'. */
	init?: RequestInit;
}

/**
 * Fetch an outbound URL after the SSRF check, with NO redirect following, a
 * timeout, and a hard body cap (closes the gzip-bomb / unbounded-read DoS —
 * DOS-05/06). Returns the decoded text. Throws on any violation.
 *
 * This is the PUBLIC-DESTINATION entry: the address policy is "must be public".
 * A caller whose destination is legitimately private — an on-premise sidecar on
 * the institution's own LAN — must NOT copy this function to get the transport
 * guarantees; it applies its OWN named address policy and then calls
 * `fetchBoundedText`, which is this function minus the address check. One
 * hardened primitive, two entry policies (CARRY-14: the second copy is how six
 * fetch sites ended up with no timeout, no signal and no byte cap at all).
 */
export async function fetchGuardedText(
	uri: string,
	options: GuardedFetchOptions = {},
): Promise<string> {
	const { url } = await assertPublicUrl(uri);
	return fetchBoundedText(url.toString(), options);
}

/**
 * The transport half of `fetchGuardedText`, on a URL the CALLER has already
 * judged: no redirect following (a redirect re-chooses the target, and the
 * caller's policy was applied to the target it chose), an abort timeout, and a
 * streamed byte ceiling so a hostile or broken peer cannot feed the process
 * without bound.
 *
 * It applies NO address policy. Every caller must have applied one — see
 * `assertPublicUrl` for the public case and `isSafeLocalAsrUrl` for the
 * config-gated private-host exemption.
 */
export async function fetchBoundedText(
	url: string,
	options: GuardedFetchOptions = {},
): Promise<string> {
	const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
	const timeoutMs = options.timeoutMs ?? 15_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			...options.init,
			redirect: 'error', // a redirect re-chooses the target — refuse it
			signal: controller.signal,
		});
		if (!res.ok) {
			throw new DedaloError('security.outbound_failed', {
				message: `HTTP ${res.status}`,
				coordinates: { status: res.status },
			});
		}
		const reader = res.body?.getReader();
		if (!reader) return '';
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel();
					throw new DedaloError('security.outbound_failed', {
						message: `response exceeds ${maxBytes} bytes`,
						coordinates: { reason: 'body_cap', max_bytes: maxBytes },
					});
				}
				chunks.push(value);
			}
		}
		const merged = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder().decode(merged);
	} finally {
		clearTimeout(timer);
	}
}
