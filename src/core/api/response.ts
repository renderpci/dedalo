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
 *     failure body. Nothing here builds one either: the three names below are
 *     TRANSITIONAL throwing shells (typed `never`) kept only so the unswept
 *     call sites compile and already refuse through the converter; they are
 *     deleted with legacy_body_adapter.ts at P1 exit.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import type { ApiEnvelope } from '../errors/schema.ts';
import { legacyCodeFor } from './legacy_body_adapter.ts';

/**
 * TRANSITIONAL — a not-yet-swept handler body (`{result, msg, errors, …}`).
 * The dispatcher passes it through legacy_body_adapter.ts; deleted with it.
 */
export type LegacyApiBody = Record<string, unknown>;

export interface ApiResult {
	status: number;
	/** Envelope v2 (converter-made) — or, until the sweep completes, a legacy body. */
	body: ApiEnvelope | LegacyApiBody;
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
 * TRANSITIONAL throwing shell — DELETED AT P1 EXIT (with legacy_body_adapter.ts).
 * Was the PHP "denied JSON output" builder; now it THROWS the code the message
 * token or status maps to (`legacyCodeFor`), so every unswept `return denied(…)`
 * site already refuses through the converter with the registry status. The
 * sweep replaces each call with an explicit `throw new DedaloError(code, …)`.
 */
export function denied(status: number, message: string): never {
	throw new DedaloError(legacyCodeFor(message, status), { publicMessage: message });
}

/**
 * TRANSITIONAL throwing shell — DELETED AT P1 EXIT. The authorization refusal
 * (WC-2026-08-12-authorization-denial-token) is `perm.denied`; the default
 * message names nothing because it is shown to the REFUSED user.
 */
export function notAuthorized(message = 'Insufficient permissions'): never {
	throw new DedaloError('perm.denied', { publicMessage: message });
}

/**
 * TRANSITIONAL throwing shell — DELETED AT P1 EXIT. The authentication
 * refusal (WC-051) is `auth.not_logged`, the code the client's re-login
 * recovery keys on.
 */
export function notLogged(message = 'Authentication required'): never {
	throw new DedaloError('auth.not_logged', { publicMessage: message });
}
