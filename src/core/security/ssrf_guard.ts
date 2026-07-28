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

/** True when an IPv6 address is loopback / link-local / ULA / mapped-private. */
function isPrivateIpv6(ip: string): boolean {
	const addr = ip.toLowerCase().split('%')[0] ?? ip; // drop any zone id
	if (addr === '::1' || addr === '::' || addr === '::0') return true;
	// IPv4-mapped / -compatible (::ffff:a.b.c.d, ::a.b.c.d): vet the embedded v4.
	const mapped = addr.match(/(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
	if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
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
		throw new Error('ssrf: unparseable URL');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`ssrf: refused non-http(s) URL (${url.protocol})`);
	}
	const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

	if (isIP(host) !== 0) {
		if (isPrivateIp(host)) throw new Error(`ssrf: refused private/reserved address ${host}`);
		return { url, addresses: [host] };
	}
	// DNS name: resolve ALL records and vet every one.
	let records: { address: string }[];
	try {
		records = await lookup(host, { all: true });
	} catch {
		throw new Error(`ssrf: DNS resolution failed for ${host}`);
	}
	if (records.length === 0) throw new Error(`ssrf: no addresses for ${host}`);
	for (const record of records) {
		if (isPrivateIp(record.address)) {
			throw new Error(`ssrf: ${host} resolves to a private/reserved address (${record.address})`);
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
 */
export async function fetchGuardedText(
	uri: string,
	options: GuardedFetchOptions = {},
): Promise<string> {
	const { url } = await assertPublicUrl(uri);
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
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
					throw new Error(`response exceeds ${maxBytes} bytes`);
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
