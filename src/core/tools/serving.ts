/**
 * Static serving of tool client assets, all fail-closed (a miss is always a
 * plain 404, never an existence leak):
 *  - /dedalo/core/tools_common/<rest>  → the tool_common client machinery
 *    (physically src/core/tools/client/). It lives in CORE, not the tools tree,
 *    and is served under a CORE url — its importers point here directly.
 *  - /dedalo/tools/<tool>/<rest>       → a tool package's own js/css/img assets,
 *    resolved over the tool roots, realpath-confined, with the server/ subtree
 *    and any non-asset extension refused.
 *
 * The `server/` subtree (TS server code) is NEVER servable; register.json IS
 * (public registry data the PHP engine also serves).
 */

import { extname } from 'node:path';
import { staticAssetResponse } from '../api/static_asset.ts';
import { resolveToolAssetPath, resolveToolCommonAssetPath } from './paths.ts';

/** URL prefix the tool_common client machinery is served at (a CORE url). */
export const TOOL_COMMON_URL_PREFIX = '/dedalo/core/tools_common/';

/**
 * Servable asset extensions (the sync_client.sh asset filter + register.json).
 * Anything else under a tool dir is treated as non-public and 404s.
 */
const SERVABLE_EXTENSIONS: ReadonlySet<string> = new Set([
	'.js',
	'.mjs',
	'.css',
	'.less',
	'.map',
	'.json',
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
	'.wasm',
]);

/** 404 without leaking whether the target exists. */
function notFound(): Response {
	return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Serve a `/dedalo/tools/*` request, or return null if the pathname is not a
 * tools asset path (caller falls through to the generic client handler). The
 * pathname is already the raw URL pathname; it is decoded here.
 */
export async function serveToolsRequest(
	pathname: string,
	request: Request,
): Promise<Response | null> {
	if (!pathname.startsWith('/dedalo/tools/')) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return notFound();
	}
	const rest = decoded.slice('/dedalo/tools/'.length);
	const segments = rest.split('/');
	const first = segments[0];
	if (first === undefined || first === '') return notFound();

	// A tool package's own assets (tool_common is NOT here — it is core, served
	// under /dedalo/core/tools_common/ by serveToolCommonRequest).
	const relPath = segments.slice(1).join('/');
	const fullPath = resolveToolAssetPath(first, relPath);
	if (fullPath === null) return notFound();
	if (!SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) return notFound();
	return (await staticAssetResponse(fullPath, request)) ?? notFound();
}

/**
 * Serve the tool_common client machinery at its CORE url
 * (/dedalo/core/tools_common/<rest>) from src/core/tools/client/. Returns null
 * when the pathname is not a tools_common path (caller falls through). Same
 * fail-closed asset-extension + confinement rules as the tool asset path.
 */
export async function serveToolCommonRequest(
	pathname: string,
	request: Request,
): Promise<Response | null> {
	if (!pathname.startsWith(TOOL_COMMON_URL_PREFIX)) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return notFound();
	}
	const relPath = decoded.slice(TOOL_COMMON_URL_PREFIX.length);
	const fullPath = resolveToolCommonAssetPath(relPath);
	if (fullPath === null || !SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) {
		return notFound();
	}
	return (await staticAssetResponse(fullPath, request)) ?? notFound();
}
