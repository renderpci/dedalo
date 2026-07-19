/**
 * TEXT_AREA TAG ENDPOINT — GET /…/core/component_text_area/tag/?id=<tag>
 *
 * The copied client emits one <img src=".../tag/?id=[TAG]"> per inline tag; this
 * handler answers those requests (PHP core/component_text_area/tag/index.php).
 *
 * Two response classes:
 *   1. DETERMINISTIC BADGES (tc/index/geo/page/person/note/lang/draw) — the badge
 *      is a pure function of the `?id=` string, so we render a tiny SVG and serve
 *      it PUBLIC + IMMUTABLE. That, plus the browser's automatic de-dup of
 *      identical ids, is what makes a text_area with hundreds of tags cost ~0
 *      network in steady state. No session needed: the badge only ever shows the
 *      number/label already present in the id the client itself supplied — nothing
 *      from the database.
 *   2. LOCATOR TAGS (`{…}` JSON / the `svg` tag, whose src IS the JSON payload) —
 *      these reference a real component's media file (usually an SVG drawing). We
 *      resolve the file's media URL and 302-REDIRECT to it so media-protection
 *      stays the single enforcement point (the /dedalo/<media>/ route + the
 *      reverse proxy). ACL: a valid session is required; anything unresolved is a
 *      fail-closed 404 that never reveals whether the record/file exists (spec §7).
 */

import { config } from '../../../config/config.ts';
import { mediaTypeOf } from '../../concepts/media.ts';
import { isValidTipo } from '../../concepts/ontology.ts';
import { resolveMediaPathOptions } from '../../media/ontology_path.ts';
import { buildMediaLocation } from '../../media/path.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import { SESSION_COOKIE, getSession } from '../../security/session_store.ts';
import { type LocatorTag, parseTagId, safeDecodeTagId } from './tag_grammar.ts';
import { renderDrawTag, renderSpriteTag } from './tag_render.ts';

/** One year — the deterministic badges never change for a given id. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** PHP parity for the live/locator responses (3 hours, private). */
const PRIVATE_CACHE = 'private, max-age=10800';

/** Fail-closed 404 — generic, no existence leak. */
function notFound(): Response {
	return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/** Serve a rendered SVG badge with an ETag + immutable caching (honours If-None-Match). */
function svgResponse(svg: string, request: Request): Response {
	const etag = `"${Bun.hash(svg).toString(16)}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, {
			status: 304,
			headers: { ETag: etag, 'Cache-Control': IMMUTABLE_CACHE },
		});
	}
	return new Response(svg, {
		status: 200,
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': IMMUTABLE_CACHE,
			ETag: etag,
		},
	});
}

/** True when the caller has a valid TS session (locator branch ACL gate). */
function hasValidSession(request: Request): boolean {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const token = cookieHeader
		.split(';')
		.map((pair) => pair.trim())
		.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
		?.slice(SESSION_COOKIE.length + 1);
	return token !== undefined && getSession(token) !== null;
}

/**
 * Resolve a locator tag to its component media file URL and 302-redirect.
 * Fail-closed 404 on any miss (unauthenticated, invalid tipo, non-media model,
 * path build failure) — never distinguishes "no access" from "does not exist".
 */
async function resolveLocatorTag(tag: LocatorTag, request: Request): Promise<Response> {
	// ACL: authenticated only. The redirect target enforces media-protection again.
	if (!hasValidSession(request)) return notFound();

	// §7.6 identifier gate before any ontology/path work.
	if (!isValidTipo(tag.section_tipo) || !isValidTipo(tag.component_tipo)) return notFound();
	const sectionId = Number(tag.section_id);
	if (!Number.isInteger(sectionId) || sectionId <= 0) return notFound();

	try {
		const model = await getModelByTipo(tag.component_tipo);
		const spec = model !== null ? mediaTypeOf(model) : null;
		if (spec === null) return notFound(); // not a resolvable media component

		const pathOptions = await resolveMediaPathOptions(tag.component_tipo, tag.section_tipo);
		const location = buildMediaLocation(
			spec,
			{
				componentTipo: tag.component_tipo,
				sectionTipo: tag.section_tipo,
				sectionId,
				lang: null, // media locator files (svg/image) are non-translatable (PHP DEDALO_DATA_NOLAN)
			},
			spec.defaultQuality,
			spec.defaultExtension,
			pathOptions,
		);
		// Media web base: the redirect target is fetched by the BROWSER, so it must
		// point at wherever media is actually served (split-origin dev included).
		const mediaUrl = `${config.media.webBase}${location.relativePath}`;
		return new Response(null, {
			status: 302,
			headers: { Location: mediaUrl, 'Cache-Control': PRIVATE_CACHE },
		});
	} catch {
		return notFound();
	}
}

/**
 * Handle a tag request. `server.ts` routes by path + method; all parsing,
 * rendering, and authorization live here.
 */
export async function handleTagRequest(request: Request, url: URL): Promise<Response> {
	const rawId = url.searchParams.get('id');
	if (rawId === null || rawId === '') return notFound();

	// SEC-027 JSON-aware xss decode, then classify.
	const parsed = parseTagId(safeDecodeTagId(rawId));

	switch (parsed.kind) {
		case 'sprite':
			return svgResponse(renderSpriteTag(parsed), request);
		case 'draw':
			return svgResponse(renderDrawTag(parsed), request);
		case 'locator':
			return resolveLocatorTag(parsed, request);
		default:
			return notFound();
	}
}
