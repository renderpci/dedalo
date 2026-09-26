import { fetchPublicPage } from '../../acquisition/http.ts';
import { assertSafeJesusvicoUrl } from '../../acquisition/url-safety.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import {
	acquireJesusvicoAuction,
	acquireJesusvicoLot,
	JESUSVICO_FETCH_OPTIONS,
	jesusvicoLotIdentifier,
	parseJesusvicoAuctionNumber,
} from './acquisition.ts';
import {
	parseJesusvicoAuction,
	parseJesusvicoLotDetail,
	parseJesusvicoLots,
	parseJesusvicoSingleLotAuction,
} from './parser.ts';

const JESUSVICO_HOST_PATTERN = /(^|\.)jesusvico\.com$/i;

/**
 * Adapter for jesusvico.com - server-rendered listing + lazy per-lot detail fetch, the same
 * two-tier shape as Biddr. Fully respects robots.txt, unlike sixbid. Also handles a single-lot
 * URL (`/lot/` or Spanish `/lote/`) as its own lightweight retrieval, unambiguous since a normal
 * `/subasta/...` listing URL never has a lot-number segment.
 */
export const jesusvicoAdapter: SourceAdapter = {
	id: 'jesusvico',
	sourceDomain: 'jesusvico.com',

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && JESUSVICO_HOST_PATTERN.test(hostname);
	},

	assertSafeUrl: assertSafeJesusvicoUrl,

	parseAuctionIdentifier(rawUrl) {
		return jesusvicoLotIdentifier(rawUrl) ?? parseJesusvicoAuctionNumber(rawUrl);
	},

	acquire: (rawUrl, onProgress) =>
		jesusvicoLotIdentifier(rawUrl)
			? acquireJesusvicoLot(rawUrl, onProgress)
			: acquireJesusvicoAuction(rawUrl, onProgress),

	parseAuction: (firstPage, sourceUrl) =>
		jesusvicoLotIdentifier(sourceUrl)
			? parseJesusvicoSingleLotAuction(firstPage.html, sourceUrl)
			: parseJesusvicoAuction(firstPage.html, sourceUrl),

	parseLots: (page, sourceUrl) => {
		if (jesusvicoLotIdentifier(sourceUrl)) {
			const lot = parseJesusvicoLotDetail(page.html, sourceUrl);
			return lot ? [lot] : [];
		}
		return parseJesusvicoLots(page.html, sourceUrl);
	},

	// Prefixed so jesusvico's auction numbers can't collide with another source's under
	// data/sources/auctions/<key>/.
	storageKey: (auctionIdentifier) => `jesusvico-${auctionIdentifier}`,

	async fetchLotDetail(lotSourceUrl) {
		const raw = await fetchPublicPage(lotSourceUrl, JESUSVICO_FETCH_OPTIONS);
		return parseJesusvicoLotDetail(raw.html, lotSourceUrl);
	},
};
