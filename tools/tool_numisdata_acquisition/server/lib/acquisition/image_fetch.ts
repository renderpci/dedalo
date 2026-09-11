/**
 * Image byte download — the same conservative-fetch discipline as page
 * acquisition (https + host allowlist, rate limiting, size limit), adapted
 * from `coins`' `image-downloader.ts` to return bytes in memory instead of
 * writing to that standalone app's own `data/images/` folder: here the bytes
 * go straight into Dédalo's own upload-staging path (see server/index.ts).
 *
 * Only jesusvico.com is wired up so far, matching the one source adapter
 * this tool ports.
 */

import { waitForTurn } from './rate-limit.ts';
import { getCrawlDelayMs } from './robots.ts';
import { assertSafeJesusvicoUrl } from './url-safety.ts';
import { USER_AGENT } from './user-agent.ts';

export class ImageDownloadError extends Error {}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

export interface DownloadedImage {
	bytes: Uint8Array;
	contentType: string;
}

export async function downloadImageBytes(sourceUrl: string): Promise<DownloadedImage> {
	const url = assertSafeJesusvicoUrl(sourceUrl);
	const crawlDelay = await getCrawlDelayMs(url);
	await waitForTurn(url.hostname, crawlDelay ?? undefined);

	const response = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
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

/** Extension from the URL's own path, falling back to the sniffed content-type. */
export function extensionFromUrl(url: string, contentType: string): string {
	try {
		const pathname = new URL(url).pathname;
		const dot = pathname.lastIndexOf('.');
		if (dot > 0) return pathname.slice(dot + 1).toLowerCase();
	} catch {
		// fall through to content-type
	}
	if (contentType.includes('png')) return 'png';
	if (contentType.includes('webp')) return 'webp';
	return 'jpg';
}
