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

/** Uniform permission/validation denial (PHP denied JSON output). */
export function denied(status: number, message: string): ApiResult {
	return { status, body: { result: false, msg: message, errors: [message] } };
}
