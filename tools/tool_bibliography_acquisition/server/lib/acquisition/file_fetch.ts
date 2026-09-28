/**
 * Binary file download (PDF, cover image, ...) - the same conservative-fetch discipline as page
 * acquisition (https + SSRF check on every redirect hop, rate limiting, size limit). Source-agnostic:
 * the caller passes the adapter's own `assertSafeUrl` and an accepted content-type prefix.
 *
 * Redirects are followed manually, each hop re-checked through `assertSafeUrl`: `fetch()`'s default
 * auto-follow only validates the FIRST url, so a server can 302 a request that passed the check to
 * an internal address and have the bytes fetched from inside the network anyway (SSRF).
 */

import { waitForTurn } from './rate-limit.ts';
import { getCrawlDelayMs } from './robots.ts';
import { USER_AGENT } from './user-agent.ts';

export class FileDownloadError extends Error {}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export interface DownloadedFile {
	bytes: Uint8Array;
	contentType: string;
}

export async function downloadFileBytes(
	sourceUrl: string,
	assertSafeUrl: (rawUrl: string) => Promise<URL>,
	acceptedContentTypePrefix: string,
): Promise<DownloadedFile> {
	let currentUrl = await assertSafeUrl(sourceUrl);

	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
		const crawlDelay = await getCrawlDelayMs(currentUrl);
		await waitForTurn(currentUrl.hostname, crawlDelay ?? undefined);

		const response = await fetch(currentUrl, {
			redirect: 'manual',
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			if (!location) {
				throw new FileDownloadError(
					`Redirected without a Location header (HTTP ${response.status}).`,
				);
			}
			currentUrl = await assertSafeUrl(new URL(location, currentUrl).href);
			continue;
		}

		if (!response.ok) {
			throw new FileDownloadError(`Could not download file (HTTP ${response.status}).`);
		}
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.startsWith(acceptedContentTypePrefix)) {
			throw new FileDownloadError(`Expected ${acceptedContentTypePrefix}*, got "${contentType}".`);
		}
		const bytes = await readWithLimit(response, MAX_FILE_BYTES);
		return { bytes, contentType };
	}

	throw new FileDownloadError('Too many redirects.');
}

async function readWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array();
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
				throw new FileDownloadError('File exceeded the size limit.');
			}
			chunks.push(value);
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}
