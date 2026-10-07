import { DedaloError } from '../../../../../../src/core/errors/dedalo_error.ts';
import { numisbidsCanonicalLotUrl } from '../../acquisition/keys.ts';
import type { SourceAdapter } from '../types.ts';
import { urlHostname } from '../types.ts';
import { numisbidsLotIdentifier, parseNumisbidsSaleId } from './acquisition.ts';
import {
	parseNumisbidsAuction,
	parseNumisbidsLotDetail,
	parseNumisbidsLots,
	parseNumisbidsSingleLotAuction,
} from './parser.ts';

const NUMISBIDS_HOST_PATTERN = /(^|\.)numisbids\.com$/i;

/**
 * Adapter for numisbids.com - a normal sale URL (`/sale/{id}`) and a single-lot URL
 * (`/sale/{id}/lot/{n}`) are both handled here. The single-lot check must come before the sale-id
 * fallback, since a single-lot URL also matches the plain `/^\/sale\/(\d+)/` regex.
 *
 * Cannot be fetched automatically at all - numisbids.com's robots.txt explicitly blocks ClaudeBot
 * by name (confirmed live, HTTP 403 from multiple independent networks), so `acquire` always
 * refuses and the operator's saved-HTML path (preview_html) is the only way in (PR #114 review,
 * 2026-09-29 - the earlier "explicitly authorized by the user" bypass of that refusal is removed).
 *
 * NOT ported yet: the `/searchall?searchall=...` cross-auction search URL - add it once the
 * single-sale path is proven against real data, same reasoning as Biddr's search URL.
 */
export const numisbidsAdapter: SourceAdapter = {
	id: 'numisbids',
	sourceDomain: 'numisbids.com',
	// (sale, lot number) from the lot's own `/sale/{id}/lot/{n}` URL, id-carrying lots only (keys.ts).
	canonicalLotUrl: numisbidsCanonicalLotUrl,

	matchesUrl(rawUrl) {
		const hostname = urlHostname(rawUrl);
		return hostname !== null && NUMISBIDS_HOST_PATTERN.test(hostname);
	},

	parseAuctionIdentifier(rawUrl) {
		return numisbidsLotIdentifier(rawUrl) ?? parseNumisbidsSaleId(rawUrl);
	},

	acquire() {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage:
				'numisbids.com cannot be fetched automatically (its robots.txt blocks every automated agent) - use "Upload a saved HTML page" instead.',
		});
	},

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

	storageKey: (auctionIdentifier) => `numisbids-${auctionIdentifier}`,
};
