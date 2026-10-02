import { DedaloError } from '../../../../../../src/core/errors/dedalo_error.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import { parseSixbidUrl, sixbidLotIdentifier, sixbidSearchIdentifier } from './api.ts';
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
 * Cannot be fetched automatically at all - lots.sixbid.com's robots.txt is a blanket "Disallow: /"
 * for every agent (confirmed live), so `acquire` always refuses and the operator's saved-HTML path
 * (preview_html) is the only way in (PR #114 review, 2026-09-29 - the earlier "explicitly
 * authorized by the user" bypass of that refusal is removed).
 */
export const sixbidAdapter: SourceAdapter = {
	id: 'sixbid',
	sourceDomain: 'sixbid.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && SIXBID_HOST_PATTERN.test(hostname);
	},

	parseAuctionIdentifier(rawUrl) {
		return (
			sixbidSearchIdentifier(rawUrl) ??
			sixbidLotIdentifier(rawUrl) ??
			parseSixbidUrl(rawUrl)?.auctionId ??
			null
		);
	},

	acquire() {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage:
				'sixbid.com cannot be fetched automatically (its robots.txt blocks every automated agent) - use "Upload a saved HTML page" instead.',
		});
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
