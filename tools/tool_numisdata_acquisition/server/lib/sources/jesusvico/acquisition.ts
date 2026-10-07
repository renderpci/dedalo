import { DedaloError } from '../../../../../../src/core/errors/dedalo_error.ts';
import { harvestFetch } from '../../../../../../src/core/harvest/harvest.ts';
import { looksBlocked } from '../../acquisition/block-signals.ts';
import type { AcquisitionProgress, MultiPageAcquisition, RawSource } from '../types.ts';
import { jesusvicoLotIdentifier, parseJesusvicoAuctionNumber } from './identifiers.ts';
import { parseJesusvicoTotalPages } from './parser.ts';

const MAX_PAGES = 50;
const JESUSVICO_HOSTS = ['jesusvico.com'];

async function fetchJesusvicoPage(
	url: string,
	onWait?: (ms: number, origin: string) => void,
): Promise<RawSource> {
	const response = await harvestFetch({
		url,
		hosts: JESUSVICO_HOSTS,
		requireHttps: true,
		headers: { Accept: 'text/html,application/xhtml+xml' },
		onWait,
	});
	if (!response.ok) {
		throw new DedaloError('external.http_status', {
			coordinates: { source: 'jesusvico', url, status: response.status },
		});
	}
	const html = response.text();
	// A Cloudflare/CAPTCHA interstitial is commonly served as a plain 2xx, so response.ok alone
	// does not mean "this is the real page" - silently parsing it produced an empty-looking result
	// with no signal anything was wrong (review item: "block-signals.ts is never imported").
	if (response.headers['cf-mitigated'] || looksBlocked(html)) {
		throw new DedaloError('external.protocol', {
			coordinates: {
				source: 'jesusvico',
				url,
				cf_mitigated: response.headers['cf-mitigated'] ?? '',
			},
		});
	}
	return {
		html,
		finalUrl: response.url,
		httpStatus: response.status,
		contentType: response.contentType,
	};
}

/**
 * jesusvico.com is fully permissive in robots.txt and server-renders plain HTML - no SPA/JSON API
 * to reverse-engineer, no exception needed (unlike sixbid). Fetches through the harvesting door.
 */
export async function acquireJesusvicoAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = parseJesusvicoAuctionNumber(rawUrl);
	if (!auctionIdentifier) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Please provide a valid jesusvico.com auction URL (missing auction number).',
		});
	}

	const onWait = (ms: number, origin: string): void => {
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`);
	};

	const first = await fetchJesusvicoPage(rawUrl, onWait);
	const pages: RawSource[] = [first];
	const totalPages = Math.min(parseJesusvicoTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(first.finalUrl);
		pageUrl.searchParams.set('page', String(p));
		const page = await fetchJesusvicoPage(pageUrl.toString(), onWait);
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
		throw new DedaloError('request.invalid_options', {
			publicMessage: 'Please provide a valid jesusvico.com lot URL.',
		});
	}

	const page = await fetchJesusvicoPage(rawUrl, (ms, origin) =>
		onProgress?.(0, 0, `Waiting ${Math.round(ms / 1000)}s for ${origin}`),
	);
	onProgress?.(1, 1);

	return { auctionIdentifier, pages: [page], method: 'http' };
}
