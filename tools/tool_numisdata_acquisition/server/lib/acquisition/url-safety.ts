import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsafeUrlError';
	}
}

const BIDDR_ALLOWED_HOSTS = [
	/^biddr\.com$/i,
	/^www\.biddr\.com$/i,
	/^media\.biddr\.com$/i,
	/^[a-z0-9-]+\.biddr\.com$/i,
];
const SIXBID_ALLOWED_HOSTS = [
	/^www\.sixbid\.com$/i,
	/^lots\.sixbid\.com$/i,
	/^image-cdn\.sixbid\.com$/i,
];
const JESUSVICO_ALLOWED_HOSTS = [/^www\.jesusvico\.com$/i, /^jesusvico\.com$/i];
const NUMISBIDS_ALLOWED_HOSTS = [
	/^www\.numisbids\.com$/i,
	/^media\.numisbids\.com$/i,
	/^static\.numisbids\.com$/i,
];
const AUREO_ALLOWED_HOSTS = [/^www\.aureo\.com$/i, /^aureo\.com$/i, /^media\.aureo\.com$/i];

/**
 * This is a personal archive tool for a small, known set of auction sites, not a general-purpose
 * fetcher, so we allowlist each source's own hostnames rather than trying to blocklist everything
 * unsafe. Combined with an https-only + private-IP check, this closes off SSRF via crafted or
 * redirected URLs.
 */
function assertSafeKnownHost(
	rawUrl: string,
	allowedHosts: RegExp[],
	invalidUrlMessage: string,
	wrongHostMessage: string,
): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UnsafeUrlError(invalidUrlMessage);
	}

	if (url.protocol !== 'https:') {
		throw new UnsafeUrlError('Only https:// URLs are supported.');
	}

	if (!allowedHosts.some((pattern) => pattern.test(url.hostname))) {
		throw new UnsafeUrlError(wrongHostMessage);
	}

	assertNotPrivateHost(url.hostname);

	return url;
}

export function assertSafeBiddrUrl(rawUrl: string): URL {
	return assertSafeKnownHost(
		rawUrl,
		BIDDR_ALLOWED_HOSTS,
		'Please provide a valid Biddr auction URL.',
		'Only biddr.com URLs are supported.',
	);
}

/** Allowlists sixbid.com's browser-facing host plus the two hosts we actually fetch data/images from. */
export function assertSafeSixbidUrl(rawUrl: string): URL {
	return assertSafeKnownHost(
		rawUrl,
		SIXBID_ALLOWED_HOSTS,
		'Please provide a valid sixbid.com auction URL.',
		'Only sixbid.com URLs are supported.',
	);
}

/** Allowlists jesusvico.com - both the auction pages and its own image host (www.jesusvico.com/img/...). */
export function assertSafeJesusvicoUrl(rawUrl: string): URL {
	return assertSafeKnownHost(
		rawUrl,
		JESUSVICO_ALLOWED_HOSTS,
		'Please provide a valid jesusvico.com auction URL.',
		'Only jesusvico.com URLs are supported.',
	);
}

/** Allowlists numisbids.com - the sale/lot pages plus its own image and static-asset hosts. */
export function assertSafeNumisbidsUrl(rawUrl: string): URL {
	return assertSafeKnownHost(
		rawUrl,
		NUMISBIDS_ALLOWED_HOSTS,
		'Please provide a valid numisbids.com sale URL.',
		'Only numisbids.com URLs are supported.',
	);
}

/** Allowlists aureo.com - the auction/archive pages, its AJAX endpoints under the same host, and its own image host. */
export function assertSafeAureoUrl(rawUrl: string): URL {
	return assertSafeKnownHost(
		rawUrl,
		AUREO_ALLOWED_HOSTS,
		'Please provide a valid aureo.com auction URL.',
		'Only aureo.com URLs are supported.',
	);
}

export function assertNotPrivateHost(hostname: string): void {
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new UnsafeUrlError('Local/internal addresses are not allowed.');
	}

	const ipVersion = isIP(hostname);
	if (ipVersion === 0) return; // hostname, not a literal IP - fine, allowlist already constrains it.

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
