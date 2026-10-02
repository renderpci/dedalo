import { createHash } from 'node:crypto';

/**
 * lots.sixbid.com's robots.txt is a blanket "Disallow: /" for every agent (confirmed live) - this
 * source cannot be fetched automatically at all. No automated fetch is made here - preview_html
 * (the operator's own saved page) is the only path. These are the pure URL-parsing helpers
 * `parseAuctionIdentifier` still needs; the JSON-API fetch layer this file used to carry was
 * removed, along with the "explicitly authorized by the user" override of that robots.txt refusal
 * (PR #114 review, 2026-09-29).
 */

/**
 * Parses a sixbid.com browser URL like .../en/heritage-auctions-inc/13977/page/1/perPage/100 into
 * the companySlug + numeric auctionId. Tolerates an optional 2-letter locale prefix and ignores
 * trailing /page/N/perPage/N segments.
 */
export function parseSixbidUrl(rawUrl: string): { companySlug: string; auctionId: string } | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/sixbid\.com$/i.test(url.hostname)) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	const companySlug = segments[start];
	const auctionId = segments[start + 1];
	if (!companySlug || !auctionId || !/^\d+$/.test(auctionId)) return null;

	return { companySlug, auctionId };
}

export interface SixbidSearchParams {
	term: string;
	currency: string | null;
}

/**
 * Detects a sixbid.com site-wide search URL, e.g. .../en/lots/page/1/perPage/100?term=madrid -
 * the browser route for "search every company's lots", distinct from a single auction's own
 * /{company}/{auctionId} listing. The `/lots` segment is the unambiguous signal - a real
 * companySlug is never literally "lots".
 */
export function parseSixbidSearchUrl(rawUrl: string): SixbidSearchParams | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/sixbid\.com$/i.test(url.hostname)) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	if (segments[start] !== 'lots') return null;

	const term = url.searchParams.get('term');
	if (!term) return null;

	return { term, currency: url.searchParams.get('currency') };
}

/**
 * A stable, deterministic identifier for a search (dedupe + on-disk storage key) - a hash of the
 * normalized, sorted query string, since search terms can contain unicode unsafe for a directory
 * name.
 */
export function sixbidSearchIdentifier(rawUrl: string): string | null {
	const params = parseSixbidSearchUrl(rawUrl);
	if (!params) return null;
	const entries: [string, string][] = [
		['term', params.term],
		['currency', params.currency ?? ''],
	];
	const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
	const normalized = new URLSearchParams(sorted).toString();
	return createHash('sha256').update(normalized, 'utf-8').digest('hex').slice(0, 16);
}

/**
 * Extracts a single-lot URL's companySlug/auctionId/lotId, e.g.
 * .../en/heritage-auctions-inc/13977/argentina-la-rioja/12399926/la-rioja-... . The lot id is the
 * first purely-numeric path segment after the auction id (the category-slug between them is never
 * all-digits). Bails out if the next segment is literally "page" (a full-auction listing URL like
 * `.../13977/page/1/perPage/100`) - otherwise the "1" in "/page/1/" would look like a lot id.
 */
export function parseSixbidLotUrl(
	rawUrl: string,
): { companySlug: string; auctionId: string; lotId: string } | null {
	const base = parseSixbidUrl(rawUrl);
	if (!base) return null;

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	const rest = segments.slice(start + 2);
	if (rest[0] === 'page' || rest[0] === 'perPage') return null;

	const lotId = rest.find((seg) => /^\d+$/.test(seg));
	if (!lotId) return null;

	return { companySlug: base.companySlug, auctionId: base.auctionId, lotId };
}

/** A stable identifier for a single-lot retrieval, distinct from the full auction's own numeric id. */
export function sixbidLotIdentifier(rawUrl: string): string | null {
	const parsed = parseSixbidLotUrl(rawUrl);
	return parsed ? `lot-${parsed.lotId}` : null;
}
