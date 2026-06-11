/**
 * AUTH
 * Authentication helpers for server-to-server actions (delete_record).
 *
 * Two accepted credentials:
 *  1. A valid Dédalo session cookie (interactive path: PHP forwards the
 *     logged-in user's cookie when section_record::delete runs in a session).
 *  2. The X-Diffusion-Internal-Token header matching DIFFUSION_INTERNAL_TOKEN
 *     from .env (CLI/cron path: retry_pending_deletions.php has no session).
 *
 * The unix socket is exposed publicly through Apache ProxyPass, so
 * localhost trust is NOT acceptable: when DIFFUSION_INTERNAL_TOKEN is
 * unset or empty, the token path is rejected outright.
 */

import { timingSafeEqual } from 'crypto';
import { check_auth }      from './php_client';



/**
 * CHECK_INTERNAL_TOKEN
 * Constant-time comparison of the request token against the configured
 * internal token. Rejected when the env var is unset/empty.
 *
 * @param request_token - Value of the X-Diffusion-Internal-Token header
 * @returns true only when a non-empty configured token matches
 */
export function check_internal_token(request_token: string | null): boolean {

	const configured_token = process.env.DIFFUSION_INTERNAL_TOKEN ?? '';

	if (!configured_token || !request_token) {
		return false;
	}

	const a = Buffer.from(request_token);
	const b = Buffer.from(configured_token);

	if (a.length !== b.length) {
		return false;
	}

	return timingSafeEqual(a, b);
}



/**
 * CHECK_SERVER_AUTH
 * Accepts either a valid session cookie or a valid internal token.
 *
 * @param cookie_header - Raw Cookie header (or null)
 * @param request       - Incoming request (to read the token header)
 * @returns true when authenticated by either mechanism
 */
export async function check_server_auth(cookie_header: string | null, request: Request): Promise<boolean> {

	// Internal token first: cheap, no PHP round-trip
	const request_token = request.headers.get('X-Diffusion-Internal-Token');
	if (check_internal_token(request_token)) {
		return true;
	}

	// Fall back to standard session validation via PHP
	return await check_auth(cookie_header);
}
