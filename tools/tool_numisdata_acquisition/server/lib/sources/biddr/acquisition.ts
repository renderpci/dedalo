import { DedaloError } from '../../../../../../src/core/errors/dedalo_error.ts';
import { harvestFetch } from '../../../../../../src/core/harvest/harvest.ts';
import { looksBlocked } from '../../acquisition/block-signals.ts';
import { getQueryParam } from '../../extraction/parser-utils.ts';
import type { AcquisitionProgress, MultiPageAcquisition, RawSource } from '../types.ts';
import { parseTotalPages } from './auction-parser.ts';
import { biddrSearchIdentifier, biddrSingleLotIdentifier } from './identifiers.ts';

/** Thrown when a page fetched fine (2xx) but its HTML has none of the markers this adapter relies
 * on for extraction - a URL that resolves to something other than an auction/search catalogue. */
function unsupportedPageError(): DedaloError {
	return new DedaloError('tool.unsupported_target', {
		publicMessage: 'This page does not appear to contain an auction catalogue.',
	});
}

const MAX_PAGES = 50;
const BIDDR_HOSTS = ['biddr.com'];

async function fetchBiddrPage(
	url: string,
	onWait?: (ms: number, origin: string) => void,
): Promise<RawSource> {
	const response = await harvestFetch({
		url,
		hosts: BIDDR_HOSTS,
		requireHttps: true,
		headers: { Accept: 'text/html,application/xhtml+xml' },
		onWait,
	});
	if (!response.ok) {
		throw new DedaloError('external.http_status', {
			coordinates: { source: 'biddr', url, status: response.status },
		});
	}
	const html = response.text();
	// A Cloudflare/CAPTCHA interstitial is commonly served as a plain 2xx, so response.ok alone
	// does not mean "this is the real page" - without this check it instead failed
	// looksLikeAuctionPage below with the misleading "not an auction catalogue" message (review
	// item: "block-signals.ts is never imported").
	if (response.headers['cf-mitigated'] || looksBlocked(html)) {
		throw new DedaloError('external.protocol', {
			coordinates: { source: 'biddr', url, cf_mitigated: response.headers['cf-mitigated'] ?? '' },
		});
	}
	return {
		html,
		finalUrl: response.url,
		httpStatus: response.status,
		contentType: response.contentType,
	};
}

/** True when a page's HTML carries the markers we rely on for extraction. */
function looksLikeAuctionPage(html: string): boolean {
	return (
		/class="catalog-title/.test(html) &&
		(/class="catalog-lot/.test(html) || /class="catalog-grid/.test(html))
	);
}

/**
 * Runs the acquisition against a public Biddr auction URL: plain HTTP only - the original coins
 * scraper's headless-browser fallback for client-rendered pages is deliberately NOT ported yet;
 * add it only once a real Biddr page is confirmed to need it. Once page 1 is acquired, walks the
 * listing's own pagination to collect every page belonging to the auction.
 */
export async function acquireAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = getQueryParam(rawUrl, 'a');
	if (!auctionIdentifier) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Please provide a valid Biddr auction URL (missing auction id).',
		});
	}

	const onWait = (ms: number, origin: string): void => {
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`);
	};

	const first = await fetchBiddrPage(rawUrl, onWait);
	if (!looksLikeAuctionPage(first.html)) {
		throw unsupportedPageError();
	}

	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(first.finalUrl);
		pageUrl.searchParams.set('p', String(p));
		const page = await fetchBiddrPage(pageUrl.toString(), onWait);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}

/** Acquires a single Biddr lot page - one request, no pagination. */
export async function acquireBiddrSingleLot(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = biddrSingleLotIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Please provide a valid Biddr lot URL (both ?a= and ?l= are required).',
		});
	}

	const page = await fetchBiddrPage(rawUrl, (ms, origin) =>
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`),
	);
	onProgress?.(1, 1);

	return { auctionIdentifier, pages: [page], method: 'http' };
}

/**
 * Search-results pages have no `.catalog-title` block, so looksLikeAuctionPage would reject them.
 * Checks `.catalog-lot` instead of `.catalog-grid`: the grid wrapper's class attribute is actually
 * `class="row catalog-grid ..."`, so a naive `class="catalog-grid` prefix match never fires
 * (confirmed live against the real page, not a fixture). Also accepts a zero-result search (no
 * `.catalog-lot`) as long as the search form (`name="s"`) is present.
 */
function looksLikeSearchResultsPage(html: string): boolean {
	return /class="catalog-lot/.test(html) || /name="s"/.test(html);
}

/**
 * Runs the acquisition against a public Biddr search-results URL - server-rendered plain HTML,
 * same as auction listings, reusing the same `?p=N`/`.pagination-1` pagination convention.
 */
export async function acquireBiddrSearch(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = biddrSearchIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Please provide a valid Biddr search URL.',
		});
	}

	const onWait = (ms: number, origin: string): void => {
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`);
	};

	const first = await fetchBiddrPage(rawUrl, onWait);
	if (!looksLikeSearchResultsPage(first.html)) {
		throw unsupportedPageError();
	}

	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(first.finalUrl);
		pageUrl.searchParams.set('p', String(p));
		const page = await fetchBiddrPage(pageUrl.toString(), onWait);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}
