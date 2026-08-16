/**
 * The ApiResult — what a handler hands the dispatcher: the HTTP status, the
 * JSON body, and the transport side-effects (cookies, streams) that
 * server.ts turns into a Response.
 *
 * Extracted from dispatch.ts so decomposed handler modules (e.g.
 * src/core/area/read.ts) can build results without importing the dispatcher —
 * dispatch.ts imports the dispatchers, so the dispatchers must not import it
 * back (no cycle). The dispatcher owns routing; this module owns the shape.
 *
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §3-4). A handler:
 *   - SUCCEEDS by returning `ok(data, {requestId, extend?})` from
 *     src/core/errors/convert.ts — `extend` carries its extension keys;
 *   - FAILS by THROWING `new DedaloError(code, {…})` — the dispatch catch is
 *     the ONE converter door (`toErrorEnvelope`), so no handler builds a
 *     failure body. Nothing here builds one either: this module exports the
 *     ApiResult SHAPE and no FAILURE-body builder (the P1-era throwing shells
 *     `denied`/`notAuthorized`/`notLogged` and the legacy_body_adapter are
 *     DELETED — a body without `ok` is a bug the dispatcher refuses loudly;
 *     error_taxonomy_tripwire + authorization_denial_native pin the export set).
 */

import { ok } from '../errors/convert.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { currentRequestContext } from '../security/request_context.ts';

export interface ApiResult {
	status: number;
	/** Envelope v2 — converter-made (`ok(...)`), or the dispatch catch's failure body. */
	body: ApiEnvelope;
	/** Set-Cookie value for session issuance (login). */
	setSessionToken?: string;
	/** Emit an expiring Set-Cookie that clears the session cookie (logout/quit). */
	clearSessionCookie?: boolean;
	/**
	 * Media-auth cookie value for issuance at login (Rule A — core/media/protection.ts):
	 * the 128-hex sha512 whose zero-byte marker under `.publication/auth/` the WEB SERVER
	 * stat()s to authorize a media request. Absent when the access mode is false, which is
	 * a total no-op: no cookie, no markers, no rule files.
	 *
	 * Handlers hand over a VALUE, never a header — server.ts owns the cookie policy
	 * (Secure/HttpOnly/SameSite), exactly as it does for the session cookie.
	 */
	setMediaAuthCookie?: string;
	/** Emit an expiring Set-Cookie that clears the media-auth cookie (logout/quit). */
	clearMediaAuthCookie?: boolean;
	/**
	 * Long-lived streaming payload (diffusion SSE). When set, server.ts returns
	 * the stream as the raw Response body with `streamHeaders` instead of
	 * JSON-serializing `body` — the dispatch gates (auth/CSRF/allowlist) still
	 * ran in front, which is the whole point of threading streams through
	 * ApiResult rather than a side route.
	 */
	stream?: ReadableStream<Uint8Array>;
	streamHeaders?: Record<string, string>;
	/**
	 * Set by the dispatch catch from the thrown `retryAfterMs` (limit /
	 * unavailable codes) — server.ts emits the `Retry-After` header from it.
	 */
	retryAfterMs?: number;
}

/**
 * A STREAMED result (SSE: diffusion follow, job events, process status).
 * server.ts writes `stream` with `streamHeaders` and NEVER serializes `body`;
 * the body is still an envelope (`ok(null)`, request-scoped id) so ApiResult
 * stays ONE shape and the dispatcher's envelope check needs no stream carve-out
 * beyond `stream !== undefined`. The dispatch gates (auth/CSRF/allowlist) ran
 * in front — that is the whole point of threading streams through ApiResult.
 */
export function streamResult(
	stream: ReadableStream<Uint8Array>,
	streamHeaders?: Record<string, string>,
): ApiResult {
	const result: ApiResult = {
		status: 200,
		body: ok(null, { requestId: currentRequestContext()?.requestId ?? '' }),
		stream,
	};
	if (streamHeaders !== undefined) result.streamHeaders = streamHeaders;
	return result;
}
