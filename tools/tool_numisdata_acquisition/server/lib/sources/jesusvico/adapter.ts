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
 * two-tier shape as Biddr. Fully respects robots.txt (no exception needed here, unlike sixbid).
 * Also handles a single-lot URL (`/lot/` or its Spanish-locale `/lote/`) as its own lightweight
 * retrieval - unambiguous to detect, since a normal auction-listing URL (`/subasta/...`) never has
 * a lot-number segment for jesusvicoLotIdentifier to find.
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
			? parseJesusvicoSingleLotAuction(sourceUrl)
			: parseJesusvicoAuction(firstPage.html, sourceUrl),

	parseLots: (page, sourceUrl) => {
		if (jesusvicoLotIdentifier(sourceUrl)) {
			const lot = parseJesusvicoLotDetail(page.html, sourceUrl);
			return lot ? [lot] : [];
		}
		return parseJesusvicoLots(page.html, sourceUrl);
	},

	// jesusvico's own auction numbers are plain small integers, an independent space from Biddr's -
	// prefix so the two sources can never collide under data/sources/auctions/<key>/. A single-lot
	// identifier (`lot-<auction>-<lot>`) gets the same prefix, already distinct on its own.
	storageKey: (auctionIdentifier) => `jesusvico-${auctionIdentifier}`,

	async fetchLotDetail(lotSourceUrl) {
		const raw = await fetchPublicPage(lotSourceUrl, JESUSVICO_FETCH_OPTIONS);
		return parseJesusvicoLotDetail(raw.html, lotSourceUrl);
	},
};
