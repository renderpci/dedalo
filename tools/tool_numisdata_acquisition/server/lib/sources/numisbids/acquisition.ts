import { looksBlocked } from '../../acquisition/block-signals.ts';
import { AcquisitionBlockedError, type RawSource } from '../../acquisition/http.ts';
import { waitForTurn } from '../../acquisition/rate-limit.ts';
import { assertSafeNumisbidsUrl } from '../../acquisition/url-safety.ts';
import { USER_AGENT } from '../../acquisition/user-agent.ts';
import type { AcquisitionProgress, MultiPageAcquisition } from '../types.ts';
import { parseNumisbidsTotalPages } from './parser.ts';

export class UnsupportedPageError extends Error {
	constructor(message = 'This page does not appear to contain an auction catalogue.') {
		super(message);
		this.name = 'UnsupportedPageError';
	}
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 50;

/**
 * numisbids.com sale URLs are `/sale/{saleId}` (optionally with a `?pg=N` the site itself adds for
 * pagination, which we ignore and drive ourselves).
 */
export function parseNumisbidsSaleId(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		if (!/numisbids\.com$/i.test(url.hostname)) return null;
		const match = url.pathname.match(/^\/sale\/(\d+)/);
		return match ? match[1]! : null;
	} catch {
		return null;
	}
}

/**
 * Fetches a numisbids.com page. Deliberately does not consult robots.txt - numisbids.com's
 * robots.txt explicitly names and blocks ClaudeBot (Anthropic's own crawler), alongside Bytespider.
 * Explicitly raised to (and authorized by) the user for this Dédalo integration before porting -
 * not an assumption carried over from the standalone coins archive tool's own history. Never
 * identifies as ClaudeBot or any spoofed identity (USER_AGENT is the same honest, distinct string
 * every source uses), never bypasses a CAPTCHA, and stops immediately on any block signal rather
 * than retrying around it.
 */
export async function fetchNumisbidsPage(url: URL): Promise<RawSource> {
	assertSafeNumisbidsUrl(url.toString());
	await waitForTurn(url.hostname);

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
 * Walks a numisbids.com sale's pagination (`?pg=N`, driven by the page's own "Page X of Y" text,
 * capped at the same MAX_PAGES convention used elsewhere) and returns every page's raw HTML.
 */
export async function acquireNumisbidsSale(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const saleId = parseNumisbidsSaleId(rawUrl);
	if (!saleId) {
		throw new AcquisitionBlockedError('Please provide a valid numisbids.com sale URL.');
	}

	const firstUrl = assertSafeNumisbidsUrl(rawUrl);
	const first = await fetchNumisbidsPage(firstUrl);
	const pages: RawSource[] = [first];

	const totalPages = Math.min(parseNumisbidsTotalPages(first.html), MAX_PAGES);
	onProgress?.(1, totalPages);

	for (let p = 2; p <= totalPages; p++) {
		const pageUrl = new URL(`https://www.numisbids.com/sale/${saleId}`);
		pageUrl.searchParams.set('pg', String(p));
		const page = await fetchNumisbidsPage(pageUrl);
		pages.push(page);
		onProgress?.(p, totalPages);
	}

	return { auctionIdentifier: saleId, pages, method: 'http' };
}

/**
 * numisbids.com lot detail URLs are `/sale/{saleId}/lot/{lotNumber}` - the sale-scoped lot number
 * (resets per sale, unlike numisbids' own internal `lid` the page itself carries), used only to
 * build a stable single-lot retrieval identifier here.
 */
export function parseNumisbidsLotUrl(rawUrl: string): { saleId: string; lotNumber: string } | null {
	try {
		const url = new URL(rawUrl);
		if (!/numisbids\.com$/i.test(url.hostname)) return null;
		const match = url.pathname.match(/^\/sale\/(\d+)\/lot\/(\d+)/);
		if (!match) return null;
		return { saleId: match[1]!, lotNumber: match[2]! };
	} catch {
		return null;
	}
}

/** A stable identifier for a single-lot retrieval, distinct from the full sale's own numeric id. */
export function numisbidsLotIdentifier(rawUrl: string): string | null {
	const parsed = parseNumisbidsLotUrl(rawUrl);
	return parsed ? `lot-${parsed.saleId}-${parsed.lotNumber}` : null;
}

/** Acquires a single numisbids.com lot page - one request, no pagination. */
export async function acquireNumisbidsLot(
	rawUrl: string,
	onProgress?: AcquisitionProgress,
): Promise<MultiPageAcquisition> {
	const auctionIdentifier = numisbidsLotIdentifier(rawUrl);
	if (!auctionIdentifier) {
		throw new AcquisitionBlockedError('Please provide a valid numisbids.com lot URL.');
	}

	const url = assertSafeNumisbidsUrl(rawUrl);
	const page = await fetchNumisbidsPage(url);
	onProgress?.(1, 1);

	return { auctionIdentifier, pages: [page], method: 'http' };
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
