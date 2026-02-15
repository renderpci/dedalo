/**
 * SESSION
 * Cookie passthrough for shared authentication.
 * The browser sends the session cookie (named 'dedalo_<entity>')
 * automatically via same-origin request. Apache ProxyPass forwards it
 * to Bun, and we simply pass it through to the PHP API, which handles
 * session validation natively.
 */



/**
 * EXTRACT_COOKIE_HEADER
 * Extracts the full Cookie header from an incoming request for forwarding.
 *
 * @param request - The incoming HTTP request
 * @returns Raw Cookie header string or null
 */
export function extract_cookie_header(request: Request): string | null {
	return request.headers.get('Cookie') ?? null;
}
