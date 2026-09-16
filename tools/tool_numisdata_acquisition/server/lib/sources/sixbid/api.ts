import { createHash } from 'node:crypto';
import { AcquisitionBlockedError, type RawSource } from '../../acquisition/http.ts';
import { waitForTurn } from '../../acquisition/rate-limit.ts';
import { assertSafeSixbidUrl } from '../../acquisition/url-safety.ts';
import { USER_AGENT } from '../../acquisition/user-agent.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 50;

export class SixbidArchivedError extends Error {
	constructor(
		message = "This auction has moved to sixbid's separate coin-archive site, which this app does not fetch from.",
	) {
		super(message);
		this.name = 'SixbidArchivedError';
	}
}

/**
 * Parses a sixbid.com browser URL like .../en/heritage-auctions-inc/13977/page/1/perPage/100 into
 * the companySlug + numeric auctionId the backing JSON API needs. Tolerates an optional 2-letter
 * locale prefix and ignores trailing /page/N/perPage/N segments - pagination is driven by our own
 * loop against the API's own total_pages, not whatever page the user happened to be on.
 */
export function parseSixbidUrl(rawUrl: string): { companySlug: string; auctionId: string } | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/sixbid\.com$/i.test(url.hostname)) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	const companySlug = segments[start];
	const auctionId = segments[start + 1];
	if (!companySlug || !auctionId || !/^\d+$/.test(auctionId)) return null;

	return { companySlug, auctionId };
}

interface SixbidApiResponse {
	success?: false;
	limit: number;
	current: number;
	total_pages: number;
	total_items: number;
	items: Record<string, unknown>[];
}

/**
 * Fetches one page of a sixbid auction's lots from the backing JSON API. Deliberately does not
 * consult robots.txt - lots.sixbid.com's robots.txt is a blanket "Disallow: /" for all agents
 * (confirmed live). Explicitly raised to and authorized by the user for this Dédalo integration.
 * Every other conservative discipline still applies: https-only allowlist, SSRF checks, rate
 * limiting, size/time bounds.
 */
async function fetchSixbidLotsPage(
	companySlug: string,
	auctionId: string,
	page: number,
): Promise<{ raw: RawSource; parsed: SixbidApiResponse }> {
	const apiUrl = new URL(`https://lots.sixbid.com/v2/${companySlug}/${auctionId}/`);
	apiUrl.searchParams.set('page', String(page));
	apiUrl.searchParams.set('orderCol', 'lot_number');
	apiUrl.searchParams.set('orderDirection', 'asc');
	apiUrl.searchParams.set('lang', 'en');

	assertSafeSixbidUrl(apiUrl.toString());
	await waitForTurn(apiUrl.hostname);

	const response = await fetch(apiUrl, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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

	const text = await readBodyWithLimit(response, MAX_BODY_BYTES);
	let parsed: SixbidApiResponse;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new AcquisitionBlockedError('The sixbid API returned an unexpected response.');
	}

	if (parsed.success === false) {
		throw new SixbidArchivedError();
	}

	return {
		raw: {
			html: text,
			finalUrl: apiUrl.toString(),
			httpStatus: response.status,
			contentType: response.headers.get('content-type'),
		},
		parsed,
	};
}

/**
 * Walks a sixbid auction's pagination (driven by the API's own total_pages, capped at MAX_PAGES
 * like the Biddr equivalent) and returns every page's raw JSON text.
 */
export async function acquireSixbidAuction(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const parsedUrl = parseSixbidUrl(rawUrl);
	if (!parsedUrl) {
		throw new AcquisitionBlockedError('Please provide a valid sixbid.com auction URL.');
	}
	const { companySlug, auctionId } = parsedUrl;

	const first = await fetchSixbidLotsPage(companySlug, auctionId, 1);
	const pages: RawSource[] = [first.raw];

	const totalPages = Math.min(first.parsed.total_pages, MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const next = await fetchSixbidLotsPage(companySlug, auctionId, p);
		pages.push(next.raw);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier: auctionId, pages, method: 'http' };
}

export interface SixbidSearchParams {
	term: string;
	currency: string | null;
}

/**
 * Detects a sixbid.com site-wide search URL, e.g. .../en/lots/page/1/perPage/100?term=madrid -
 * the browser route for "search every company's lots", distinct from a single auction's own
 * /{company}/{auctionId} listing. The `/lots` segment is the unambiguous signal - a real
 * companySlug is never literally "lots".
 */
export function parseSixbidSearchUrl(rawUrl: string): SixbidSearchParams | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (!/sixbid\.com$/i.test(url.hostname)) return null;

	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	if (segments[start] !== 'lots') return null;

	const term = url.searchParams.get('term');
	if (!term) return null;

	return { term, currency: url.searchParams.get('currency') };
}

/**
 * A stable, deterministic identifier for a search (dedupe + on-disk storage key) - a hash of the
 * normalized, sorted query string, since search terms can contain unicode unsafe for a directory
 * name.
 */
export function sixbidSearchIdentifier(rawUrl: string): string | null {
	const params = parseSixbidSearchUrl(rawUrl);
	if (!params) return null;
	const entries: [string, string][] = [
		['term', params.term],
		['currency', params.currency ?? ''],
	];
	const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
	const normalized = new URLSearchParams(sorted).toString();
	return createHash('sha256').update(normalized, 'utf-8').digest('hex').slice(0, 16);
}

// Fixed page size for search pagination, independent of whatever /perPage/N the pasted browser
// URL carried - we drive our own pagination loop. Matches the 100-lots/page default confirmed
// live for sixbid's per-auction listing endpoint.
const SEARCH_PAGE_LIMIT = 100;

/**
 * Fetches one page of a site-wide sixbid search from the same JSON API as fetchSixbidLotsPage,
 * but hit bare (no companySlug/auctionId) with `term`/`currency` query params instead - confirmed
 * live (2026-09), returning results grouped by the real auction each lot belongs to (unlike the
 * per-auction endpoint's flat `items[]`); see parser.ts's parseSixbidSearchLots, which flattens it
 * back out. Same robots.txt exception as fetchSixbidLotsPage above.
 */
async function fetchSixbidSearchPage(
	term: string,
	currency: string | null,
	page: number,
): Promise<{ raw: RawSource; parsed: SixbidApiResponse }> {
	const apiUrl = new URL('https://lots.sixbid.com/v2/');
	apiUrl.searchParams.set('term', term);
	if (currency) apiUrl.searchParams.set('currency', currency);
	apiUrl.searchParams.set('page', String(page));
	apiUrl.searchParams.set('limit', String(SEARCH_PAGE_LIMIT));
	apiUrl.searchParams.set('groupByAuction', '1');
	apiUrl.searchParams.set('orderCol', 'auction');
	apiUrl.searchParams.set('orderDirection', 'asc');
	apiUrl.searchParams.set('lang', 'en');

	assertSafeSixbidUrl(apiUrl.toString());
	await waitForTurn(apiUrl.hostname);

	const response = await fetch(apiUrl, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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

	const text = await readBodyWithLimit(response, MAX_BODY_BYTES);
	let parsed: SixbidApiResponse;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new AcquisitionBlockedError('The sixbid API returned an unexpected response.');
	}

	return {
		raw: {
			html: text,
			finalUrl: apiUrl.toString(),
			httpStatus: response.status,
			contentType: response.headers.get('content-type'),
		},
		parsed,
	};
}

/**
 * Walks a sixbid search's pagination the same way acquireSixbidAuction walks an auction's - driven
 * by the API's own total_pages (itself driven by total matching lots / SEARCH_PAGE_LIMIT, capped
 * at MAX_PAGES).
 */
export async function acquireSixbidSearch(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const parsedUrl = parseSixbidSearchUrl(rawUrl);
	const auctionIdentifier = sixbidSearchIdentifier(rawUrl);
	if (!parsedUrl || !auctionIdentifier) {
		throw new AcquisitionBlockedError('Please provide a valid sixbid.com search URL.');
	}

	const first = await fetchSixbidSearchPage(parsedUrl.term, parsedUrl.currency, 1);
	const pages: RawSource[] = [first.raw];

	const totalPages = Math.min(first.parsed.total_pages, MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const next = await fetchSixbidSearchPage(parsedUrl.term, parsedUrl.currency, p);
		pages.push(next.raw);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier, pages, method: 'http' };
}

/**
 * Extracts a single-lot URL's companySlug/auctionId/lotId, e.g.
 * .../en/heritage-auctions-inc/13977/argentina-la-rioja/12399926/la-rioja-... . The lot id is the
 * first purely-numeric path segment after the auction id (the category-slug between them is never
 * all-digits). Bails out if the next segment is literally "page" (a full-auction listing URL like
 * `.../13977/page/1/perPage/100`) - otherwise the "1" in "/page/1/" would look like a lot id.
 */
export function parseSixbidLotUrl(
	rawUrl: string,
): { companySlug: string; auctionId: string; lotId: string } | null {
	const base = parseSixbidUrl(rawUrl);
	if (!base) return null;

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	const segments = url.pathname.split('/').filter(Boolean);
	const start = segments[0] && /^[a-z]{2}$/i.test(segments[0]) ? 1 : 0;
	const rest = segments.slice(start + 2);
	if (rest[0] === 'page' || rest[0] === 'perPage') return null;

	const lotId = rest.find((seg) => /^\d+$/.test(seg));
	if (!lotId) return null;

	return { companySlug: base.companySlug, auctionId: base.auctionId, lotId };
}

/** A stable identifier for a single-lot retrieval, distinct from the full auction's own numeric id. */
export function sixbidLotIdentifier(rawUrl: string): string | null {
	const parsed = parseSixbidLotUrl(rawUrl);
	return parsed ? `lot-${parsed.lotId}` : null;
}

/**
 * Fetches one lot directly from sixbid's single-lot endpoint (`/v2/{company}/{auction}/{lotId}/`),
 * confirmed live to return the lot's full fields unwrapped, same as a listing page's `items[]`
 * entry. Same robots.txt exception as fetchSixbidLotsPage above.
 */
async function fetchSixbidSingleLot(
	companySlug: string,
	auctionId: string,
	lotId: string,
): Promise<RawSource> {
	const apiUrl = new URL(`https://lots.sixbid.com/v2/${companySlug}/${auctionId}/${lotId}/`);
	assertSafeSixbidUrl(apiUrl.toString());
	await waitForTurn(apiUrl.hostname);

	const response = await fetch(apiUrl, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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

	const text = await readBodyWithLimit(response, MAX_BODY_BYTES);
	let parsed: { success?: false; lotId?: number };
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new AcquisitionBlockedError('The sixbid API returned an unexpected response.');
	}
	if (parsed.success === false || typeof parsed.lotId !== 'number') {
		throw new SixbidArchivedError();
	}

	return {
		html: text,
		finalUrl: apiUrl.toString(),
		httpStatus: response.status,
		contentType: response.headers.get('content-type'),
	};
}

/** Acquires a single sixbid.com lot - one request, no pagination. */
export async function acquireSixbidLot(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const parsed = parseSixbidLotUrl(rawUrl);
	if (!parsed) {
		throw new AcquisitionBlockedError('Please provide a valid sixbid.com lot URL.');
	}

	const page = await fetchSixbidSingleLot(parsed.companySlug, parsed.auctionId, parsed.lotId);
	onProgress?.(1, 1);

	return { auctionIdentifier: `lot-${parsed.lotId}`, pages: [page], method: 'http' };
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
