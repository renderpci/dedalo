import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsafeUrlError';
	}
}

/** OAI-PMH is spoken by many independent hosts, unlike the coin tool's single-domain sources - no
 * finite allowlist here, just SSRF prevention (https-only, no private/internal targets). */
export function assertSafeOaiUrl(rawUrl: string): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UnsafeUrlError('Please provide a valid URL.');
	}

	if (url.protocol !== 'https:') {
		throw new UnsafeUrlError('Only https:// URLs are supported.');
	}

	assertNotPrivateHost(url.hostname);

	return url;
}

export function assertNotPrivateHost(hostname: string): void {
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new UnsafeUrlError('Local/internal addresses are not allowed.');
	}

	const ipVersion = isIP(hostname);
	if (ipVersion === 0) return; // hostname, not a literal IP.

	// A literal IP was supplied (or a redirect resolved to one) - reject private/loopback/link-local ranges.
	if (isPrivateOrReservedIp(hostname, ipVersion)) {
		throw new UnsafeUrlError('Private/internal network addresses are not allowed.');
	}
}

function isPrivateOrReservedIp(ip: string, version: number): boolean {
	if (version === 4) {
		const parts = ip.split('.').map(Number);
		const [a, b] = parts;
		if (a === undefined || b === undefined) return true;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		return false;
	}
	const lower = ip.toLowerCase();
	if (lower === '::1') return true;
	if (lower.startsWith('fe80:')) return true;
	if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
	return false;
}
