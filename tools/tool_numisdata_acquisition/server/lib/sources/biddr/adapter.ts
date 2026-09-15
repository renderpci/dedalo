import { fetchPublicPage } from '../../acquisition/http.ts';
import { assertSafeBiddrUrl } from '../../acquisition/url-safety.ts';
import { getQueryParam } from '../../extraction/parser-utils.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import {
	acquireAuction,
	acquireBiddrSearch,
	acquireBiddrSingleLot,
	BIDDR_FETCH_OPTIONS,
	biddrSearchIdentifier,
	biddrSingleLotIdentifier,
} from './acquisition.ts';
import { parseAuction, parseSearchAuction, parseSingleLotAuction } from './auction-parser.ts';
import { parseLotDetail, parseLotListing, parseSearchResultLots } from './lot-parser.ts';

const BIDDR_HOST_PATTERN = /(^|\.)biddr\.com$/i;

/**
 * Adapter wrapping Biddr's acquisition/extraction pipeline - a normal per-auction catalogue URL, a
 * `biddr.com/search?...` URL, and a single-lot `?a=...&l=...` URL are all handled by this one
 * adapter (same domain, same robots.txt/rate-limit discipline). Each method checks search, then
 * single-lot, then falls back to the full-auction path - single-lot URLs also carry an `a` param,
 * so that check must come before the full-auction fallback or every single-lot URL would be
 * misread as a request for the entire auction.
 */
export const biddrAdapter: SourceAdapter = {
	id: 'biddr',
	sourceDomain: 'biddr.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && BIDDR_HOST_PATTERN.test(hostname);
	},

	assertSafeUrl: assertSafeBiddrUrl,

	parseAuctionIdentifier(rawUrl) {
		return (
			biddrSearchIdentifier(rawUrl) ??
			biddrSingleLotIdentifier(rawUrl) ??
			getQueryParam(rawUrl, 'a')
		);
	},

	acquire: (rawUrl, onProgress) => {
		if (biddrSearchIdentifier(rawUrl)) return acquireBiddrSearch(rawUrl, onProgress);
		if (biddrSingleLotIdentifier(rawUrl)) return acquireBiddrSingleLot(rawUrl, onProgress);
		return acquireAuction(rawUrl, onProgress);
	},

	parseAuction: (firstPage, sourceUrl) => {
		if (biddrSearchIdentifier(sourceUrl)) return parseSearchAuction(firstPage.html, sourceUrl);
		if (biddrSingleLotIdentifier(sourceUrl))
			return parseSingleLotAuction(firstPage.html, sourceUrl);
		return parseAuction({ html: firstPage.html, sourceUrl });
	},

	parseLots: (page, sourceUrl) => {
		if (biddrSearchIdentifier(sourceUrl)) return parseSearchResultLots(page.html, sourceUrl);
		if (biddrSingleLotIdentifier(sourceUrl)) {
			const lot = parseLotDetail(page.html, sourceUrl);
			return lot ? [lot] : [];
		}
		return parseLotListing(page.html, sourceUrl);
	},

	// A real auction's numeric identifier stays unprefixed, an independent space from jesusvico's -
	// prefix so the two sources can never collide under data/sources/auctions/<key>/. A single-lot
	storageKey: (auctionIdentifier) => {
		if (/^\d+$/.test(auctionIdentifier)) return auctionIdentifier;
		if (auctionIdentifier.startsWith('lot-')) return `biddr-${auctionIdentifier}`;
		return `biddr-search-${auctionIdentifier}`;
	},

	async fetchLotDetail(lotSourceUrl) {
		const raw = await fetchPublicPage(lotSourceUrl, BIDDR_FETCH_OPTIONS);
		return parseLotDetail(raw.html, lotSourceUrl);
	},
};
