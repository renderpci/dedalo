/**
 * Static serving of third-party client libraries: GET /dedalo/lib/<id>/<subpath>.
 *
 * Fail-closed, and deliberately allowlist-first: the FIRST thing this does is look
 * `<id>` up in CLIENT_LIBS. A request path is never mapped into node_modules —
 * node_modules also holds the server's own dependencies, and a prefix-based
 * passthrough would publish the entire dependency tree (source, sourcemaps, and
 * whatever a transitive package happens to ship). An unregistered id is a 404
 * before any filesystem call.
 *
 * Then the usual confinement: the decoded subpath is resolved against the lib's
 * canonical root and must stay under it, and the extension must be servable.
 * Response semantics (validators/304/Cache-Control/gzip) come from
 * staticAssetResponse, exactly as for the rest of the client tree.
 */

import { existsSync, realpathSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { staticAssetResponse } from '../api/static_asset.ts';
import { CLIENT_LIBS, isDevMode, libRoot } from './registry.ts';

/** URL prefix every registered lib is served at. */
export const CLIENT_LIB_URL_PREFIX = '/dedalo/lib/';

/**
 * Servable extensions. A superset of the client tree's, because the pdf.js viewer
 * is a whole app: it loads locale files (.ftl/.properties), CMaps (.bcmap),
 * standard fonts (.pfb) and colour profiles (.icc) alongside the usual assets.
 * Anything not listed 404s — a lib needing a new type surfaces here, not silently.
 */
const SERVABLE_EXTENSIONS: ReadonlySet<string> = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.map',
	'.json',
	'.css',
	'.html',
	'.svg',
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.eot',
	'.wasm',
	// pdf.js viewer payloads
	'.bcmap',
	'.ftl',
	'.properties',
	'.pfb',
	'.icc',
	'.pdf',
]);

/** 404 without leaking whether the target exists. */
function notFound(): Response {
	return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Resolve `/dedalo/lib/<id>/<subpath>` to a confined absolute path, or null to
 * 404. Exported so the client_libs tripwire can assert the mapping without
 * standing a server up.
 */
export function resolveClientLibPath(id: string, subPath: string): string | null {
	const lib = CLIENT_LIBS[id];
	if (lib === undefined) return null; // ← the allowlist. Nothing else may be reached.
	if (lib.devOnly === true && !isDevMode()) return null;

	const root = libRoot(id);
	if (root === null || !existsSync(root)) return null;

	// Confine on the CANONICAL root: a package may legitimately be a symlink (bun
	// links workspace/file: deps), so compare realpaths, never the raw strings.
	let canonicalRoot: string;
	try {
		canonicalRoot = realpathSync(root);
	} catch {
		return null;
	}
	const fullPath = resolve(canonicalRoot, subPath);
	if (fullPath !== canonicalRoot && !fullPath.startsWith(canonicalRoot + sep)) {
		return null; // traversal attempt
	}
	if (!SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) return null;
	if (!existsSync(fullPath)) return null;
	return fullPath;
}

/**
 * Serve a `/dedalo/lib/*` request, or return null when the pathname is not one
 * (the caller falls through to the generic client handler).
 */
export async function serveClientLibRequest(
	pathname: string,
	request: Request,
): Promise<Response | null> {
	if (!pathname.startsWith(CLIENT_LIB_URL_PREFIX)) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return notFound();
	}
	const rest = decoded.slice(CLIENT_LIB_URL_PREFIX.length);
	const segments = rest.split('/').filter((s) => s !== '');
	if (segments.length < 2) return notFound();

	// Scoped ids are not used — the registry id is always ONE segment, precisely so
	// that the allowlist lookup cannot be confused by a crafted multi-segment id.
	const id = segments[0] as string;
	const subPath = segments.slice(1).join('/');

	const fullPath = resolveClientLibPath(id, subPath);
	if (fullPath === null) return notFound();
	return (await staticAssetResponse(fullPath, request)) ?? notFound();
}
