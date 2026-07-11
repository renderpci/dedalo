/**
 * Shared static-asset HTTP semantics for the Bun listeners (dev TCP + unix
 * socket fallback): stat-derived validators (ETag/Last-Modified), conditional
 * 304s, per-type Cache-Control, and negotiated gzip with a process-lifetime
 * compressed-bytes cache. Pattern: component_text_area/tag_endpoint.ts (the
 * in-repo ETag/If-None-Match precedent), generalized to on-disk files.
 *
 * PRODUCTION NOTE: nginx owns client statics in the socket topology
 * (engineering/PRODUCTION.md §reverse-proxy) — these headers are the dev/fallback
 * path AND the reference behavior the proxy block mirrors. The 2026-07-09 boot
 * probe measured the gap this closes: TS served 0/25 boot files with
 * validators while the PHP oracle's Apache answered 25/25 conditionals 304.
 *
 * The client tree is re-synced IN PLACE (scripts/sync_client.sh), so client
 * files are NOT content-hashed: text/code assets get `Cache-Control: no-cache`
 * (always revalidate — a 304 costs one RTT, a stale module is a broken
 * client; the client's service worker replays If-None-Match, worker_cache.js),
 * static media a short public max-age. Never `immutable` here.
 */

import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

/**
 * Baseline security response headers (L6) applied to every response. `nosniff`
 * stops MIME-confusion; the frame/referrer headers are safe defaults that don't
 * risk breaking the vendored client (a full Content-Security-Policy is left to
 * the reverse proxy, which can be tuned/tested against the client without a
 * redeploy). Single definition — server.ts and tools/serving.ts import it.
 */
export const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Re-synced-in-place text/code assets: always revalidate (cheap 304s). */
const REVALIDATE_CACHE = 'no-cache';
/** Fonts/images: short public max-age (still validator-refreshed after). */
const STATIC_MEDIA_CACHE = 'public, max-age=3600';

/** Extensions whose staleness breaks the client — always revalidate. */
const REVALIDATE_EXTENSIONS: ReadonlySet<string> = new Set([
	'.js',
	'.mjs',
	'.css',
	'.html',
	'.json',
	'.map',
	'.less',
]);

/** Text-ish payloads worth gzipping (fonts/images are already compressed). */
const COMPRESSIBLE_EXTENSIONS: ReadonlySet<string> = new Set([
	'.js',
	'.mjs',
	'.css',
	'.html',
	'.json',
	'.map',
	'.less',
	'.svg',
	'.txt',
	'.xml',
	'.wasm',
]);

/** Below this size gzip overhead outweighs the byte savings. */
const MIN_GZIP_BYTES = 1024;

/**
 * Process-lifetime compressed-bytes cache, keyed by absolute path. NOT a
 * factory cache: content derives from FILES, not dd_ontology/record data —
 * entries self-evict when the stat-derived ETag diverges (file re-synced),
 * bounded by the servable client tree. Allowlisted in
 * module_state_tripwire.test.ts with this lifecycle.
 */
const gzipCache = new Map<string, { etag: string; bytes: Uint8Array }>();

/** Stat-derived strong-enough validator: size + mtime (no per-request hashing). */
function etagFor(size: number, mtimeMs: number): string {
	return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/**
 * Serve one on-disk asset with validators, conditional 304s, Cache-Control and
 * negotiated gzip. Returns null when the path is missing or not a regular file
 * (callers 404 fail-closed without an existence leak). `extraHeaders` rides on
 * every response variant (200, 304, gzip).
 */
export async function staticAssetResponse(
	fullPath: string,
	request: Request,
	extraHeaders: Record<string, string> = SECURITY_HEADERS,
): Promise<Response | null> {
	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(fullPath);
	} catch {
		return null;
	}
	if (!fileStat.isFile()) return null;

	const extension = extname(fullPath).toLowerCase();
	const etag = etagFor(fileStat.size, fileStat.mtimeMs);
	const lastModified = new Date(fileStat.mtimeMs).toUTCString();
	const compressible = COMPRESSIBLE_EXTENSIONS.has(extension);

	const baseHeaders: Record<string, string> = {
		...extraHeaders,
		ETag: etag,
		'Last-Modified': lastModified,
		'Cache-Control': REVALIDATE_EXTENSIONS.has(extension) ? REVALIDATE_CACHE : STATIC_MEDIA_CACHE,
	};
	// Compressible responses vary by encoding even when served identity, so an
	// intermediary never hands a gzipped body to a client that didn't ask.
	if (compressible) baseHeaders.Vary = 'Accept-Encoding';

	// Conditional revalidation. If-None-Match wins over If-Modified-Since
	// (RFC 9110 §13.1.3); the date compare is second-granular (HTTP dates).
	const ifNoneMatch = request.headers.get('if-none-match');
	if (ifNoneMatch !== null) {
		if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: baseHeaders });
	} else {
		const ifModifiedSince = request.headers.get('if-modified-since');
		if (ifModifiedSince !== null) {
			const sinceMs = Date.parse(ifModifiedSince);
			if (!Number.isNaN(sinceMs) && Math.floor(fileStat.mtimeMs / 1000) * 1000 <= sinceMs) {
				return new Response(null, { status: 304, headers: baseHeaders });
			}
		}
	}

	const file = Bun.file(fullPath);

	// Negotiated gzip for text payloads worth compressing.
	const acceptsGzip = (request.headers.get('accept-encoding') ?? '').includes('gzip');
	if (compressible && acceptsGzip && fileStat.size > MIN_GZIP_BYTES) {
		let entry = gzipCache.get(fullPath);
		if (entry === undefined || entry.etag !== etag) {
			entry = { etag, bytes: Bun.gzipSync(new Uint8Array(await file.arrayBuffer())) };
			gzipCache.set(fullPath, entry);
		}
		return new Response(entry.bytes as BodyInit, {
			headers: {
				...baseHeaders,
				'Content-Type': file.type,
				'Content-Encoding': 'gzip',
			},
		});
	}

	// Identity: Bun streams the file and derives Content-Type/Content-Length.
	return new Response(file, { headers: baseHeaders });
}
