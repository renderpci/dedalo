import { createHash } from 'node:crypto';
import {
	AcquisitionBlockedError,
	type FetchPageOptions,
	fetchPublicPage,
	type RawSource,
	RobotsDisallowedError,
} from '../../acquisition/http.ts';
import { assertSafeBiddrUrl, UnsafeUrlError } from '../../acquisition/url-safety.ts';
import { getQueryParam } from '../../extraction/parser-utils.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';
import { parseTotalPages } from './auction-parser.ts';

export { AcquisitionBlockedError, RobotsDisallowedError, UnsafeUrlError };

/** Shared fetchPublicPage options for Biddr - reused by adapter.ts's fetchLotDetail too. */
export const BIDDR_FETCH_OPTIONS: FetchPageOptions = {
	assertSafeUrl: assertSafeBiddrUrl,
	allowRedirectHost: (hostname) => hostname === 'biddr.com' || hostname.endsWith('.biddr.com'),
};

export class UnsupportedPageError extends Error {
	constructor(message = 'This page does not appear to contain an auction catalogue.') {
		super(message);
		this.name = 'UnsupportedPageError';
	}
}

const MAX_PAGES = 50;

/** True when a page's HTML carries the markers we rely on for extraction. */
function looksLikeAuctionPage(html: string): boolean {
	return (
		/class="catalog-title/.test(html) &&
		(/class="catalog-lot/.test(html) || /class="catalog-grid/.test(html))
	);
}

/**
 * Runs the acquisition against a public Biddr auction URL: plain HTTP only (the original coins
 * scraper also had a headless-browser fallback for client-rendered pages — deliberately NOT ported
 * yet, see AGENTS/session notes: add it only once a real Biddr page is confirmed to need it, rather
 * than pulling in Playwright as a dependency upfront). Once page 1 is acquired, walks the listing's
 * own pagination to collect every page belonging to the auction, honoring the same rate limiting as
 * the first request.
 */
export async function acquireAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const url = assertSafeBiddrUrl(rawUrl);
	const auctionIdentifier = getQueryParam(url.toString(), 'a');
	if (!auctionIdentifier) {
		throw new UnsafeUrlError('Please provide a valid Biddr auction URL (missing auction id).');
	}

	const first = await fetchPublicPage(url.toString(), BIDDR_FETCH_OPTIONS);
	if (!looksLikeAuctionPage(first.html)) {
		throw new UnsupportedPageError();
	}

	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(url.toString());
		pageUrl.searchParams.set('p', String(p));
		const page = await fetchPublicPage(pageUrl.toString(), BIDDR_FETCH_OPTIONS);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}

/**
 * Validates a Biddr single-lot URL (`biddr.com/{house}/auction?a=...&l=...`) - the same page Biddr
 * itself links to for one specific lot, and the same shape already used internally for the lazy
 * per-lot detail fetch (see adapter.ts's fetchLotDetail). Requires BOTH `a` and `l` - a plain
 * `?a=...` with no `l` is a full auction listing, not this.
 */
export function parseBiddrSingleLotUrl(
	rawUrl: string,
): { auctionId: string; lotId: string } | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/biddr\.com$/i.test(url.hostname)) return null;
	const auctionId = url.searchParams.get('a');
	const lotId = url.searchParams.get('l');
	if (!auctionId || !lotId) return null;
	return { auctionId, lotId };
}

/**
 * A stable identifier for a single-lot retrieval, distinct from the full auction's own numeric id
 * so pasting `?a=7359&l=8996598` and later pasting the plain `?a=7359` auction URL are dedupe'd as
 * two separate archive entries rather than the single-lot fetch silently "claiming" the full
 * auction's identifier (which would make a later full retrieval look like it already exists).
 */
export function biddrSingleLotIdentifier(rawUrl: string): string | null {
	const parsed = parseBiddrSingleLotUrl(rawUrl);
	return parsed ? `lot-${parsed.lotId}` : null;
}

/**
 * Acquires a single Biddr lot page - one request, no pagination. Reuses the exact same fetch as
 * the full-auction path (BIDDR_FETCH_OPTIONS: robots.txt + crawl-delay-aware).
 */
export async function acquireBiddrSingleLot(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const url = assertSafeBiddrUrl(rawUrl);
	const auctionIdentifier = biddrSingleLotIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new UnsafeUrlError(
			'Please provide a valid Biddr lot URL (both ?a= and ?l= are required).',
		);
	}

	const page = await fetchPublicPage(url.toString(), BIDDR_FETCH_OPTIONS);
	onProgress?.(1, 1);

	return { auctionIdentifier, pages: [page], method: 'http' };
}

/**
 * Validates a Biddr search-results URL (`biddr.com/search?s=...&c=...&pf=...&pt=...&pc=...`) and
 * returns its query params, or null if this isn't a search URL. The unit of retrieval here is a
 * search (spanning however many of Biddr's own auctions matched), not one complete auction.
 */
export function parseBiddrSearchUrl(rawUrl: string): URLSearchParams | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/biddr\.com$/i.test(url.hostname)) return null;
	if (url.pathname !== '/search') return null;
	return url.searchParams;
}

/**
 * A stable, deterministic identifier for a search (used for dedupe and on-disk storage keys) - a
 * hash of the normalized, sorted query string rather than the raw term, since search terms can
 * contain arbitrary/unicode text unsafe to use directly as a directory name.
 */
export function biddrSearchIdentifier(rawUrl: string): string | null {
	const params = parseBiddrSearchUrl(rawUrl);
	if (!params) return null;
	const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
	const normalized = new URLSearchParams(sorted).toString();
	return createHash('sha256').update(normalized, 'utf-8').digest('hex').slice(0, 16);
}

/**
 * Search-results pages have no `.catalog-title` block (confirmed live - there's no single auction
 * to title, results span many) so looksLikeAuctionPage would always reject a real search page.
 * Checks for `.catalog-lot` instead of `.catalog-grid`: the grid wrapper's actual class attribute
 * is `class="row catalog-grid ..."` (catalog-grid is never first), so a naive `class="catalog-grid`
 * substring match never fires - confirmed live, this was caught by testing against the real page,
 * not just a downloaded fixture. `.catalog-lot`'s own class attribute reliably starts with it.
 * Also accepts a zero-result search (no `.catalog-lot` at all) as long as the search form itself
 * (`name="s"`) is present, rather than treating "no matches" the same as "not a real page".
 */
function looksLikeSearchResultsPage(html: string): boolean {
	return /class="catalog-lot/.test(html) || /name="s"/.test(html);
}

/**
 * Runs the acquisition against a public Biddr search-results URL. Confirmed live that search pages
 * are server-rendered plain HTML (same as auction listings) - no browser fallback needed. Reuses
 * the same pagination convention (`?p=N`, `.pagination-1`) as a normal auction listing.
 */
export async function acquireBiddrSearch(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const url = assertSafeBiddrUrl(rawUrl);
	const auctionIdentifier = biddrSearchIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new UnsafeUrlError('Please provide a valid Biddr search URL.');
	}

	const first = await fetchPublicPage(url.toString(), BIDDR_FETCH_OPTIONS);
	if (!looksLikeSearchResultsPage(first.html)) {
		throw new UnsupportedPageError();
	}

	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(url.toString());
		pageUrl.searchParams.set('p', String(p));
		const page = await fetchPublicPage(pageUrl.toString(), BIDDR_FETCH_OPTIONS);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}
