/**
 * Image byte download — the same conservative-fetch discipline as page
 * acquisition (https + host allowlist, rate limiting, size limit). Source-
 * agnostic: the caller passes the SourceAdapter's own `assertSafeUrl`, whose
 * allowlist already covers that source's image/CDN hosts.
 *
 * Redirects are followed manually, each hop re-checked through `assertSafeUrl`:
 * `fetch()`'s default auto-follow only validates the FIRST url, so a server
 * could 302 a request that passed the allowlist off it. Lower severity here
 * than the bibliography tool's equivalent (the allowlist still constrains the
 * FIRST hop), but the same fix either way.
 */

import { waitForTurn } from './rate-limit.ts';
import { getCrawlDelayMs } from './robots.ts';
import { USER_AGENT } from './user-agent.ts';

export class ImageDownloadError extends Error {}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

export interface DownloadedImage {
	bytes: Uint8Array;
	contentType: string;
}

export async function downloadImageBytes(
	sourceUrl: string,
	assertSafeUrl: (rawUrl: string) => URL,
): Promise<DownloadedImage> {
	let currentUrl = assertSafeUrl(sourceUrl);

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
				throw new ImageDownloadError(
					`Redirected without a Location header (HTTP ${response.status}).`,
				);
			}
			currentUrl = assertSafeUrl(new URL(location, currentUrl).href);
			continue;
		}

		if (!response.ok) {
			throw new ImageDownloadError(`Could not download image (HTTP ${response.status}).`);
		}
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.startsWith('image/')) {
			throw new ImageDownloadError('Remote content is not an image.');
		}
		const bytes = await readWithLimit(response, MAX_IMAGE_BYTES);
		return { bytes, contentType };
	}

	throw new ImageDownloadError('Too many redirects.');
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
				throw new ImageDownloadError('Image exceeded the size limit.');
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

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/tiff': 'tif',
};

/**
 * Extension from the server's own content-type first, falling back to the
 * URL's last path segment. The URL alone was unreliable: `lastIndexOf('.')`
 * over the WHOLE path matched the wrong thing on a versioned path
 * (`/v1.2/img/123` -> "2/img/123") or a query-string id (`/image.php?id=5`
 * -> "php"), and receiveUpload rejects whatever came out, failing that lot's
 * image import. `url` is already a successfully-downloaded URL by this point
 * (downloadImageBytes only returns on success), so no try/catch is needed.
 */
export function extensionFromUrl(url: string, contentType: string): string {
	const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
	const byMimeType = EXTENSION_BY_MIME_TYPE[mime];
	if (byMimeType !== undefined) return byMimeType;

	const lastSegment = new URL(url).pathname.split('/').pop() ?? '';
	const dot = lastSegment.lastIndexOf('.');
	const extension = dot > 0 ? lastSegment.slice(dot + 1).toLowerCase() : '';
	return /^(?:jpe?g|png|webp|tiff?)$/.test(extension) ? extension : 'jpg';
}
