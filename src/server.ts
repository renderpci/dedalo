/**
 * Dédalo TS server — HTTP entry point.
 *
 * Bun.serve on a UNIX SOCKET only: the reverse proxy (Apache/Nginx) owns TCP,
 * serves static files/media, and forwards API traffic here (spec §4; same
 * pattern as the production diffusion engine).
 *
 * PERSISTENT-RUNTIME DISCIPLINE (spec §4, plan risk A5.1): every request gets
 * its own RequestContext created HERE and threaded explicitly through all
 * resolution code. Nothing request-dependent may live at module level. The
 * context object is the one place request identity exists.
 *
 * Routes:
 * - /health (liveness);
 * - /api/v1/json + /dedalo/core/api/v1/json[/] (parse → zod-validate →
 *   dispatch; auth/CSRF/allowlist gates live in core/api/dispatch.ts). The
 *   /dedalo alias is the path the COPIED CLIENT computes relatively from its
 *   page URL (data_manager fallback '../api/v1/json/');
 * - GET /dedalo/* — the copied client static assets (Phase 7 seam), served
 *   from client/dedalo/ at the SAME paths the PHP deployment uses so the
 *   client's relative references need no edits.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Glob } from 'bun';
import { runBootMigrations } from '../install/db/migrate.ts';
import { initRagHooks } from './ai/rag/bootstrap.ts';
import { config } from './config/config.ts';
import { projectRoot, readEnv } from './config/env.ts';
import { handleCountersRequest } from './core/api/counters.ts';
import { type ApiRequestContext, dispatchRqo } from './core/api/dispatch.ts';
import { handleEnvironmentView } from './core/api/environment_view.ts';
import { getProcessPoison } from './core/api/process_health.ts';
import { handleRawView } from './core/api/raw_view.ts';
import { SECURITY_HEADERS, staticAssetResponse } from './core/api/static_asset.ts';
import { CLIENT_LIB_URL_PREFIX, serveClientLibRequest } from './core/client_libs/serving.ts';
import { handleTagRequest } from './core/components/component_text_area/tag_endpoint.ts';
// S2-20 boot registration: loading the component registry registers the
// ontology↔components model lookup (module-load side effect) BEFORE any request
// resolves a component model. Keep this explicit even though other imports
// reach it transitively — the seam must not depend on incidental import paths.
import './core/components/registry.ts';
import { rqoSchema } from './core/concepts/rqo.ts';
import { SESSION_COOKIE, getSession } from './core/security/session_store.ts';
import { serveToolCommonRequest, serveToolsRequest } from './core/tools/serving.ts';

/** Absolute root of the copied client tree (see scripts/sync_client.sh). */
const CLIENT_ROOT = resolve(import.meta.dir, '../client/dedalo');

/**
 * Media directory (env MEDIA_PATH) served under /dedalo/<mediaDir>/ (the PHP
 * DEDALO_MEDIA_URL layout). In production the REVERSE PROXY serves media and
 * enforces the marker-based per-record access control (spec §7.9); this route is
 * a DEV-listener convenience only.
 *
 * SECURITY (M5): this route checks for a valid session but applies NO per-record
 * / per-project ACL — any authenticated user can read any file under the media
 * root by path. That is acceptable for a single-developer dev listener but a
 * horizontal data break if exposed. It is therefore OFF by default and must be
 * explicitly enabled with MEDIA_DEV_ROUTE_ENABLED=true (never in production —
 * production is socket-only and lets the reverse proxy + marker store serve media).
 */
const mediaPathValue = readEnv('MEDIA_PATH');
const MEDIA_ROOT = mediaPathValue !== undefined ? resolve(mediaPathValue) : null;
const MEDIA_URL_PREFIX = `/dedalo/${config.mediaDir}/`;

/** Whether the dev media route is enabled (read per-request so it stays togglable). */
function isMediaDevRouteEnabled(): boolean {
	return readEnv('MEDIA_DEV_ROUTE_ENABLED', 'false') === 'true';
}

/**
 * Transport-layer request metadata, created by the HTTP handler and threaded
 * explicitly (never stored globally). It deliberately carries ONLY id/timing —
 * the request's IDENTITY (session, principal, permissions, language) lives on
 * the API-layer `ApiRequestContext` (core/api/dispatch.ts) and, for the duration
 * of a handler, in the request-scoped AsyncLocalStorage contexts opened by
 * `dispatchRqo` (core/security/request_context.ts + core/resolve/request_lang.ts).
 * Keeping identity out of every module-level value is the §4 request-isolation
 * invariant.
 */
export interface RequestContext {
	/** Unique id for tracing/log correlation. */
	readonly requestId: string;
	/** Wall-clock start, for latency metrics. */
	readonly startedAt: number;
}

/** Exported for tests that call `handleRequest` directly (no socket). */
export function createRequestContext(): RequestContext {
	return {
		requestId: crypto.randomUUID(),
		startedAt: performance.now(),
	};
}

/**
 * Number of TRUSTED reverse-proxy hops in front of this server. The proxy chain
 * APPENDS one X-Forwarded-For entry per hop on the right, so the genuine client
 * address is the entry `TRUSTED_PROXY_HOPS` from the right — everything further
 * left is client-supplied and MUST NOT be trusted. Default 1 (the standard single
 * nginx/Apache in front). The reverse proxy must append (not replace-with-client)
 * XFF for this to hold — the production default.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(readEnv('TRUSTED_PROXY_HOPS', '1')) || 1);

/**
 * The client IP for throttle/audit — resolved from the TRUSTED hop of
 * X-Forwarded-For, never the spoofable left-most value. Taking the left-most
 * entry let an attacker rotate a fake XFF to mint a fresh login-throttle bucket
 * per request (brute-force bypass). This is never an authorization input.
 */
export function clientIpFromRequest(request: Request): string {
	const xff = request.headers.get('x-forwarded-for');
	if (xff === null || xff.trim() === '') return 'local';
	const parts = xff
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
	if (parts.length === 0) return 'local';
	// The trusted proxies own the right-most TRUSTED_PROXY_HOPS entries; the real
	// client is the entry the outermost trusted proxy appended (index len - hops).
	const index = Math.max(0, parts.length - TRUSTED_PROXY_HOPS);
	return parts[index] ?? parts[parts.length - 1] ?? 'local';
}

/** Parse the Content-Length header to a non-negative integer, else undefined. */
export function parseContentLength(header: string | null): number | undefined {
	if (header === null) return undefined;
	const value = Number(header);
	return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Whether to mark the session cookie `Secure` (M4). Default TRUE — the app must
 * not silently delegate this to the proxy; a single cleartext hop would leak the
 * token. Set SESSION_COOKIE_SECURE=false ONLY for a plaintext-localhost dev
 * listener (the browser drops a Secure cookie over http://).
 */
const SESSION_COOKIE_SECURE = readEnv('SESSION_COOKIE_SECURE', 'true') !== 'false';

/**
 * Explicit per-request body cap (M6) — replaces reliance on Bun's silent default.
 * Every JSON body and every single multipart chunk is fully buffered in this
 * long-lived process, so an unbounded body is a memory-exhaustion DoS. The
 * vendored client ALWAYS chunks large uploads, so a single request never needs
 * the full per-FILE cap (advertised separately by get_system_info); 256 MiB is
 * generous for one chunk while bounding abuse. Tune via SERVER_MAX_BODY_BYTES.
 */
const MAX_REQUEST_BODY_BYTES = Math.max(
	1,
	Number(readEnv('SERVER_MAX_BODY_BYTES', String(256 * 1024 * 1024))) || 256 * 1024 * 1024,
);

/** Assemble the session Set-Cookie header with consistent attributes. */
function sessionCookieHeader(value: string, options: { clear?: boolean } = {}): string {
	const attributes = ['HttpOnly', 'SameSite=Lax', 'Path=/'];
	if (SESSION_COOKIE_SECURE) attributes.push('Secure');
	if (options.clear === true) attributes.push('Max-Age=0');
	return `${SESSION_COOKIE}=${value}; ${attributes.join('; ')}`;
}

// SECURITY_HEADERS (L6, every response) now lives in core/api/static_asset.ts
// — one definition shared with the static handlers. Authenticated JSON
// additionally gets Cache-Control: no-store below.

/** JSON response helper with the standard envelope fields. */
function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
	});
}

/**
 * Serve one copied-client asset (GET /dedalo/*). Fail-closed: decoded paths are
 * resolved and must stay inside CLIENT_ROOT (traversal guard); anything missing
 * or outside is a plain 404. A directory path serves its index.html. Response
 * semantics (validators/304/Cache-Control/gzip) come from staticAssetResponse.
 */
async function serveClientAsset(pathname: string, request: Request): Promise<Response> {
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(pathname);
	} catch {
		return jsonResponse({ result: false, msg: 'Not found' }, 404);
	}
	// Strip the /dedalo prefix; map onto the client root.
	const relativePath = decodedPath.replace(/^\/dedalo\/?/, '');
	let fullPath = resolve(CLIENT_ROOT, relativePath);
	if (fullPath !== CLIENT_ROOT && !fullPath.startsWith(CLIENT_ROOT + sep)) {
		return jsonResponse({ result: false, msg: 'Not found' }, 404); // traversal attempt
	}
	// Directory (trailing slash or bare dir) → its index.html.
	if (decodedPath.endsWith('/') || !fullPath.split(sep).pop()?.includes('.')) {
		fullPath = resolve(fullPath, 'index.html');
	}
	const response = await staticAssetResponse(fullPath, request);
	return response ?? jsonResponse({ result: false, msg: 'Not found' }, 404);
}

/**
 * Ontology-master snapshot serving (UPDATE_PROCESS Phase 2): GET
 * /dedalo/install/import/ontology/<major.minor>/<file> — the PHP deployment
 * serves the IO dir as plain static files under DEDALO_INSTALL_URL; remote
 * installations (and this instance's own 'Local files' flow) download the
 * manifest's `.copy.gz` snapshots from here. Fail-closed: only when
 * IS_AN_ONTOLOGY_SERVER is set; only a version-shaped dir segment and an
 * allowlisted basename; resolved path confined under the IO dir.
 */
async function serveOntologyIoFile(pathname: string): Promise<Response> {
	const notFound = () => jsonResponse({ result: false, msg: 'Not found' }, 404);
	if (config.ontologyIo.isOntologyServer !== true) return notFound();
	const match = pathname.match(
		/^\/dedalo\/install\/import\/ontology\/(\d+\.\d+)\/([A-Za-z0-9_.-]+)$/,
	);
	if (match === null) return notFound();
	const [, version, fileName] = match as unknown as [string, string, string];
	if (
		!/^[a-z_]{2,}\.copy\.gz$/.test(fileName) &&
		fileName !== 'ontology.json' &&
		fileName !== 'ontology_llm_map.json'
	) {
		return notFound();
	}
	const baseDir = resolve(config.ops.ontologyDataIoDir, version);
	const fullPath = resolve(baseDir, fileName);
	if (!fullPath.startsWith(baseDir + sep)) return notFound();
	const file = Bun.file(fullPath);
	if (!(await file.exists())) return notFound();
	return new Response(file, {
		headers: {
			'Content-Type': fileName.endsWith('.json') ? 'application/json' : 'application/gzip',
			'Cache-Control': 'no-store',
			...SECURITY_HEADERS,
		},
	});
}

/** The API endpoint paths: the direct one and the copied client's relative path. */
const API_PATHS: ReadonlySet<string> = new Set([
	'/api/v1/json',
	'/dedalo/core/api/v1/json',
	'/dedalo/core/api/v1/json/',
]);

/**
 * The raw record data view — a dedicated, hard-locked GET endpoint (admin tool).
 * Distinct from API_PATHS: it does NOT accept an arbitrary RQO. The direct path
 * plus the client-relative twin (matching the API_PATHS pattern). See
 * core/api/raw_view.ts for the gates.
 */
const RAW_VIEW_PATHS: ReadonlySet<string> = new Set(['/api/v1/raw', '/dedalo/core/api/v1/raw']);

/**
 * The environment diagnostic view — a dedicated, session-gated GET endpoint
 * (developer tool). Replaces the PHP menu link to core/common/js/environment.js.php
 * (which the TS server can't run). Returns the get_environment payload as
 * pretty JSON. See core/api/environment_view.ts.
 */
const ENVIRONMENT_VIEW_PATHS: ReadonlySet<string> = new Set([
	'/api/v1/environment',
	'/dedalo/core/api/v1/environment',
]);

/**
 * DB reachability for /health (audit S3-48): a liveness-only probe reported
 * green during a total DB outage. Cached for 5 s so a tight watchdog cadence
 * never turns the health check itself into DB load; bounded by a 2 s race so
 * a wedged pool answers 503 instead of hanging the probe.
 */
// checkedAt starts at -Infinity: performance.now() is near ZERO at boot, so a
// 0 sentinel would satisfy the cache window and serve the initial ok:false
// without ever probing the database.
const dbHealth = { ok: false, checkedAt: Number.NEGATIVE_INFINITY };
const DB_HEALTH_CACHE_MS = 5000;
const DB_HEALTH_TIMEOUT_MS = 2000;
async function checkDbHealth(): Promise<boolean> {
	const now = performance.now();
	if (now - dbHealth.checkedAt < DB_HEALTH_CACHE_MS) return dbHealth.ok;
	dbHealth.checkedAt = now;
	try {
		const { sql } = await import('./core/db/postgres.ts');
		await Promise.race([
			sql.unsafe('SELECT 1', []),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('db health probe timed out')), DB_HEALTH_TIMEOUT_MS),
			),
		]);
		dbHealth.ok = true;
	} catch (error) {
		dbHealth.ok = false;
		console.error('[health] database check failed:', (error as Error).message);
	}
	return dbHealth.ok;
}

/** The admin counters endpoint paths (S2-37; gates live in core/api/counters.ts). */
const COUNTERS_PATHS: ReadonlySet<string> = new Set([
	'/api/v1/counters',
	'/dedalo/core/api/v1/counters',
]);

/**
 * Route a request. Kept as a plain function (not inline in Bun.serve) so tests
 * can call it directly without a socket.
 */
export async function handleRequest(request: Request, context: RequestContext): Promise<Response> {
	const url = new URL(request.url);

	// Health probe for the reverse proxy / process manager: liveness AND a
	// cached DB reachability check (S3-48) — monitoring must go red when the
	// database is down or the pool is wedged, not just when the process dies.
	if (url.pathname === '/health') {
		// Poison latch first (core/api/process_health.ts): a TDZ-poisoned module
		// graph serves identical failures for the whole process life while the DB
		// stays reachable — health MUST go red so the watchdog recycles us.
		const poison = getProcessPoison();
		if (poison.poisoned) {
			return jsonResponse(
				{
					result: 'error',
					entity: config.entity,
					db: 'unchecked',
					process: 'poisoned',
					reason: poison.reason,
					request_id: context.requestId,
				},
				503,
			);
		}
		const dbOk = await checkDbHealth();
		return jsonResponse(
			{
				result: dbOk ? 'ok' : 'error',
				entity: config.entity,
				db: dbOk ? 'ok' : 'down',
				request_id: context.requestId,
			},
			dbOk ? 200 : 503,
		);
	}

	// Operational counters (S2-37) — session-gated, global-admin-only.
	if (request.method === 'GET' && COUNTERS_PATHS.has(url.pathname)) {
		return handleCountersRequest(request);
	}

	// Media files (dev listener; see MEDIA_ROOT note). OFF unless explicitly
	// enabled (M5); when on, still requires a valid session. When off the request
	// falls through and 404s — production never serves media here.
	if (
		request.method === 'GET' &&
		isMediaDevRouteEnabled() &&
		url.pathname.startsWith(MEDIA_URL_PREFIX)
	) {
		if (MEDIA_ROOT === null) {
			return jsonResponse({ result: false, msg: 'Not found' }, 404);
		}
		const cookieHeader = request.headers.get('cookie') ?? '';
		const mediaSessionToken = cookieHeader
			.split(';')
			.map((pair) => pair.trim())
			.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
			?.slice(SESSION_COOKIE.length + 1);
		if (mediaSessionToken === undefined || getSession(mediaSessionToken) === null) {
			return jsonResponse({ result: false, msg: 'Not found' }, 404); // fail-closed, no existence leak
		}
		let mediaPath: string;
		try {
			// Strip the '/dedalo/<mediaDir>/' prefix, then decode the file path.
			mediaPath = decodeURIComponent(url.pathname.slice(MEDIA_URL_PREFIX.length));
		} catch {
			return jsonResponse({ result: false, msg: 'Not found' }, 404);
		}
		const fullMediaPath = resolve(MEDIA_ROOT, mediaPath);
		if (!fullMediaPath.startsWith(MEDIA_ROOT + sep)) {
			return jsonResponse({ result: false, msg: 'Not found' }, 404); // traversal
		}
		// MEDIA-04: the dev listener must NEVER serve staged uploads (other users'
		// in-flight files under upload/) or the marker store (.publication/auth
		// filenames ARE valid media-auth cookie values). Restrict it to published /
		// original media only.
		const relSegments = fullMediaPath.slice((MEDIA_ROOT + sep).length).split(sep);
		if (relSegments[0] === 'upload' || relSegments.includes('.publication')) {
			return jsonResponse({ result: false, msg: 'Not found' }, 404);
		}
		const mediaFile = Bun.file(fullMediaPath);
		if (!(await mediaFile.exists())) {
			return jsonResponse({ result: false, msg: 'Not found' }, 404);
		}
		// HTTP Range support (RFC 7233). <video>/<audio> elements stream via Range
		// requests and browsers like Safari/iOS REFUSE to play a media response that
		// answers a Range request with a full-body 200 — they require 206 Partial
		// Content. Serving the whole file (as before) "works" in lenient Chrome on
		// localhost but breaks playback (and all seeking) elsewhere. Advertise
		// Accept-Ranges on every response and honour a bytes= range with a 206.
		const contentType = mediaFile.type || 'application/octet-stream';
		const totalSize = mediaFile.size;
		// MEDIA-03 (refined — SECURITY_DECISIONS.md DECISION 2): SVG is active
		// content, but the two SVG populations under the media root need different
		// treatment:
		//  - Server-generated image ENVELOPES (image/**/svg/*.svg — written only by
		//    svg_overlay's fixed template; 'svg' is not an image quality and
		//    component_image rejects .svg uploads, so no uploader bytes reach this
		//    path). The client renders them INLINE via <object type="image/svg+xml">
		//    and needs same-origin contentDocument access (quality switch, vector
		//    editor) plus the same-origin raster <image> fetch — attachment/sandbox
		//    breaks all of that (blank image). Script is blocked by CSP instead.
		//  - Every other SVG (raw svg/ uploads) stays download-only + sandboxed:
		//    the client only uses them as <img src>, which ignores the disposition.
		const isSvg = contentType.includes('svg');
		const imageFolder = config.media.image.folder.replace(/^\//, '');
		const isImageEnvelope = isSvg && relSegments[0] === imageFolder && relSegments.includes('svg');
		const svgSafetyHeaders: Record<string, string> = isImageEnvelope
			? {
					'Content-Security-Policy':
						"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'",
				}
			: isSvg
				? {
						'Content-Disposition': 'attachment',
						'Content-Security-Policy': "default-src 'none'; sandbox",
					}
				: {};
		const rangeHeader = request.headers.get('range');
		if (rangeHeader) {
			// Only the single "bytes=start-end" form is used by media elements.
			const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
			if (match && (match[1] !== '' || match[2] !== '')) {
				const hasStart = match[1] !== '';
				let start = hasStart ? Number(match[1]) : 0;
				let end = match[2] !== '' ? Number(match[2]) : totalSize - 1;
				// Suffix form "bytes=-N" → the last N bytes.
				if (!hasStart) {
					start = Math.max(0, totalSize - Number(match[2]));
					end = totalSize - 1;
				}
				end = Math.min(end, totalSize - 1);
				if (start > end || start >= totalSize) {
					return new Response(null, {
						status: 416, // Range Not Satisfiable
						headers: { 'Content-Range': `bytes */${totalSize}`, 'Accept-Ranges': 'bytes' },
					});
				}
				return new Response(mediaFile.slice(start, end + 1), {
					status: 206,
					headers: {
						'Content-Type': contentType,
						'Content-Range': `bytes ${start}-${end}/${totalSize}`,
						'Content-Length': String(end - start + 1),
						'Accept-Ranges': 'bytes',
						...SECURITY_HEADERS,
						...svgSafetyHeaders,
					},
				});
			}
		}
		return new Response(mediaFile, {
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(totalSize),
				'Accept-Ranges': 'bytes',
				...SECURITY_HEADERS,
				...svgSafetyHeaders,
			},
		});
	}

	// tool_common client machinery, served under a CORE url from
	// src/core/tools/client/ (it lives in core, not the tools tree). Must run
	// before the generic client handler (which has no core/tools_common dir).
	if (request.method === 'GET' && url.pathname.startsWith('/dedalo/core/tools_common/')) {
		const toolCommonResponse = await serveToolCommonRequest(url.pathname, request);
		if (toolCommonResponse !== null) return toolCommonResponse;
	}

	// Tool package assets (served from the repo `tools/` roots, NOT the copied
	// client tree). Must run BEFORE the generic client handler, which no longer
	// holds a tools/ subtree.
	if (request.method === 'GET' && url.pathname.startsWith('/dedalo/tools/')) {
		const toolsResponse = await serveToolsRequest(url.pathname, request);
		if (toolsResponse !== null) return toolsResponse;
	}

	// Raw record data view (admin tool). MUST run before the generic /dedalo/
	// static handler below, since its client-relative path lives under /dedalo/.
	if (request.method === 'GET' && RAW_VIEW_PATHS.has(url.pathname)) {
		return handleRawView(request, url);
	}

	// Environment diagnostic view (developer tool). Same ordering reason as above.
	if (request.method === 'GET' && ENVIRONMENT_VIEW_PATHS.has(url.pathname)) {
		return handleEnvironmentView(request);
	}

	// component_text_area inline-tag image factory (PHP core/component_text_area/tag/).
	// The copied client emits one <img src=".../tag/?id=[TAG]"> per inline tag; this
	// route renders each as an SVG badge (deterministic, immutable-cached) or 302s a
	// locator tag to its media file. MUST run before the generic /dedalo/ static
	// handler (the copied client tree has no tag/ directory).
	if (request.method === 'GET' && url.pathname.endsWith('/core/component_text_area/tag/')) {
		return handleTagRequest(request, url);
	}

	// Ontology-master snapshot files (fail-closed on IS_AN_ONTOLOGY_SERVER).
	// MUST run before the generic /dedalo/ static handler (no client subtree).
	if (request.method === 'GET' && url.pathname.startsWith('/dedalo/install/import/ontology/')) {
		return serveOntologyIoFile(url.pathname);
	}

	// Third-party client libraries, resolved through the CLIENT_LIBS allowlist to
	// node_modules/ or vendor/. MUST run before the generic client handler — there
	// is no client/dedalo/lib/ directory any more, so this is the only way a lib
	// resolves. See src/core/client_libs/registry.ts.
	if (request.method === 'GET' && url.pathname.startsWith(CLIENT_LIB_URL_PREFIX)) {
		const libResponse = await serveClientLibRequest(url.pathname, request);
		if (libResponse !== null) return libResponse;
	}

	// Copied-client static assets (Phase 7 seam).
	if (request.method === 'GET' && url.pathname.startsWith('/dedalo/')) {
		return serveClientAsset(url.pathname, request);
	}

	// Media upload: the MULTIPART branch of the API path (PHP dd_utils_api::upload).
	// Runs before JSON parsing — the body is form-data, not JSON.
	if (
		API_PATHS.has(url.pathname) &&
		request.method === 'POST' &&
		(request.headers.get('content-type') ?? '').includes('multipart/form-data')
	) {
		const uploadCookie = request.headers.get('cookie') ?? '';
		const uploadToken = uploadCookie
			.split(';')
			.map((pair) => pair.trim())
			.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
			?.slice(SESSION_COOKIE.length + 1);
		const uploadSession = uploadToken !== undefined ? getSession(uploadToken) : null;
		// Header-only (L9): the vendored client always sends the token in the
		// X-Dedalo-Csrf-Token header (with a FORM-FIELD fallback in the POST body).
		// The old url.searchParams('csrf_token') fallback was never used by the
		// client and would leak the token into access logs / the Referer header.
		const csrfCandidate = request.headers.get('x-dedalo-csrf-token');
		// NOTE: this branch bypasses dispatchRqo, so the request-scoped IDENTITY and
		// LANGUAGE ALS contexts are NOT open here. That is safe today because the
		// upload path threads the session explicitly and reads no request-scoped
		// accessor (currentPrincipal/currentSession/current*Lang). Any future
		// upload-path code that reaches for those must instead thread identity/lang
		// explicitly, or wrap this call in runWithRequestContext/runWithRequestLangs.
		const { handleMediaUpload } = await import('./core/media/ingest/upload_endpoint.ts');
		return handleMediaUpload(request, uploadSession, csrfCandidate);
	}

	// The API endpoint: parse → validate → dispatch (auth/CSRF/allowlists in dispatch.ts).
	if (API_PATHS.has(url.pathname) && request.method === 'POST') {
		let rawBody: unknown;
		try {
			rawBody = await request.json();
		} catch {
			return jsonResponse({ result: false, msg: 'Invalid JSON body' }, 400);
		}
		const parsedRqo = rqoSchema.safeParse(rawBody);
		if (!parsedRqo.success) {
			return jsonResponse(
				{ result: false, msg: 'Invalid RQO', errors: parsedRqo.error.issues },
				400,
			);
		}

		// Resolve the session from the TS-native cookie.
		const cookieHeader = request.headers.get('cookie') ?? '';
		const sessionToken = cookieHeader
			.split(';')
			.map((pair) => pair.trim())
			.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
			?.slice(SESSION_COOKIE.length + 1);
		const apiContext: ApiRequestContext = {
			requestId: context.requestId,
			// Behind the reverse proxy the socket has no peer IP; the client IP comes
			// from the TRUSTED X-Forwarded-For hop (never the spoofable left-most).
			clientIp: clientIpFromRequest(request),
			session: sessionToken !== undefined ? getSession(sessionToken) : null,
			sessionToken: sessionToken ?? null,
			csrfCandidate: request.headers.get('x-dedalo-csrf-token'),
			reportTokenCandidate: request.headers.get('x-dedalo-report-token'),
			bodyByteLength: parseContentLength(request.headers.get('content-length')),
			startedAt: context.startedAt,
		};

		const outcome = await dispatchRqo(parsedRqo.data, apiContext);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...SECURITY_HEADERS,
		};
		// Authenticated API payloads may carry record data — never let a shared
		// cache store them (L6).
		if (apiContext.session !== null) {
			headers['Cache-Control'] = 'no-store';
		}
		if (outcome.setSessionToken !== undefined) {
			// HttpOnly + SameSite=Lax + (default) Secure — see sessionCookieHeader.
			headers['Set-Cookie'] = sessionCookieHeader(outcome.setSessionToken);
		} else if (outcome.clearSessionCookie === true) {
			// Logout: expire the cookie so the browser drops it (Max-Age=0). Same
			// attributes as issuance so the browser matches and overwrites it.
			headers['Set-Cookie'] = sessionCookieHeader('', { clear: true });
		}
		// Long-lived streaming responses (diffusion SSE): the handler passed the
		// dispatch gates and returned a ReadableStream — hand it to the client
		// raw with its own headers (text/event-stream + anti-buffering).
		if (outcome.stream !== undefined) {
			return new Response(outcome.stream, {
				status: outcome.status,
				headers: {
					...SECURITY_HEADERS,
					'Cache-Control': 'no-store',
					...outcome.streamHeaders,
				},
			});
		}
		return new Response(JSON.stringify(outcome.body), { status: outcome.status, headers });
	}

	return jsonResponse({ result: false, msg: 'Not found' }, 404);
}

/**
 * Process-level unhandledRejection guard. Bun exits with code 1 on the FIRST
 * floating promise rejection — even with a live Bun.serve — so one detached
 * DB error (SSE poll, scheduler pid write, heartbeat) would kill the whole
 * multi-user server. The guard logs LOUDLY and keeps the process alive; it
 * must never be silent, or crashes become invisible partial failures. Every
 * KNOWN detached path still carries its own .catch — this is the last line,
 * not the error-handling strategy. Exported for the survival gate
 * (test/unit/diffusion_sse_resilience.test.ts).
 */
export function installUnhandledRejectionGuard(): void {
	process.on('unhandledRejection', (reason) => {
		console.error(
			'[FATAL-AVERTED] unhandledRejection: a detached promise rejected with no .catch —',
			'the process survives, but the offending call path must gain its own handler:',
			reason,
		);
	});
}

/**
 * Runtime pin echo (audit S2-36): the code is coupled to version-specific Bun
 * behavior (Bun.sql jsonb params, the mariadb adapter, Bun.serve defaults),
 * all verified against the version pinned in .bun-version + package.json
 * engines.bun. A mismatched runtime WARNS loudly at boot (it does not refuse:
 * patch drift may be deliberate) so `bun upgrade` on a production box is never
 * silent again.
 */
function echoRuntimeVersion(): void {
	let pinned = '';
	try {
		pinned = readFileSync(join(projectRoot, '.bun-version'), 'utf-8').trim();
	} catch {
		/* pin file missing — fall through to the generic echo */
	}
	console.log(`Dédalo TS server starting on Bun ${Bun.version} (pinned: ${pinned || 'none'})`);
	if (pinned !== '' && Bun.version !== pinned) {
		console.warn(
			`[runtime] Bun ${Bun.version} does NOT match the verified pin ${pinned} (.bun-version). Bun.sql/Bun.serve behavior is version-coupled (audit S2-36) — verify before relying on this runtime.`,
		);
	}
	// MEDIA-01(A): the TS server has NO native media access control — protected
	// media is enforced by the transitional PHP login (media auth cookie) + the
	// PHP-generated web-server rules. The built-in dev media route applies NO
	// per-record ACL. Refuse to be quiet about it if it is ever switched on.
	if (isMediaDevRouteEnabled()) {
		console.warn(
			'[security] MEDIA_DEV_ROUTE_ENABLED=true — the dev media route serves files with NO ' +
				'per-record/per-project access control. NEVER enable this in a shared or production ' +
				'environment. Production media protection is owned by the PHP login cookie + web-server ' +
				'rules (native TS media ACL is unported — foundation audit MEDIA-01 / docs security DECISIONS).',
		);
	}
}

/**
 * True when a live process is LISTENING on the unix socket (audit S2-17b): a
 * second `startServer` used to silently unlink the FIRST instance's socket and
 * bind fresh, orphaning the old process. connect() answering = live instance.
 */
async function socketIsLive(socketPath: string): Promise<boolean> {
	try {
		await new Promise<void>((resolvePromise, rejectPromise) => {
			Bun.connect({
				unix: socketPath,
				socket: {
					open(socket) {
						socket.end();
						resolvePromise();
					},
					data() {},
					error(_socket, error) {
						rejectPromise(error);
					},
					connectError(_socket, error) {
						rejectPromise(error);
					},
				},
			}).catch(rejectPromise);
		});
		return true;
	} catch {
		return false;
	}
}

/** Idempotency latch for the signal handlers (a repeated SIGTERM must not re-drain). */
let shuttingDown = false;

/**
 * Graceful shutdown (audit S2-17): stop the scheduler cadences, stop accepting
 * connections, drain in-flight requests inside the grace budget, mark undrained
 * media jobs 'interrupted' in their pfiles, journal dying background tool jobs,
 * close the DB pool, unlink the socket, exit 0. Diffusion RUNNERS survive by
 * design (separate processes completing against Postgres — the sweeper heals
 * anything that does not).
 */
async function shutdownGracefully(
	signal: string,
	servers: ReturnType<typeof Bun.serve>[],
	socketPath: string,
): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[shutdown] ${signal} received — draining (grace ${config.ops.shutdownGraceMs}ms)`);
	try {
		const { stopDiffusionScheduler } = await import('./diffusion/jobs/scheduler.ts');
		stopDiffusionScheduler();
	} catch (error) {
		console.error('[shutdown] stopping diffusion scheduler failed:', error);
	}
	// Stop ACCEPTING; in-flight requests keep running until the drain deadline.
	for (const server of servers) server.stop();
	const deadline = Date.now() + config.ops.shutdownGraceMs;
	while (servers.some((server) => server.pendingRequests > 0) && Date.now() < deadline) {
		await Bun.sleep(50);
	}
	const undrained = servers.reduce((sum, server) => sum + server.pendingRequests, 0);
	if (undrained > 0) {
		console.warn(`[shutdown] ${undrained} request(s) still in flight at deadline — closing hard`);
		for (const server of servers) server.stop(true);
	}
	// Mark undrained media transcodes 'interrupted' in their pfiles so the poll
	// wire never reports a dead job as running (S2-15/S2-17).
	try {
		const { mediaJobs } = await import('./core/media/jobs.ts');
		const interrupted = mediaJobs.interruptLive('server shutdown');
		if (interrupted.length > 0) {
			console.warn(
				`[shutdown] interrupted ${interrupted.length} media job(s): ${interrupted.join(', ')}`,
			);
		}
	} catch (error) {
		console.error('[shutdown] media job interrupt failed:', error);
	}
	// Journal background tool jobs that die with the process (S2-16).
	try {
		const { logDyingBackgroundJobs } = await import('./core/tools/background.ts');
		logDyingBackgroundJobs();
	} catch (error) {
		console.error('[shutdown] background job journal failed:', error);
	}
	try {
		const { closeDatabasePool } = await import('./core/db/postgres.ts');
		await closeDatabasePool();
	} catch (error) {
		console.error('[shutdown] closing DB pool failed:', error);
	}
	try {
		if (existsSync(socketPath)) unlinkSync(socketPath);
	} catch (error) {
		console.error('[shutdown] socket unlink failed:', error);
	}
	console.log('[shutdown] complete');
	process.exit(0);
}

/** Start the server. Exported for tests; auto-runs when executed directly. */
/**
 * BOOT WARM-UP — first-load TDZ hardening (the poisoned-process class).
 *
 * The read path keeps sanctioned lazy `import()` seams (CONVENTIONS §2), so
 * without this the FIRST concurrent request burst evaluates those subgraphs in
 * parallel; a temporal-dead-zone ReferenceError inside one of the ~30 known
 * import cycles then poisons the failed module for the entire process life
 * (Bun caches failed evaluations — observed 2026-07-07: 1114 identical
 * `dd_core_api::read` failures until restart, undetectable by the DB-only
 * health probe). Evaluating the whole src/core graph SERIALLY here, before any
 * listener exists, removes request-time module evaluation entirely; the poison
 * latch (core/api/process_health.ts → /health 503 → watchdog) is the
 * defense-in-depth layer behind it.
 *
 * Scope is src/core ONLY: src/diffusion and src/ai stay lazy by boundary
 * design — an unconfigured subsystem must cost nothing at boot (CONVENTIONS §2
 * rationale 2). Tool per-action handlers (rationale 3) load on first use as
 * before; the observed failure class lives in the core graph's cycles.
 *
 * Dynamic import rationale (CONVENTIONS §2 rationale 4, BOOT WARM-UP): the
 * specifier set is the core file tree itself, enumerated at runtime; every
 * target is already a legal static member of the core graph, so no boundary
 * or SCC edge is added.
 *
 * A module that fails to evaluate here is a DETERMINISTIC defect that would
 * otherwise surface as the poisoned-process class on its first request — the
 * boot fails loudly instead (the caller exits non-zero; systemd Restart=always
 * makes the crash loop visible where a silently degraded server was not).
 */
async function warmCoreModuleGraph(): Promise<void> {
	const coreDir = resolve(import.meta.dir, 'core');
	const startedAt = performance.now();
	const files: string[] = [];
	for await (const relPath of new Glob('**/*.ts').scan({ cwd: coreDir })) {
		files.push(relPath);
	}
	files.sort();
	const failures: string[] = [];
	for (const relPath of files) {
		try {
			await import(join(coreDir, relPath));
		} catch (error) {
			failures.push(relPath);
			console.error(`[boot] core module warm-up FAILED for core/${relPath}:`, error);
		}
	}
	if (failures.length > 0) {
		throw new Error(
			`core module warm-up: ${failures.length} module(s) failed to evaluate (${failures.join(', ')}) — refusing to serve with a poisoned module graph`,
		);
	}
	console.log(
		`[boot] core module graph warmed: ${files.length} modules in ${Math.round(performance.now() - startedAt)}ms`,
	);
}

export async function startServer() {
	installUnhandledRejectionGuard();
	echoRuntimeVersion();

	// Serialize the core module-graph evaluation BEFORE anything can race it
	// (see warmCoreModuleGraph). A failure here is fatal by design: exit
	// explicitly — a throw would only feed the unhandledRejection guard above
	// and leave a half-booted zombie process.
	try {
		await warmCoreModuleGraph();
	} catch (error) {
		console.error('[boot] FATAL:', error);
		process.exit(1);
	}

	// INSTALL MODE (DEC-19): a fresh, unconfigured machine (no `.env`). The DB is
	// a sentinel — skip every DB-dependent boot step (migrations, RAG hooks,
	// diffusion control plane) and serve ONLY the install wizard. persist_config
	// writes `.env` and restarts the process, which then boots normally.
	if (config.installMode) {
		console.warn(
			'[boot] INSTALL MODE — no database configured yet (../private/.env absent). ' +
				'Serving the install wizard at /dedalo/core/page/. Complete it (browser wizard ' +
				'or `bun run install`); the server restarts into normal operation once configured.',
		);
	}

	// Ordered TS-owned schema migrations (audit S2-39) — run BEFORE serving so a
	// request never observes a half-migrated schema. A failure logs loudly and
	// continues: the lazy CREATE IF NOT EXISTS bootstraps remain the fallback,
	// and refusing to boot on a transient DB blip would contradict the
	// fault-tolerant boot posture (S1-15). Skipped entirely in install mode (the
	// sentinel DB is unreachable and there is nothing to migrate yet).
	if (!config.installMode) {
		try {
			await runBootMigrations();
		} catch (error) {
			console.error(
				'[migrations] boot migration run failed (continuing with lazy bootstraps):',
				error,
			);
		}
	}

	// Everything below through the diffusion control plane is DB-dependent —
	// skipped in install mode (no database yet). The block restores on the
	// post-configuration restart.
	if (!config.installMode) {
		// Register the RAG save/delete → index-queue hook (no-op when
		// DEDALO_RAG_ENABLED is off). Must run before serving so writes are captured.
		initRagHooks();

		// Boot data-cache PRE-WARM (boot backlog #5): the lang-independent
		// ontology caches that gate the FIRST interactive paint (the menu area
		// walk and the active-TLD list) fill before the first request instead of
		// on it. Fire-and-forget and NON-FATAL — a DB blip degrades the first hit
		// back to lazy filling, never blocks the boot (S1-15 posture).
		void (async () => {
			try {
				const startedAt = performance.now();
				const { collectAreaRows } = await import('./core/api/handlers/menu.ts');
				const { getActiveTlds } = await import('./core/db/dd_ontology.ts');
				await Promise.all([collectAreaRows(), getActiveTlds()]);
				console.log(
					`[boot] data caches pre-warmed (menu walk, active TLDs) in ${Math.round(performance.now() - startedAt)}ms`,
				);
			} catch (error) {
				console.warn('[boot] data-cache pre-warm skipped (lazy fill on first request):', error);
			}
		})();

		// Diffusion control plane (engineering/DIFFUSION_SPEC.md §4.2): ensure the durable
		// job tables, heal interrupted runs from the previous process life
		// (sweeper), then start claiming queued jobs. Fire-and-forget: a DB hiccup
		// here must not block the interactive server from booting.
		// DEDALO_DIFFUSION_SCHEDULER_ENABLED=false skips ONLY the claim/sweep
		// cadences (deployments that run the scheduler elsewhere, and the ops smoke
		// tests — an ephemeral instance must never claim the live queue's jobs);
		// the delete-propagation executor registers either way.
		const schedulerEnabled = readEnv('DEDALO_DIFFUSION_SCHEDULER_ENABLED', 'true') !== 'false';

		// Native in-process SQL delete propagation (DIFFUSION_SPEC §4.2):
		// registration seam — core never imports src/diffusion statically. AWAITED
		// SYNCHRONOUSLY at boot, BEFORE serving and INDEPENDENT of the fire-and-forget
		// schema chain below (audit S2-30: when the registration rode that chain, a
		// transient DB error in ensureDiffusionJobTables silently skipped it and
		// every record delete went pending for the process lifetime). The
		// registration itself is pure in-memory wiring (no DB). If it
		// still fails, log LOUDLY with the operational consequence — never silently.
		try {
			const { executeSqlDeleteTargets } = await import(
				'./diffusion/targets/mariadb/delete_record.ts'
			);
			const { registerNativeDiffusionSqlDelete } = await import(
				'./core/diffusion_bridge/diffusion_delete.ts'
			);
			registerNativeDiffusionSqlDelete(executeSqlDeleteTargets);
		} catch (error) {
			console.error(
				'[diffusion] FATAL-FOR-DELETES: native SQL delete executor NOT registered — ' +
					'record deletes will go to dd1758 pending rows (DEC-19; no fallback since ' +
					'the 2026-07-11 cutover) for this entire process life. Fix and restart. Cause:',
				error,
			);
		}

		// Native media-index (S2-31): register the marker-store ops through the
		// same seam (the ONLY rebuild/status source since the 2026-07-11
		// cutover), then reconcile pub/ from the dbs/ ground truth to heal crash
		// drift (oracle boot posture, old engine index.ts:1183-1190). Reconcile
		// is pure filesystem hygiene — fire-and-forget, never blocks serving.
		try {
			const { rebuildMediaIndexStore, getMediaIndexStatus, reconcileMediaIndex } = await import(
				'./diffusion/targets/mediastore/media_index.ts'
			);
			const { registerNativeMediaIndex } = await import(
				'./core/diffusion_bridge/diffusion_delete.ts'
			);
			registerNativeMediaIndex({
				rebuild: (targets) => rebuildMediaIndexStore(targets),
				getStatus: getMediaIndexStatus,
				reconcile: reconcileMediaIndex,
			});
			void reconcileMediaIndex()
				.then((healed) => {
					if (healed !== null && (healed.added > 0 || healed.removed > 0)) {
						console.warn(
							`[media_index] boot reconcile: pub/ healed (+${healed.added} / -${healed.removed} marker(s))`,
						);
					}
				})
				.catch((error) => console.error('[media_index] boot reconcile failed:', error));
		} catch (error) {
			console.error(
				'[media_index] DEC-19: native media-index NOT registered — publication markers ' +
					'will not be maintained (no fallback since the 2026-07-11 cutover). ' +
					'Fix and restart. Cause:',
				error,
			);
		}

		void import('./diffusion/jobs/schema.ts')
			.then(({ ensureDiffusionJobTables }) => ensureDiffusionJobTables())
			.then(async () => {
				if (schedulerEnabled) {
					const { startDiffusionScheduler } = await import('./diffusion/jobs/scheduler.ts');
					startDiffusionScheduler();
				} else {
					console.warn('[diffusion] scheduler disabled (DEDALO_DIFFUSION_SCHEDULER_ENABLED=false)');
				}
			})
			.then(async () => {
				// Diffusion gauge for the admin counters endpoint (S2-37): registered
				// HERE — core/api/counters.ts must not import src/diffusion (the
				// boundary tripwire allows exactly two seams; this is the inversion).
				const { countQueuedJobs, countRunningJobs } = await import('./diffusion/jobs/queue.ts');
				const { getMaxRunners, isSchedulerPaused } = await import('./diffusion/jobs/scheduler.ts');
				const { registerOpsGauge } = await import('./core/api/counters.ts');
				registerOpsGauge('diffusion', async () => ({
					queued: await countQueuedJobs(),
					running: await countRunningJobs(),
					max_runners: getMaxRunners(),
					paused: isSchedulerPaused(),
				}));
			})
			.catch((error) => console.error('[diffusion] boot init failed:', error));
	} // end if (!config.installMode)

	// Media job pfile reconcile + residue GC (audit S2-15/S3-46): flip stale
	// 'running' pfiles from previous process lives to 'interrupted' and prune
	// ancient terminal pfiles. Fire-and-forget — pure filesystem hygiene.
	void import('./core/media/jobs.ts')
		.then(({ reconcileProcessFiles }) => {
			const { interrupted, pruned } = reconcileProcessFiles();
			if (interrupted.length > 0 || pruned > 0) {
				console.warn(
					`[media jobs] boot reconcile: ${interrupted.length} stale running pfile(s) marked interrupted, ${pruned} old pfile(s) pruned`,
				);
			}
		})
		.catch((error) => console.error('[media jobs] boot reconcile failed:', error));

	const socketPath = config.server.unixSocketPath;
	// A previous unclean shutdown leaves the socket file behind; Bun cannot
	// bind over it. Removing a STALE socket at boot is the standard fix — but
	// first PROBE it (S2-17b): if something answers, another instance is live
	// and starting would silently orphan it. Refuse loudly instead.
	if (existsSync(socketPath)) {
		if (await socketIsLive(socketPath)) {
			console.error(
				`FATAL: another server instance is already listening on ${socketPath} — refusing to steal its socket. Stop the running instance first (or point SERVER_UNIX_SOCKET elsewhere).`,
			);
			process.exit(1);
		}
		unlinkSync(socketPath);
	}
	const servers: ReturnType<typeof Bun.serve>[] = [];
	const server = Bun.serve({
		unix: socketPath,
		maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
		// Explicit idleTimeout (audit S2-33): Bun's silent 10 s default killed any
		// slow request on the TCP listener; both listeners now share the pinned,
		// configurable value. The proxy in front must be tuned to match
		// (engineering/PRODUCTION.md). Cast: @types/bun omits idleTimeout on the unix
		// options shape; the runtime accepts it (verified on the pinned 1.3.9).
		idleTimeout: config.ops.idleTimeoutSeconds as unknown as undefined,
		fetch(request) {
			return handleRequest(request, createRequestContext());
		},
	});
	servers.push(server);
	console.log(`Dédalo TS server listening on unix socket ${socketPath} (entity: ${config.entity})`);

	// Optional TCP dev listener (browsers cannot reach a unix socket directly;
	// production stays socket-only behind the reverse proxy). Set
	// SERVER_TCP_PORT to expose the copied client + API at
	// http://localhost:<port>/dedalo/core/page/ for local development.
	// Read via readEnv so it resolves from ../private/.env like all other config
	// (NOT process.env only — a plain `bun run` doesn't export the private .env,
	// which silently dropped the dev listener on restart).
	const tcpPort = readEnv('SERVER_TCP_PORT');
	if (tcpPort !== undefined && tcpPort !== '') {
		servers.push(
			Bun.serve({
				port: Number(tcpPort),
				maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
				idleTimeout: config.ops.idleTimeoutSeconds,
				fetch(request) {
					return handleRequest(request, createRequestContext());
				},
			}),
		);
		console.log(`Dédalo TS dev listener on http://localhost:${tcpPort}/dedalo/core/page/`);
	}

	// Graceful shutdown (audit S2-17): supervisors send SIGTERM; operators ^C.
	process.on('SIGTERM', () => void shutdownGracefully('SIGTERM', servers, socketPath));
	process.on('SIGINT', () => void shutdownGracefully('SIGINT', servers, socketPath));

	return server;
}

if (import.meta.main) {
	void startServer();
}
