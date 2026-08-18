/**
 * Static serving of tool client assets, all fail-closed (a miss is always a
 * plain 404, never an existence leak):
 *  - /dedalo/tools/<tool>/<rest>       → a tool package's own js/css/img assets,
 *    resolved over the tool roots, realpath-confined, with the server/ subtree
 *    and any non-asset extension refused.
 *
 * The `server/` subtree (TS server code) is NEVER servable; register.json IS
 * (public registry data the PHP engine also serves).
 */

import { extname } from 'node:path';
import { staticAssetResponse } from '../api/static_asset.ts';
import { DedaloError, toErrorEnvelope } from '../errors/index.ts';
import { resolveToolAssetPath } from './paths.ts';

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

/**
 * 404 without leaking whether the target exists — the SAME converter-made
 * `resource.not_found` body server.ts serves for every other route miss
 * (engineering/ERRORS_SPEC.md §4: nothing hand-builds a failure body).
 *
 * These two entry points are called from the static-asset branch of server.ts,
 * which threads no request id (they are not RQO handlers), so the envelope
 * carries the literal `'static'` — the same posture as server.ts's own
 * `'unhandled'` catch-all id.
 */
function notFound(): Response {
	const converted = toErrorEnvelope(new DedaloError('resource.not_found'), {
		requestId: 'static',
	});
	return new Response(JSON.stringify(converted.body), {
		status: converted.status,
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

	// A tool package's own assets (tool_common is NOT here — it is client
	// source, client/dedalo/core/tools_common/, served at /dedalo/core/… by the
	// generic client handler like every other client file).
	const relPath = segments.slice(1).join('/');
	const fullPath = resolveToolAssetPath(first, relPath);
	if (fullPath === null) return notFound();
	if (!SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) return notFound();
	return (await staticAssetResponse(fullPath, request)) ?? notFound();
}
