/**
 * Shared API response shape + helpers.
 *
 * Extracted from dispatch.ts so decomposed handler modules (e.g.
 * src/core/area/read.ts) can build results without importing the dispatcher —
 * dispatch.ts imports the dispatchers, so the dispatchers must not import it
 * back (no cycle). The dispatcher owns routing; this module owns the envelope.
 */

export interface ApiResult {
	status: number;
	body: Record<string, unknown>;
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
}

/**
 * Uniform validation/refusal denial (PHP denied JSON output).
 *
 * NOT for authorization refusals — those are {@link notAuthorized} (403), which
 * carries a machine token the client dispatches on. `denied(403, …)` is refused
 * mechanically by `test/unit/authorization_denial_native.test.ts`.
 */
export function denied(status: number, message: string): ApiResult {
	return { status, body: { result: false, msg: message, errors: [message] } };
}

/**
 * The AUTHORIZATION denial (WC-2026-08-12-authorization-denial-token) — the 403
 * sibling of {@link notLogged}, and for the same reason.
 *
 * `denied(403, 'Insufficient permissions to read')` put the human sentence in
 * `errors`, the machine channel, so nothing could dispatch on it: the client's
 * fetch layer classified the 403 as a non-retryable transport failure and
 * painted a permanent red "Not retry-able HTTP error 403" over a blank page —
 * the whole answer a user got for opening a page they lack a grant for.
 *
 * `errors` now carries the token `not_authorized`; the human message stays in
 * `msg`. The client exempts 403 from its transport-error classification exactly
 * as it does 401, reads the envelope, and renders the localized
 * "no permission" page (`get_label.no_access_page`).
 *
 * The default message is deliberately generic: it is shown to the refused user,
 * and naming the element they cannot reach is an information leak. Call sites
 * that pass a specific sentence keep it — none of them name a record.
 */
export function notAuthorized(message = 'Insufficient permissions'): ApiResult {
	return { status: 403, body: { result: false, msg: message, errors: ['not_authorized'] } };
}

/**
 * The AUTHENTICATION denial (WC-051). Distinct from `denied` because the whole
 * client keys its re-login recovery on the literal error token `not_logged`
 * (page.js → render_relogin, common.js, component_common.js, render_common.js —
 * all four switch on that exact string, inherited from the PHP oracle).
 *
 * `denied(401, 'Authentication required')` put the human message in `errors`, so
 * no branch ever matched and the entire recovery UX was unreachable: an expired
 * session surfaced as a thrown fetch error and blank widgets. The message stays
 * in `msg` for humans; `errors` carries the machine token the client dispatches on.
 */
export function notLogged(message = 'Authentication required'): ApiResult {
	return { status: 401, body: { result: false, msg: message, errors: ['not_logged'] } };
}
