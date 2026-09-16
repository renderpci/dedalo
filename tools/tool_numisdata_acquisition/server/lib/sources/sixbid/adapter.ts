import { assertSafeSixbidUrl } from '../../acquisition/url-safety.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import {
	acquireSixbidAuction,
	acquireSixbidLot,
	acquireSixbidSearch,
	parseSixbidUrl,
	sixbidLotIdentifier,
	sixbidSearchIdentifier,
} from './api.ts';
import {
	parseSixbidAuction,
	parseSixbidLots,
	parseSixbidSearchAuction,
	parseSixbidSearchLots,
	parseSixbidSingleLotAuction,
} from './parser.ts';

const SIXBID_HOST_PATTERN = /(^|\.)sixbid\.com$/i;

/**
 * Adapter wrapping the sixbid JSON-API acquisition/extraction pipeline - a normal per-auction URL,
 * a single-lot URL (`/{company}/{auction}/{category}/{lotId}/{slug}`), and a site-wide search URL
 * (`/lots/page/{p}/perPage/{n}?term=...&currency=...`) are all handled here. Search must be
 * checked before single-lot, which must be checked before the full-auction fallback (see api.ts's
 * parseSixbidLotUrl for why that's unambiguous).
 *
 * Does NOT consult robots.txt - lots.sixbid.com's robots.txt is a blanket "Disallow: /" for every
 * agent. See api.ts's fetchSixbidLotsPage for the full disclosure; explicitly authorized by the
 * user for this Dédalo integration.
 */
export const sixbidAdapter: SourceAdapter = {
	id: 'sixbid',
	sourceDomain: 'sixbid.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && SIXBID_HOST_PATTERN.test(hostname);
	},

	assertSafeUrl: assertSafeSixbidUrl,

	parseAuctionIdentifier(rawUrl) {
		return (
			sixbidSearchIdentifier(rawUrl) ??
			sixbidLotIdentifier(rawUrl) ??
			parseSixbidUrl(rawUrl)?.auctionId ??
			null
		);
	},

	acquire: (rawUrl, onProgress) => {
		if (sixbidSearchIdentifier(rawUrl)) return acquireSixbidSearch(rawUrl, onProgress);
		if (sixbidLotIdentifier(rawUrl)) return acquireSixbidLot(rawUrl, onProgress);
		return acquireSixbidAuction(rawUrl, onProgress);
	},

	parseAuction: (firstPage, sourceUrl) => {
		if (sixbidSearchIdentifier(sourceUrl))
			return parseSixbidSearchAuction(firstPage.html, sourceUrl);
		if (sixbidLotIdentifier(sourceUrl))
			return parseSixbidSingleLotAuction(firstPage.html, sourceUrl);
		return parseSixbidAuction(firstPage.html, sourceUrl);
	},

	parseLots: (page, sourceUrl) =>
		sixbidSearchIdentifier(sourceUrl)
			? parseSixbidSearchLots(page.html)
			: parseSixbidLots(page.html),

	// A search's hash-shaped identifier (neither all-digit nor "lot-"-prefixed) gets its own
	// distinct prefix so it can't collide with an auctionId or single-lot key.
	storageKey: (auctionIdentifier) => {
		if (/^\d+$/.test(auctionIdentifier) || auctionIdentifier.startsWith('lot-')) {
			return `sixbid-${auctionIdentifier}`;
		}
		return `sixbid-search-${auctionIdentifier}`;
	},
};
