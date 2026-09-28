import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsafeUrlError';
	}
}

/** OAI-PMH is spoken by many independent hosts, unlike the coin tool's single-domain sources - no
 * finite allowlist here, just SSRF prevention (https-only, no private/internal targets). */
export async function assertSafeOaiUrl(rawUrl: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UnsafeUrlError('Please provide a valid URL.');
	}

	if (url.protocol !== 'https:') {
		throw new UnsafeUrlError('Only https:// URLs are supported.');
	}

	await assertNotPrivateHost(url.hostname);

	return url;
}

// Private/reserved ranges a fetch must never be allowed to reach. IPv4-mapped IPv6 has NO entry
// here on purpose: Node's BlockList has no way to check a mapped address against these IPv4 subnets
// directly (and a blanket "::ffff:0:0/96 is blocked" rule cannot tell a mapped PRIVATE address from a
// mapped PUBLIC one - both are equally "in ::ffff:0:0/96"), so unmapIPv4() below extracts the real
// IPv4 address first and lets it fall through to the ordinary IPv4 rules instead.
const PRIVATE_RANGES = new BlockList();
PRIVATE_RANGES.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_RANGES.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_RANGES.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_RANGES.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_RANGES.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_RANGES.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_RANGES.addSubnet('100.64.0.0', 10, 'ipv4'); // carrier-grade NAT (Docker/Tailscale)
PRIVATE_RANGES.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmarking range, routes internally on some hosts
PRIVATE_RANGES.addAddress('::1', 'ipv6');
PRIVATE_RANGES.addAddress('::', 'ipv6');
PRIVATE_RANGES.addSubnet('fc00::', 7, 'ipv6'); // unique local
PRIVATE_RANGES.addSubnet('fe80::', 10, 'ipv6'); // link-local

const MAPPED_DOTTED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/**
 * An IPv4-mapped IPv6 literal ("::ffff:127.0.0.1", or WHATWG URL's canonical hex form
 * "::ffff:7f00:1" for the same address - confirmed live: `new URL('https://[::ffff:127.0.0.1]/')`
 * normalizes it to the hex form before our code ever sees it) unwrapped to its real IPv4 address, so
 * it can be checked against the ordinary IPv4 rules instead of a mapped-space rule that cannot tell a
 * private mapped address from a public one. Returns null when `address` isn't a mapped literal.
 */
function unmapIPv4(address: string): string | null {
	const dotted = MAPPED_DOTTED.exec(address);
	if (dotted?.[1]) return dotted[1];
	const hex = MAPPED_HEX.exec(address);
	if (hex?.[1] && hex[2]) {
		const hi = Number.parseInt(hex[1], 16);
		const lo = Number.parseInt(hex[2], 16);
		return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
	}
	return null;
}

function isBlockedAddress(address: string, family: 4 | 6): boolean {
	if (family === 6) {
		const unmapped = unmapIPv4(address);
		if (unmapped !== null) return isBlockedAddress(unmapped, 4);
	}
	return PRIVATE_RANGES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Rejects private/internal targets. A literal IP (bracketed IPv6 included) is checked directly; a
 * DNS name is resolved and EVERY returned address is checked, since only the first one being public
 * proves nothing about the rest. A small window remains between this check and the actual connection
 * (DNS rebinding) - acceptable here, since the fetch layer also checks on every redirect hop.
 */
export async function assertNotPrivateHost(hostname: string): Promise<void> {
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new UnsafeUrlError('Local/internal addresses are not allowed.');
	}

	// URL.hostname keeps the brackets on an IPv6 literal ("[::1]"); isIP()/BlockList need them gone.
	const bareHost =
		hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

	const ipVersion = isIP(bareHost);
	if (ipVersion !== 0) {
		if (isBlockedAddress(bareHost, ipVersion === 6 ? 6 : 4)) {
			throw new UnsafeUrlError('Private/internal network addresses are not allowed.');
		}
		return;
	}

	let addresses: Array<{ address: string; family: number }>;
	try {
		addresses = await lookup(bareHost, { all: true, verbatim: true });
	} catch {
		throw new UnsafeUrlError('Could not resolve this host.');
	}
	for (const { address, family } of addresses) {
		if (isBlockedAddress(address, family === 6 ? 6 : 4)) {
			throw new UnsafeUrlError('Private/internal network addresses are not allowed.');
		}
	}
}
