import { assertSafeAureoUrl } from '../../acquisition/url-safety.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import { acquireAureoAuction, parseAureoAuctionId } from './acquisition.ts';
import { parseAureoAuction, parseAureoLots } from './parser.ts';

const AUREO_HOST_PATTERN = /(^|\.)aureo\.com$/i;

/**
 * Adapter for aureo.com's normal auction URL (`/en/subasta/{id}`). Fully respects robots.txt
 * (permissive here, `Allow: /`) - no exception needed, unlike sixbid/numisbids. No fetchLotDetail -
 * aureo's listing card already carries the full untruncated description and a directly-
 * constructible full-resolution image URL, confirmed live, so there's nothing a separate detail
 * fetch would add URL.
 */
export const aureoAdapter: SourceAdapter = {
	id: 'aureo',
	sourceDomain: 'aureo.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && AUREO_HOST_PATTERN.test(hostname);
	},

	assertSafeUrl: assertSafeAureoUrl,

	parseAuctionIdentifier(rawUrl) {
		return parseAureoAuctionId(rawUrl);
	},

	acquire: (rawUrl, onProgress) => acquireAureoAuction(rawUrl, onProgress),

	parseAuction: (firstPage, sourceUrl) => parseAureoAuction(firstPage.html, sourceUrl),

	parseLots: (page, sourceUrl) => parseAureoLots(page.html, sourceUrl),

	// aureo's own auction ids are usually a plain integer, but a multi-session auction's id has a
	// hyphenated session suffix ("0200-1", confirmed live) - both are still a real auction id, an
	// independent space from every other source's, so both get the plain "aureo-" prefix.
	storageKey: (auctionIdentifier) => `aureo-${auctionIdentifier}`,
};
