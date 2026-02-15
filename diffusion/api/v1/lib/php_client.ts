/**
 * PHP_CLIENT
 * HTTP client that bridges to the PHP dd_diffusion_api.
 * Forwards RQO requests and returns the parsed JSON response.
 * Passes the browser's Cookie header through for session authentication.
 */

import type { rqo, php_api_response } from './types';



const DEDALO_API_URL = process.env.DEDALO_API_URL || 'http://localhost/dedalo/core/api/v1/json/';
const REQUEST_TIMEOUT_MS = 60_000; // 60 seconds



/**
 * CALL_DD_DIFFUSION_API
 * Sends an RQO to the PHP dd_diffusion_api and returns the parsed response.
 * Automatically injects `dd_api: "dd_diffusion_api"` into the request body.
 *
 * @param request_rqo   - The RQO from the client
 * @param cookie_header  - Raw Cookie header from the browser request (forwarded as-is)
 * @returns The parsed PHP API response
 */
export async function call_dd_diffusion_api(
	request_rqo:   rqo,
	cookie_header?: string
): Promise<php_api_response> {

	// Inject dd_api for the PHP router
	const body = {
		...request_rqo,
		dd_api: 'dd_diffusion_api'
	};

	// Build headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	// Forward the browser's Cookie header for PHP session authentication
	if (cookie_header) {
		headers['Cookie'] = cookie_header;
	}

	try {
		const controller = new AbortController();
		const timeout_id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		const response = await fetch(DEDALO_API_URL, {
			method:  'POST',
			headers,
			body:    JSON.stringify(body),
			signal:  controller.signal,
		});

		clearTimeout(timeout_id);

		if (!response.ok) {
			return {
				result: false,
				msg:    `PHP API returned HTTP ${response.status}: ${response.statusText}`,
				errors: [`HTTP ${response.status}`]
			};
		}

		const data = await response.json() as php_api_response;

		return data;

	} catch (error: unknown) {
		const err_msg = error instanceof Error ? error.message : String(error);
		return {
			result: false,
			msg:    `Failed to call PHP diffusion_api: ${err_msg}`,
			errors: [err_msg]
		};
	}
}
