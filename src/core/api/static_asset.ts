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
import { config } from '../../config/config.ts';

/**
 * The enforcing Content-Security-Policy for app responses (XSS-02, 2026-07-28
 * audit). The SECURITY-CRITICAL property is the ABSENCE of `'unsafe-inline'`
 * (and `'unsafe-hashes'`) from `script-src`: that is what neutralises stored
 * XSS — an injected `<img onerror=…>` / inline `<script>` / `javascript:` URL
 * (component_text_area is CKEditor rich-text, so HTML rides the wire) cannot
 * execute, exactly the compensating control the retired PHP engine shipped and
 * the TS rewrite had dropped. Enforced in-process here (deterministic — not
 * dependent on a reverse-proxy `mod_headers`).
 *
 * Allowances mirror the client's real needs (proven by the PHP policy):
 * `style-src 'unsafe-inline'` (CKEditor + inline style=), external map-tile
 * hosts in `img-src` (Leaflet), `blob:`/`data:` for generated media, workers
 * from `blob:`. Two IMPROVEMENTS over the PHP policy: (1) NO third-party origin
 * in `script-src`/`connect-src` — the jsdelivr/huggingface allowances are gone,
 * aligning with the no-remote-code invariant (RC-01); local in-browser models
 * (browser_whisper) load from this install's own /dedalo/ai_models store.
 * `'unsafe-eval'` stays for the onnxruntime/transformers WASM glue (the active
 * transcription feature) — it does NOT weaken the XSS control above (that rests
 * on no-unsafe-inline); tightening it to `'wasm-unsafe-eval'` is a follow-up
 * once the in-browser AI tools are verified under it. The importmap hash is the
 * sha256 of the ONE inline script the page ships (index.html importmap); the
 * xss_csp_tripwire recomputes it so an edit to that block cannot silently break
 * module resolution.
 */
/**
 * The install's OWN media origin, when `DEDALO_MEDIA_WEB_BASE` is an absolute
 * URL on a different origin than the app (a separate Apache/nginx or CDN
 * serving `/dedalo/media` — the recommended production layout). The browser
 * loads video/audio/posterframes/subtitles from it, and the transcription tool
 * fetches the recognition WAV from it, so it must appear in `media-src`,
 * `img-src` and `connect-src` — WITHOUT it, a split-origin install plays no
 * media at all ("violates media-src 'self'", observed live 2026-07-29, the day
 * after this CSP landed). `script-src` NEVER gets it: media hosts serve bytes,
 * not code, and the stored-XSS control must not depend on the media server's
 * hygiene. Empty string when the base is relative (same-origin) — the common
 * dev case, where 'self' already covers it.
 */
export const MEDIA_CSP_ORIGIN: string = (() => {
	const base = config.media.webBase;
	if (!/^https?:\/\//.test(base)) return '';
	try {
		return new URL(base).origin;
	} catch {
		return '';
	}
})();

/** Append the configured media origin to one directive's source list. */
const withMedia = (sources: string): string =>
	MEDIA_CSP_ORIGIN === '' ? sources : `${sources} ${MEDIA_CSP_ORIGIN}`;

export const APP_CSP =
	"default-src 'self'; " +
	"script-src 'self' 'unsafe-eval' blob: 'sha256-YeRfUXP7gY4V7v/uefS4JIBm3BthshUSvAd69Hmer+U='; " +
	"worker-src 'self' blob:; " +
	"style-src 'self' 'unsafe-inline'; " +
	`img-src ${withMedia("'self' data: blob:")} *.tile.openstreetmap.org *.tile.osm.org *.basemaps.cartocdn.com server.arcgisonline.com dh.gu.se; ` +
	`media-src ${withMedia("'self' blob:")}; ` +
	"font-src 'self' data:; " +
	`connect-src ${withMedia("'self' blob:")}; ` +
	"frame-src 'self' blob:; " +
	"frame-ancestors 'self'; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'";

/**
 * Baseline security response headers (L6) applied to every app response.
 * `nosniff` stops MIME-confusion; the frame/referrer headers are safe defaults;
 * the CSP (APP_CSP) is the XSS-02 control. Media responses spread these FIRST
 * and then their own stricter `default-src 'none'; sandbox` CSP, which wins.
 * Single definition — server.ts and tools/serving.ts import it.
 */
export const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Content-Security-Policy': APP_CSP,
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
