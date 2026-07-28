/**
 * THE TRANSCRIPTION AUDIO ROUTE — the speech-recognition audio, served by the
 * ENGINE ITSELF at the application's own origin.
 *
 * WHY THIS EXISTS. The browser recogniser has to read the whole `audio_tr` WAV
 * before it can transcribe anything. Handing it the ordinary media URL made that
 * read depend on three things that have nothing to do with transcription:
 *
 *   - the ORIGIN. `DEDALO_MEDIA_WEB_BASE` is very often an absolute URL on a
 *     different host or port from the app (a separate Apache, a CDN). The browser
 *     then refuses the cross-origin read unless that server is configured for
 *     CORS — the same mismatch that makes a subtitle track fail with "Domains,
 *     protocols and ports must match";
 *   - the MEDIA COOKIE. Protected media is gated by a cookie the browser will not
 *     send cross-site over plain http, so even a CORS-enabled media host answers
 *     404;
 *   - the WEB SERVER RULES. Media protection is enforced by generated Apache/nginx
 *     rules, which know about published records — not about a temporary
 *     recognition derivative.
 *
 * None of that is a security boundary for this file: `audio_tr` is a throwaway
 * derivative of a record the caller must already hold WRITE permission on, and the
 * tool builds and deletes it around a single transcription. So it is served here,
 * same-origin, behind the engine's own session + record gate — the same gate
 * `create_transcribable_audio_file` applies before building it.
 *
 * URL: GET /dedalo/tools/tool_transcription/audio?section_tipo=…&section_id=…&component_tipo=…
 *
 * Fail-closed throughout: an absent session, a bad locator, a caller without write
 * permission on the record, or a missing file all return a plain 404. This route
 * never BUILDS the file — it only serves one the gated tool action already made,
 * so it cannot be used to make the engine transcode anything.
 */

import { resolveMediaToolContext } from '../tool_support.ts';
import { transcribableAudioLocation } from './transcription.ts';

import { isValidTipo } from '../../concepts/ontology.ts';
import { getSectionPermissions, resolvePrincipal } from '../../security/permissions.ts';
import { principalCanAccessRecord } from '../../security/record_scope.ts';
import { SESSION_COOKIE, type Session, getSession } from '../../security/session_store.ts';

/** The path this route answers on. */
export const TRANSCRIPTION_AUDIO_PATH = '/dedalo/tools/tool_transcription/audio';

/** Resolve the caller's session from the TS-native cookie (null when absent/expired). */
function readSessionFromCookie(request: Request): Session | null {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const token = cookieHeader
		.split(';')
		.map((pair) => pair.trim())
		.find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
		?.slice(SESSION_COOKIE.length + 1);
	return token !== undefined ? getSession(token) : null;
}

/** Fail-closed refusal — one generic message, no existence or permission leak. */
function refuse(): Response {
	return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Handle GET /dedalo/tools/tool_transcription/audio. The caller (server.ts) routes
 * by path + method only; every check lives here.
 */
export async function handleTranscriptionAudio(request: Request, url: URL): Promise<Response> {
	// Gate 1 — authenticated.
	const session = readSessionFromCookie(request);
	if (session === null) return refuse();

	// Gate 2 — a well-formed locator.
	const sectionTipo = url.searchParams.get('section_tipo') ?? '';
	const componentTipo = url.searchParams.get('component_tipo') ?? '';
	const sectionId = Number(url.searchParams.get('section_id') ?? Number.NaN);
	if (!isValidTipo(sectionTipo) || !isValidTipo(componentTipo)) return refuse();
	if (!Number.isInteger(sectionId) || sectionId < 1) return refuse();

	// Gate 3 — the record is inside the caller's scope AND they may write the
	// section. Same pair the tool action that BUILDS this file asserts: reading the
	// recognition audio is part of writing a transcript, not a public read.
	const principal = await resolvePrincipal(session.userId);
	const inScope = await principalCanAccessRecord(sectionTipo, sectionId, principal);
	if (!inScope) return refuse();
	const permissions = await getSectionPermissions(principal, sectionTipo);
	if (permissions < 2) return refuse();

	// The file itself — never built here, only served.
	try {
		const { spec, identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: componentTipo,
			section_tipo: sectionTipo,
			section_id: sectionId,
		});
		const location = transcribableAudioLocation(spec, identity, pathOpts);
		const file = Bun.file(location.absolutePath);
		if (!(await file.exists())) return refuse();

		return new Response(file, {
			headers: {
				'Content-Type': 'audio/wav',
				// A temporary derivative of personal-data audio: never cached.
				'Cache-Control': 'no-store',
			},
		});
	} catch {
		return refuse();
	}
}
