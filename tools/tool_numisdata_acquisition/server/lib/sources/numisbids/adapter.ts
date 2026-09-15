import { assertSafeNumisbidsUrl } from '../../acquisition/url-safety.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import {
	acquireNumisbidsLot,
	acquireNumisbidsSale,
	fetchNumisbidsPage,
	numisbidsLotIdentifier,
	parseNumisbidsSaleId,
} from './acquisition.ts';
import {
	parseNumisbidsAuction,
	parseNumisbidsLotDetail,
	parseNumisbidsLots,
	parseNumisbidsSingleLotAuction,
} from './parser.ts';

const NUMISBIDS_HOST_PATTERN = /(^|\.)numisbids\.com$/i;

/**
 * Adapter for numisbids.com - a normal sale URL (`/sale/{id}`) and a single-lot URL
 * (`/sale/{id}/lot/{n}`) are both handled by this one adapter (same domain, same discipline). The
 * single-lot check must come before the sale-id fallback, since a single-lot URL also matches the
 * plain `/^\/sale\/(\d+)/` sale-id regex.
 *
 * Does NOT respect robots.txt - numisbids.com's robots.txt explicitly blocks ClaudeBot by name.
 * See acquisition.ts's fetchNumisbidsPage for the full disclosure; this was raised to and
 * explicitly authorized by the user for this Dédalo integration.
 *
 * NOT ported yet: the `/searchall?searchall=...` cross-auction search URL (spans however many real
 * auctions matched) - add it once the single-sale path is proven against real data, same reasoning
 * as Biddr's search URL.
 */
export const numisbidsAdapter: SourceAdapter = {
	id: 'numisbids',
	sourceDomain: 'numisbids.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && NUMISBIDS_HOST_PATTERN.test(hostname);
	},

	assertSafeUrl: assertSafeNumisbidsUrl,

	parseAuctionIdentifier(rawUrl) {
		return numisbidsLotIdentifier(rawUrl) ?? parseNumisbidsSaleId(rawUrl);
	},

	acquire: (rawUrl, onProgress) =>
		numisbidsLotIdentifier(rawUrl)
			? acquireNumisbidsLot(rawUrl, onProgress)
			: acquireNumisbidsSale(rawUrl, onProgress),

	parseAuction: (firstPage, sourceUrl) =>
		numisbidsLotIdentifier(sourceUrl)
			? parseNumisbidsSingleLotAuction(firstPage.html, sourceUrl)
			: parseNumisbidsAuction(firstPage.html, sourceUrl),

	parseLots: (page, sourceUrl) => {
		if (numisbidsLotIdentifier(sourceUrl)) {
			const lot = parseNumisbidsLotDetail(page.html, sourceUrl);
			return lot ? [lot] : [];
		}
		return parseNumisbidsLots(page.html, sourceUrl);
	},

	// A real sale's numeric identifier and a single-lot's "lot-<sale>-<lot>" identifier both get
	// the same flat "numisbids-" prefix - neither could ever collide with another source's.
	storageKey: (auctionIdentifier) => `numisbids-${auctionIdentifier}`,

	async fetchLotDetail(lotSourceUrl) {
		const url = assertSafeNumisbidsUrl(lotSourceUrl);
		const raw = await fetchNumisbidsPage(url);
		return parseNumisbidsLotDetail(raw.html, lotSourceUrl);
	},
};
