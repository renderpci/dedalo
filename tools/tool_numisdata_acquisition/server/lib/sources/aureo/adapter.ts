import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import { acquireAureoAuction, parseAureoAuctionId } from './acquisition.ts';
import { parseAureoAuction, parseAureoLots } from './parser.ts';

const AUREO_HOST_PATTERN = /(^|\.)aureo\.com$/i;

/**
 * Adapter for aureo.com's normal auction URL (`/en/subasta/{id}`). Fully respects robots.txt
 * (permissive, `Allow: /`), unlike sixbid/numisbids. No fetchLotDetail - aureo's listing card
 * already carries the full untruncated description and a directly-constructible full-resolution
 * image URL, confirmed live, so a separate detail fetch would add nothing.
 */
export const aureoAdapter: SourceAdapter = {
	id: 'aureo',
	sourceDomain: 'aureo.com',
	// No canonicalLotUrl: aureo has no bookmarkable lot URL - every lot carries its AUCTION's page
	// URL (parser.ts), so a URL key would collapse a whole sale into its first lot. Its lots dedup
	// on (Auction, lot number) only.

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && AUREO_HOST_PATTERN.test(hostname);
	},

	parseAuctionIdentifier(rawUrl) {
		return parseAureoAuctionId(rawUrl);
	},

	acquire: (rawUrl, onProgress) => acquireAureoAuction(rawUrl, onProgress),

	parseAuction: (firstPage, sourceUrl) => parseAureoAuction(firstPage.html, sourceUrl),

	parseLots: (page, sourceUrl) => parseAureoLots(page.html, sourceUrl),

	// aureo auction ids are usually a plain integer, but a multi-session auction's id has a
	// hyphenated session suffix ("0200-1", confirmed live) - both get the same "aureo-" prefix.
	storageKey: (auctionIdentifier) => `aureo-${auctionIdentifier}`,
};
