import { looksBlocked } from '../../acquisition/block-signals.ts';
import {
	AcquisitionBlockedError,
	type RawSource,
	RobotsDisallowedError,
} from '../../acquisition/http.ts';
import { waitForTurn } from '../../acquisition/rate-limit.ts';
import { getCrawlDelayMs, isAllowedByRobots } from '../../acquisition/robots.ts';
import { assertSafeAureoUrl } from '../../acquisition/url-safety.ts';
import { USER_AGENT } from '../../acquisition/user-agent.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';

export { RobotsDisallowedError };

export class UnsupportedPageError extends Error {
	constructor(message = 'This page does not appear to contain an auction catalogue.') {
		super(message);
		this.name = 'UnsupportedPageError';
	}
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 50;
const LOTS_PER_PAGE = 96;

/**
 * aureo.com auction URLs are `/en/subasta/{id}`. Most ids are a plain 4-digit number ("0466"), but
 * a multi-session auction's id has a hyphenated session suffix ("0200-1", confirmed live via
 * `data-auction="0200-1"` in the site's own AJAX calls) - both shapes are accepted.
 */
export function parseAureoAuctionId(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		if (!/(^|\.)aureo\.com$/i.test(url.hostname)) return null;
		const match = url.pathname.match(/^\/en\/subasta\/(\d+(?:-\d+)?)\/?$/);
		return match ? match[1]! : null;
	} catch {
		return null;
	}
}

/**
 * GET against a public aureo.com page. robots.txt is fully permissive here (`Allow: /`, confirmed
 * live), so this fully respects it and any crawl-delay - not reusing the shared fetchPublicPage
 * directly since aureo also needs a POST path below, sharing this same rate-limit/block logic.
 */
async function fetchAureoPage(url: URL): Promise<RawSource> {
	assertSafeAureoUrl(url.toString());

	const allowed = await isAllowedByRobots(url);
	if (!allowed) {
		throw new RobotsDisallowedError(`robots.txt disallows fetching ${url.pathname}`);
	}
	const crawlDelay = await getCrawlDelayMs(url);
	await waitForTurn(url.hostname, crawlDelay ?? undefined);

	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (response.status === 401 || response.status === 403 || response.status === 429) {
		throw new AcquisitionBlockedError(
			`Automatic retrieval could not safely access this page (HTTP ${response.status}).`,
			response.status,
		);
	}
	if (!response.ok) {
		throw new AcquisitionBlockedError(`Server returned HTTP ${response.status}.`, response.status);
	}

	const html = await readBodyWithLimit(response, MAX_BODY_BYTES);
	if (looksBlocked(html)) {
		throw new AcquisitionBlockedError(
			'The page appears to present a CAPTCHA or access restriction.',
		);
	}

	return {
		html,
		finalUrl: url.toString(),
		httpStatus: response.status,
		contentType: response.headers.get('content-type'),
	};
}

/**
 * aureo.com's lot listing isn't in the auction page's own HTML - the page ships an empty
 * `#auction-content` div and an inline script that POSTs to this endpoint to fill it in (confirmed
 * live by reading the site's own script.js). Same discipline as fetchAureoPage, just via POST.
 */
async function postAureoItems(params: Record<string, string>): Promise<RawSource> {
	const url = assertSafeAureoUrl('https://www.aureo.com/modules/loaditems.php');

	const allowed = await isAllowedByRobots(url);
	if (!allowed) {
		throw new RobotsDisallowedError(`robots.txt disallows fetching ${url.pathname}`);
	}
	const crawlDelay = await getCrawlDelayMs(url);
	await waitForTurn(url.hostname, crawlDelay ?? undefined);

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'User-Agent': USER_AGENT,
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Requested-With': 'XMLHttpRequest',
		},
		body: new URLSearchParams(params).toString(),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (response.status === 401 || response.status === 403 || response.status === 429) {
		throw new AcquisitionBlockedError(
			`Automatic retrieval could not safely access this page (HTTP ${response.status}).`,
			response.status,
		);
	}
	if (!response.ok) {
		throw new AcquisitionBlockedError(`Server returned HTTP ${response.status}.`, response.status);
	}

	const html = await readBodyWithLimit(response, MAX_BODY_BYTES);
	if (looksBlocked(html)) {
		throw new AcquisitionBlockedError(
			'The page appears to present a CAPTCHA or access restriction.',
		);
	}

	return {
		html,
		finalUrl: url.toString(),
		httpStatus: response.status,
		contentType: response.headers.get('content-type'),
	};
}

/** The "View All" link on an auction's shell page carries the full catalog-number range and total lot count. */
interface AureoAuctionRange {
	from: string;
	to: string;
	totalLots: number | null;
}

async function fetchAureoAuctionRange(auctionId: string): Promise<AureoAuctionRange> {
	const page = await fetchAureoPage(
		assertSafeAureoUrl(`https://www.aureo.com/en/subasta/${auctionId}`),
	);
	const viewAllIdx = page.html.indexOf('id="viewall"');
	if (viewAllIdx === -1) {
		throw new UnsupportedPageError();
	}
	const tagEnd = page.html.indexOf('>', viewAllIdx);
	const tag = page.html.slice(viewAllIdx, tagEnd === -1 ? undefined : tagEnd);
	const fromMatch = tag.match(/data-from="(\d+)"/);
	const toMatch = tag.match(/data-to="(\d+)"/);
	if (!fromMatch || !toMatch) {
		throw new UnsupportedPageError();
	}
	const badgeMatch = page.html.slice(viewAllIdx, viewAllIdx + 400).match(/badge-light">(\d+)</);
	return {
		from: fromMatch[1]!,
		to: toMatch[1]!,
		totalLots: badgeMatch ? Number.parseInt(badgeMatch[1]!, 10) : null,
	};
}

/** True once a loaditems.php response has no "LOAD MORE LOTS" button - the last page for that query. */
function hasMorePages(html: string): boolean {
	return /loadmore/.test(html);
}

function baseAureoParams(auctionId: string, from: string, to: string): Record<string, string> {
	return {
		auction: auctionId,
		from,
		to,
		year: '',
		epoca: '',
		searchtext1: '',
		searchtext2: '',
		searchtext3: '',
		searchtext4: '',
		lote: '',
		historic: '0',
	};
}

/**
 * Walks one auction's lot pages (`pagina=0` implicit, then `1,2,...` while the previous response
 * still had a "LOAD MORE LOTS" button, capped at MAX_PAGES) and returns every page's raw HTML.
 */
async function acquireAureoAuctionPages(
	auctionId: string,
	onProgress?: AcquisitionProgress,
): Promise<RawSource[]> {
	const range = await fetchAureoAuctionRange(auctionId);
	const params = baseAureoParams(auctionId, range.from, range.to);

	const pages: RawSource[] = [];
	const estimatedPages = range.totalLots
		? Math.min(Math.ceil(range.totalLots / LOTS_PER_PAGE), MAX_PAGES)
		: MAX_PAGES;

	const first = await postAureoItems(params);
	pages.push(first);
	onProgress?.(1, estimatedPages);

	let more = hasMorePages(first.html);
	let pagina = 1;
	while (more && pagina < MAX_PAGES) {
		const page = await postAureoItems({ ...params, pagina: String(pagina) });
		pages.push(page);
		onProgress?.(pages.length, Math.max(estimatedPages, pages.length));
		more = hasMorePages(page.html);
		pagina += 1;
	}

	return pages;
}

/**
 * Acquires a single aureo.com auction (`/en/subasta/{id}`). The historical-archive `/en/precios/
 * {brand}/{year}` search is deliberately NOT ported yet, same reasoning as Biddr's search URL -
 * add it once the single-auction path is proven against real data.
 */
export async function acquireAureoAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionId = parseAureoAuctionId(rawUrl);
	if (!auctionId) {
		throw new AcquisitionBlockedError('Please provide a valid aureo.com auction URL.');
	}
	const pages = await acquireAureoAuctionPages(auctionId, onProgress);
	return { auctionIdentifier: auctionId, pages, method: 'http' };
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.byteLength;
			if (total > maxBytes) {
				reader.cancel();
				throw new AcquisitionBlockedError('Response body exceeded the size limit.');
			}
			chunks.push(value);
		}
	}
	return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
}
