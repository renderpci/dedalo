import {
	AcquisitionBlockedError,
	type FetchPageOptions,
	fetchPublicPage,
	type RawSource,
} from '../../acquisition/http.ts';
import { assertSafeJesusvicoUrl } from '../../acquisition/url-safety.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';
import { parseJesusvicoTotalPages } from './parser.ts';

const MAX_PAGES = 50;

export const JESUSVICO_FETCH_OPTIONS: FetchPageOptions = {
	assertSafeUrl: assertSafeJesusvicoUrl,
	allowRedirectHost: (hostname) => hostname === 'www.jesusvico.com' || hostname === 'jesusvico.com',
};

/**
 * jesusvico.com auction URLs embed the auction number as "I{n}" in the path (e.g.
 * ".../subasta-180-coleccion-segarra-vol-iii_I180-001" -> "180"). Confirmed live that the same
 * "I{n}" prefix also appears on every lot's own detail-page URL, but there it's shared across all
 * lots on that auction, not a per-lot id - only useful here for the auction number.
 */
export function parseJesusvicoAuctionNumber(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		const match = url.pathname.match(/I(\d+)/i);
		return match ? match[1]! : null;
	} catch {
		return null;
	}
}

/**
 * jesusvico.com lot detail URLs are "/{locale}/lot(e)?/I{auction}-X-X/{lotNumber}-Y-slug" -
 * confirmed live in both the English ("lot") and Spanish ("lote") locale path segments, so both
 * are matched rather than assuming "lot" alone. The lot number is the leading digits of the final
 * path segment.
 */
export function parseJesusvicoLotNumber(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		const match = url.pathname.match(/\/lote?\/[^/]+\/(\d+)/);
		return match ? match[1]! : null;
	} catch {
		return null;
	}
}

/** A stable identifier for a single-lot retrieval, distinct from the full auction's own number. */
export function jesusvicoLotIdentifier(rawUrl: string): string | null {
	const auctionNumber = parseJesusvicoAuctionNumber(rawUrl);
	const lotNumber = parseJesusvicoLotNumber(rawUrl);
	if (!auctionNumber || !lotNumber) return null;
	return `lot-${auctionNumber}-${lotNumber}`;
}

/**
 * jesusvico.com is fully permissive in robots.txt and server-renders plain HTML - no SPA/JSON API
 * to reverse-engineer, no robots.txt exception needed (unlike sixbid). Reuses http.ts's
 * fetchPublicPage, the same robots-respecting/rate-limited/block-signal-checked path Biddr uses.
 */
export async function acquireJesusvicoAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = parseJesusvicoAuctionNumber(rawUrl);
	if (!auctionIdentifier) {
		throw new AcquisitionBlockedError(
			'Please provide a valid jesusvico.com auction URL (missing auction number).',
		);
	}

	const first = await fetchPublicPage(rawUrl, JESUSVICO_FETCH_OPTIONS);
	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseJesusvicoTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(first.finalUrl);
		pageUrl.searchParams.set('page', String(p));
		const page = await fetchPublicPage(pageUrl.toString(), JESUSVICO_FETCH_OPTIONS);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}

/** Acquires a single jesusvico.com lot page - one request, no pagination. */
export async function acquireJesusvicoLot(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = jesusvicoLotIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new AcquisitionBlockedError('Please provide a valid jesusvico.com lot URL.');
	}

	const page = await fetchPublicPage(rawUrl, JESUSVICO_FETCH_OPTIONS);
	onProgress?.(1, 1);

	return { auctionIdentifier, pages: [page], method: 'http' };
}
