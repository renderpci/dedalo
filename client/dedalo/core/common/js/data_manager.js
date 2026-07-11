// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL, Promise */
/*eslint no-undef: "error"*/



/**
* DATA_MANAGER
* Central client-to-server request layer for Dédalo v7.
*
* Responsibilities:
* - Building and dispatching all API calls to the PHP JSON endpoint
*   (`api/v1/json/`) with configurable HTTP options (method, mode, credentials).
* - Retry-with-exponential-backoff and per-attempt timeout via
*   `_fetch_with_retry_and_timeout`.
* - CSRF token management (SEC-008): reads the token from `page_globals.csrf_token`,
*   injects it as `X-Dedalo-Csrf-Token`, refreshes it from every response, and
*   performs a single transparent retry on CSRF rejection.
* - Short-circuit caching against the browser's IndexedDB (`cache_handler: {handler:'localdb'}`).
* - SSE / NDJSON streaming support via `request_stream` / `request_fetch_stream` /
*   `read_stream`.
* - Persisting UI state and cached lookups to IndexedDB through the
*   `*_local_db*` family of methods.
* - Convenience download helpers (`download_url`, `download_data`).
*
* Main exports: `data_manager` (namespace object), `check_server_health`,
* `render_msg_to_inspector`, `download_url`, `download_data`.
*/

// imports
	import {JSON_parse_safely} from '../../../core/common/js/utils/util.js'
	import {event_manager} from './event_manager.js'
	import {dd_request_idle_callback} from './events.js';



/**
* CLASS HTTPERROR
* Custom Error subclass representing an HTTP-level failure (non-2xx response).
* Raised by `_fetch_with_retry_and_timeout` so that retry logic can inspect
* the HTTP status code separately from a generic network `TypeError`.
* Retryable statuses: 408, 429, 500, 502, 503, 504.
* Non-retryable 4xx errors are re-thrown immediately without further attempts.
* @see _fetch_with_retry_and_timeout
*/
class HttpError extends Error {
	constructor(status, statusText, response) {
		super(`HTTP ${status}: ${statusText}`);
		this.name = 'HttpError';
		this.status = status;
		this.statusText = statusText;
		this.response = response;
	}
}



/**
* DATA_MANAGER
* Namespace / static object that owns all client-to-server communication.
* All API calls pass through `data_manager.request`; streaming calls use
* `data_manager.request_stream` or `data_manager.request_fetch_stream`.
* IndexedDB access is mediated by the `*_local_db*` methods.
*/
export const data_manager = function() { }

// static properties

/**
* CREDENTIALS
* Default `credentials` option for all `fetch()` calls.
* `'same-origin'` sends cookies only to the same origin (Dédalo default).
* Set to `'include'` when the API is on a different origin (cross-domain setup).
* @type {string}
*/
data_manager.credentials = 'same-origin'

/**
* MODE
* Default `mode` option for all `fetch()` calls.
* `'cors'` allows cross-origin requests subject to CORS headers.
* @type {string}
*/
data_manager.mode = 'cors'

/**
* URL
* Derived API endpoint URL.
* Prefers the global `DEDALO_API_URL` constant (set during page bootstrap)
* and falls back to the relative path `'../api/v1/json/'` for same-host installs.
* Accessed as a getter so it always reflects the current global value.
* @type {string}
*/
Object.defineProperty(data_manager, 'url', {
	get: function() {
		if(typeof DEDALO_API_URL !== 'undefined') {
			return DEDALO_API_URL
		}
		const api_url = '../api/v1/json/'

		return api_url
	}
});

/**
* HEALTH_URL
* Derived URL of the lightweight health-check endpoint (`<url>health/`).
* Called by `check_server_health` to determine whether a slow main request
* is still being processed or the server is truly unreachable.
* @type {string}
*/
Object.defineProperty(data_manager, 'health_url', {
	get: function() {
		return this.url + 'health/'
	}
});



/**
* CHECK_SERVER_HEALTH
* Probes the lightweight PHP health endpoint to verify the server is reachable
* and responding without triggering the full API bootstrap.
* Cache-busted with `performance.now()` + random number to prevent CDN / proxy
* caching from masking a real outage.
* Used by `_fetch_with_retry_and_timeout` to distinguish a long-running process
* (server alive but busy) from a genuine server failure.
* @returns {Promise<boolean>} true when the server responds with HTTP 2xx
*/
export const check_server_health = async () => {
	try {
		const health_url = data_manager.health_url
		const url = health_url + '?time=' + performance.now() + Math.floor(Math.random() * 1000)
		const response = await fetch( url, {
			method: 'GET',
			cache: 'no-cache'
		});
		return response.ok;
	} catch (error) {
		return false;
	}
}//end check_server_health



/**
* REQUEST
* Central API call dispatcher. Serializes `options.body` to JSON, attaches the
* CSRF token (SEC-008), dispatches through `_fetch_with_retry_and_timeout`, parses
* the JSON response, and returns a normalized API response object.
*
* Key behaviors:
* - Merges caller-supplied options with safe defaults (5 retries, 500 ms base
*   delay, 5 000 ms timeout). All defaults can be overridden per call.
* - If `options.cache_handler.handler === 'localdb'`, looks up the result from
*   IndexedDB before going to the network and stores a successful response back
*   on idle.
* - Injects `recovery_mode: true` into every body when
*   `page_globals.recovery_mode` is set, so server-side operations skip
*   non-essential side effects.
* - On CSRF rejection (`errors` includes `'csrf_failed'`), retries the request
*   exactly once with the fresh token obtained from the rejection response.
*   The `_csrf_retried` flag on options prevents an infinite loop.
* - Logs structured error objects to `page_globals.api_errors` (captured by the
*   page renderer to display user-visible error banners).
* - Publishes `'api_response_errors'` events via `event_manager` when the
*   server returns non-fatal `errors` alongside a valid result.
*
* @param {Object} options - Request configuration
* @param {string} [options.url] - Override the default API URL
* @param {string} [options.method='POST'] - HTTP method
* @param {string} [options.cache='no-cache'] - Fetch cache mode
* @param {string} [options.mode] - Fetch mode (defaults to `data_manager.mode`)
* @param {string} [options.credentials] - Fetch credentials (defaults to `data_manager.credentials`)
* @param {Object} [options.headers] - HTTP request headers
* @param {string} [options.redirect='follow'] - Fetch redirect mode
* @param {string} [options.referrer='no-referrer'] - Fetch referrer
* @param {Object|string|null} [options.body=null] - Request payload; objects are JSON-stringified
* @param {boolean} [options.use_worker=false] - Route through a Web Worker (currently deactivated)
* @param {number} [options.retries=5] - Maximum retry attempts
* @param {number} [options.base_delay=500] - Base exponential-backoff delay in ms
* @param {number} [options.timeout=5000] - Per-attempt timeout in ms
* @param {Object} [options.cache_handler] - IndexedDB cache descriptor `{handler:'localdb', id:string}`
* @param {boolean} [options._csrf_retried] - Internal flag; prevents recursive CSRF retry
* @returns {Promise<Object>} Parsed API response. Always an object; on failure:
*   `{ result: false, msg: string, error: *, errors: string[] }`
*/
data_manager.request = async function(options) {

	const self = this

	const default_options = {
		url			: options.url || self.url,
		method		: 'POST', // *GET, POST, PUT, DELETE, etc.
		cache		: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
		mode		: self.mode, // no-cors, cors, *same-origin
		credentials	: self.credentials, // include, *same-origin, omit . Default Dédalo: 'same-origin' (use 'include' for cross origin API)
		headers		: {'Content-Type': 'application/json'}, // 'Content-Type': 'application/x-www-form-urlencoded'
		redirect	: 'follow', // manual, *follow, error
		referrer	: 'no-referrer', // no-referrer, *client
		body		: null, // body data type must match "Content-Type" header
		use_worker	: false,
		retries		: 5, // default request retries int
		base_delay	: 500, // default base delay in ms
		timeout		: 5000 // default timeout in ms
	};

	const merged_options = { ...default_options, ...options };

	// vars from options applying defaults
	const { url, method, mode, cache, credentials, headers, redirect, referrer, body, use_worker, retries, base_delay, timeout } = merged_options;

	// SEC-008: attach the CSRF token captured from the previous API response
	// (or `null` on the very first call). The server requires the
	// X-Dedalo-Csrf-Token header for every action that is not in its bootstrap
	// allowlist. Headers is a plain object on the merged options so we can
	// extend it in place; do not overwrite a token already set by a caller.
	if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
		if (!headers['X-Dedalo-Csrf-Token']) {
			headers['X-Dedalo-Csrf-Token'] = window.page_globals.csrf_token;
		}
	}

	// cache_handler
	const cache_handler = options.cache_handler || null
	if (cache_handler?.handler==='localdb') {
		const cached_data = await this.get_local_db_data(
			cache_handler.id,
			'data' // string table
		);
		if (cached_data) {
			return cached_data.value
		}
	}

	// Debug request
	if(SHOW_DEBUG) {
		const action		= body?.action || 'load';
		const worker_label	= use_worker ? '[wk] ' : ''
		const source_model	= body?.source?.model || ''
		console.warn(`> data_manager request ${worker_label}${method}:`, action.toUpperCase(), source_model, merged_options);
	}

	// recovery mode. Auto add if environment recovery_mode is true
	// On set to true, it is passed across all API request calls preserving the mode
	if (window.page_globals.recovery_mode && body) {
		if (typeof body === 'object') {
			body.recovery_mode = true;
		}
	}

	// Reset page_globals.api_errors at the beginning of each request
	window.page_globals.api_errors = [];
	window.page_globals.request_message = null; // Reset request message

	// Check URL
	if (!url || !url.length) {
		const msg = 'Error: empty or invalid API URL';
		console.error(msg, { typeof: typeof url, value: url });
		this._record_api_error(
			'data_manager', // error_type
			msg, // message
			'data_manager URL validation', // trace
			null // details
		)
		return {
			result	: false,
			msg		: msg,
			error	: 'URL is not valid',
			errors	: ['URL is not valid']
		};
	}
	// Adding 'time' param prevents potential proxy problems in 'no-cache' calls
	// 'time' param is ignored by the API endpoint (@see ../json/index.php)
	// const safe_url = merged_options.cache === 'no-cache'
	// 	? url // + '?time=' + performance.now() + Math.floor(Math.random() * 1000)
	// 	: url
	const safe_url = url

	// using worker cases.
		// Note that execution is slower, but it is useful for low priority
		// calls like 'update_lock_components_state'
		// (!) Deactivated 22-05-2025 temporally to simplify network issues debug
		// if (use_worker === true) {
		// 	return this._handle_worker_request(url, body);
		// }

	// handle_errors
	const handle_errors = async (response) => {
		if (!response.ok) {
			console.warn("-> HANDLE_ERRORS response:", response);
			// extract response text to console
			let response_text;
			try {
				response_text = await response.text();
			} catch (textError) {
				response_text = `Failed to read response text: ${textError.message}`;
			}
			console.error(response_text);
			this._record_api_error(
				'data_manager', // error_type
				response_text, // message
				'data_manager fetch handle_errors', // trace
				null // details
			);
			throw new Error(response.statusText || `HTTP error! status: ${response.status}`);
		}
		return response;
	}

	try {
		const request_start_time = performance.now();

		// Prepare body for request
		let request_body = null;
		if (body) {
			if (typeof body === 'string') {
				request_body = body;
			} else {
				try {
					request_body = JSON.stringify(body);
				} catch (jsonError) {
					throw new Error(`Failed to serialize request body: ${jsonError.message}`);
				}
			}
		}

		// exec fetch with retry and timeout
		const fetch_response = await _fetch_with_retry_and_timeout(
			safe_url,
			{
				method		: method,
				mode		: mode,
				cache		: cache,
				credentials	: credentials,
				headers		: headers,
				redirect	: redirect,
				referrer	: referrer,
				body		: request_body
			},
			retries,
			base_delay,
			timeout
		)

		const data_start_time = performance.now();

		// Parse API JSON response handling errors
		const json_response = await (await handle_errors(fetch_response)).json();

		// SEC-008: refresh the cached CSRF token from every response so the
		// next call carries the latest one (the server may rotate it on auth
		// state changes such as login or logout).
		if (json_response && typeof json_response.csrf_token === 'string' && json_response.csrf_token.length > 0) {
			if (typeof window !== 'undefined' && window.page_globals) {
				window.page_globals.csrf_token = json_response.csrf_token;
			}
		}

		// SEC-008: transparent retry on CSRF rejection. This handles the bootstrap
		// race where a non-exempt action fires before the SPA has obtained a
		// token from `start` (e.g. parallel menu/read calls during page build,
		// or the post-login full page reload that resets page_globals). The
		// rejection response already carries a fresh token (captured above), so
		// we just resend the original request exactly once. The `_csrf_retried`
		// flag on options prevents infinite loops if the server still refuses.
		if (
			json_response
			&& json_response.result === false
			&& Array.isArray(json_response.errors)
			&& json_response.errors.includes('csrf_failed')
			&& !options._csrf_retried
		) {
			console.warn('CSRF token mismatch; retrying once with fresh token.');
			return self.request({ ...options, _csrf_retried: true });
		}

		if(SHOW_DEBUG) {
			console.log(`_*_Time to request: ${(performance.now() - request_start_time).toFixed(2)}ms`);
			console.log(`_*_Time to download data: ${(performance.now() - data_start_time).toFixed(2)}ms`);
		}

		// Fetch error occurred. Catch and alert
		if (json_response?.error) {

			// debug console message
			console.error("data_manager request api_response:", json_response);

			// update_lock_components_state fails. Do not send alert here
			const action = body?.action;
			if (action !== 'update_lock_components_state') {
				// alert msg to user
				const msg = json_response.msg || json_response.error;
				if (!window.page_globals.request_message || window.page_globals.request_message !== msg) {
					render_msg_to_inspector(
						`An error has occurred in the API connection\n[data_manager.request]\n\n${msg}`,
						'error',
						10000
					);
				}
				// request_message. Store request message temporally
				window.page_globals.request_message = msg;
				setTimeout(() => {
					window.page_globals.request_message = null;
				}, 3000);
			}

			// save error message. This is captured by page rendering to display the proper error
			// api_errors. store api_errors. Used to render error page_globals
			this._record_api_error(
				'data_manager', // error_type
				json_response.msg || json_response.error, // message
				'data_manager json_parsed', // trace
				json_response.errors?.length ? json_response.errors.join(' | ') : '' // details
			)

			return json_response;
		}

		// Response errors (not fetch errors) from server API
		if (json_response?.errors?.length) {
			event_manager.publish('api_response_errors', json_response?.errors);
		}

		// cache_handler. Only cache api response if result is not false
		if (cache_handler?.handler==='localdb' && json_response?.result !== false) {
			dd_request_idle_callback(
				() => {
					this.set_local_db_data(
						{
							id		: cache_handler.id,
							value	: json_response
						},
						'data' // string table
					);
				}
			);
		}

		return json_response;

	} catch (error) {

		console.warn('request url:', typeof url, url);
		console.warn("request options:", options);
		console.error("!!!!! [data_manager.request] SERVER ERROR. Received data is not JSON valid or network error. See your server log for details. catch ERROR:\n", error);

		// api_errors. store api_errors. Used to render error page_globals
		this._record_api_error(
			'data_manager', // error_type
			error.message || 'Network error or invalid JSON', // message
			'data_manager catch error', // trace
			error // details
		)

		return {
			result	: false,
			msg		: error.message || 'Network error',
			error	: error,
			errors	: [error.message || 'Network error'],
		};
	}
}//end request



/**
* _FETCH_WITH_RETRY_AND_TIMEOUT
* Low-level fetch driver with exponential-backoff retry and per-attempt timeout.
* This is the only place that calls the native `fetch()` for regular (non-streaming)
* requests; `data_manager.request` delegates here after preparing the request body.
*
* Algorithm per attempt:
*  1. Compute `delay = base_delay * 2^(attempt-1)` (exponential backoff).
*  2. Create a fresh `AbortController`; schedule `controller.abort()` after
*     `timeout + delay` ms (growing with each retry to give later attempts more time).
*  3. Schedule a mid-attempt health probe at `timeout / 2` ms. If the server
*     responds to the health check, the main-request abort is cancelled so the
*     long-running process can finish naturally.
*  4. On a successful 2xx response, clear both timers and return the `Response`.
*  5. On `HttpError`: retry only for statuses in `[408, 429, 500, 502, 503, 504]`;
*     throw immediately for all other 4xx.
*  6. On `AbortError` or `TypeError` (network failure): log, notify the user via
*     `render_msg_to_inspector`, and loop.
*  7. After all retries exhausted, throw to let `data_manager.request` catch and
*     return a normalized error response.
*
* @param {string} url - Full API endpoint URL
* @param {Object} [options={}] - Native `fetch()` init options (headers, method, body, …)
* @param {number} [retries=5] - Maximum number of attempts
* @param {number} [base_delay=500] - Base delay in ms for exponential backoff
* @param {number} [timeout=5000] - Abort timeout in ms for the first attempt
* @returns {Promise<Response>} Resolved with the raw `Response` on success
* @throws {Error} When all retries are exhausted or a non-retryable HTTP error occurs
*/
async function _fetch_with_retry_and_timeout(url, options = {}, retries = 5, base_delay = 500, timeout = 5000) {

	let attempts = 0;

	while (attempts < retries) {
		attempts++;

		if(SHOW_DEBUG && attempts > 1) {
			console.log('Trying : ', attempts);
		}

		// Delay between tries. Exponential backoff
		const delay = base_delay * Math.pow(2, attempts - 1); // Fixed: attempts-1 for proper backoff

		// Increase timeout in each API call
		const current_time_out = attempts === 1
			? timeout
			: timeout + delay

		// Create a controller for the request in each iteration
		const controller = new AbortController();
		const signal = controller.signal;

		// Set the controller timeout and get his ID
		const timeout_id = setTimeout(() => controller.abort(), current_time_out);

		// check_long_process_time
		// If there is no response from the server within the assigned timeout period,
		// the server will be asked for its status (minimum health request).
		// If the server responds before the timeout ends, the timeout will be removed
		// to allow time to complete the main request (a long process probably).
		const check_long_process_time = parseInt( current_time_out / 2 )
		const server_health_timeout_id = setTimeout(async () => {
			try {
				// fast API call to check health
				const is_server_health = await check_server_health()
				if (is_server_health) {
					// Clear main timeout to prevent fire the signal timeout
					// This allows to wait until main request ends (stops new tries).
					clearTimeout(timeout_id);
					const msg = 'Awaiting for busy server..'
					if(SHOW_DEBUG) {
						console.log(msg);
					}
					render_msg_to_inspector(msg, 'warning', delay + 3000);
				}
			} catch (health_error) {
				// Handle health check errors silently or log them
				if(SHOW_DEBUG) {
					console.log('Health check failed:', health_error.message);
				}
			}

		},  check_long_process_time)

		try {

			// Attempt the fetch request with timeout and retry logic
			const response = await fetch(url, { ...options, signal });

			// Clear timeouts once fetch completes
			clearTimeout(timeout_id);
			clearTimeout(server_health_timeout_id);

			// Handle HTTP errors (4xx, 5xx)
			if (!response?.ok) {
				throw new HttpError(response.status, response.statusText, response);
			}

			return response;
		} catch (error) {

			// ensure cleanup timeouts if fetch throws before completion
			clearTimeout(timeout_id);
			clearTimeout(server_health_timeout_id);

			// HttpError. Don't retry on client errors (4xx) except 408, 429
			if (error instanceof HttpError) {
				// notify to user
				const msg = `Server responded with status ${error.status}`;
				render_msg_to_inspector(msg, 'warning', 7000);

				const retryableStatuses = [408, 429, 500, 502, 503, 504];
				if( !retryableStatuses.includes(error.status) ) {
					const msg = `Not retry-able HTTP error ${error.status}`;
					render_msg_to_inspector(msg, 'error', null);
					console.error(msg);
					throw new Error(msg);
				}
			}

			// AbortError. Controller abort case
			if (error.name === 'AbortError') {
				// notify to user
				const msg = `Request (${attempts}) timed out after ${current_time_out/1000}s`
				render_msg_to_inspector(msg, 'warning', delay + 3000);
				console.error(msg);
			}

			// TypeError. Network error
			if (error instanceof TypeError && error.message.includes('fetch')) {
				// notify to user
				const msg = `Network connection failed`
				render_msg_to_inspector(msg, 'warning', delay + 3000);
				console.error(msg);
			}

			// If we've exhausted the retries, throw error
			if (attempts >= retries) {
				const msg = 'Max retries reached, request failed.';
				render_msg_to_inspector(msg, 'error', null);
				throw new Error(msg);
			}

			// Exponential backoff: increase delay between retries
			{
				const msg = `Retrying in ${delay}ms. Please wait...`
				render_msg_to_inspector(msg, 'warning', delay + 3000);
				if(SHOW_DEBUG) {
					console.log(`Retrying in ${delay}ms...`);
				}
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
}//end _fetch_with_retry_and_timeout



/**
* _FETCH_WITH_RACE
* Alternative fetch strategy: fires up to `retries` staggered fetch attempts
* simultaneously and resolves with whichever finishes first (`Promise.race`).
* All remaining in-flight requests are aborted via a shared `AbortController`
* once a winner is determined.
*
* This function is NOT currently used by `data_manager.request` — the active
* strategy is `_fetch_with_retry_and_timeout`. It is retained as an experimental
* alternative for comparison.
*
* (!) Retries share a single AbortController: aborting one aborts all.
*
* @param {string} url - Full API endpoint URL
* @param {Object} [options={}] - Native `fetch()` init options
* @param {number} [retries=5] - Number of parallel staggered attempts
* @param {number} [base_delay=500] - Stagger delay increment between attempts in ms
* @param {number} [timeout=5000] - Overall race timeout in ms (total_timeout = timeout * retries)
* @returns {Promise<Response>} The first successful response, extended with `controller`
* @throws {Error} When the race is lost or all attempts fail
*/
async function _fetch_with_race(url, options = {}, retries = 5, base_delay = 500, timeout = 5000) {

	// Create a controller in each iteration
	const controller = new AbortController();
	const signal = controller.signal;

	const race_calls = []
	const total_timeout = timeout * retries
	for (let i = 0; i < retries; i++) {

		const delay = (i==0)
			? 0
			: base_delay * Math.pow(2, i+1);

		const api_response = new Promise(function(resolve){
			if(SHOW_DEBUG) {
				console.log('Promise :', i+1 + ' - delay: ' + delay);
			}
			setTimeout(() => {
				resolve(
					fetch(url, { ...options, signal })
				)
			}, delay);
		})
		// const api_response = new Promise(resolve => setTimeout(resolve, 6000));

		race_calls.push(api_response)
	}
	// Add a total timeout to the race to prevent an infinite wait.
	race_calls.push( new Promise(resolve => setTimeout(resolve, total_timeout)) )

	try {
		const api_response = await Promise.race(race_calls)

		// Handle HTTP errors (4xx, 5xx)
		if (!api_response?.ok) {
			controller.abort();
			throw new Error(api_response);
		}

		// set the controller to abort after parse JSON
		api_response.controller = controller

		return api_response
	} catch (error) {
		controller.abort();
		// Error case
		console.error("RACE failed with error:", error);
		const msg = 'Max retries reached, request failed. ' + error;
		throw new Error(msg)
	}
}//end fetch_with_race



/**
* RENDER_MSG_TO_INSPECTOR
* Publishes a user-visible notification via the `event_manager` 'notification' channel.
* The inspector UI subscribes to this event and renders a temporary banner.
* Used throughout the data layer to surface network errors, retry warnings,
* and server-busy notices without coupling the data layer to a specific UI component.
* @param {string} msg - Human-readable notification text
* @param {string} type - Severity level: `'error'`, `'warning'`, or `'info'`
* @param {number|null} remove_time - Auto-dismiss delay in ms; pass `null` for sticky notifications
* @returns {void}
*/
export const render_msg_to_inspector = (msg, type, remove_time) => {

	event_manager.publish('notification', {
		msg			: msg,
		type		: type,
		remove_time	: remove_time
	})
}//end render_msg_to_inspector



/**
* _HANDLE_WORKER_REQUEST
* Routes an API call through a short-lived Web Worker (`worker_data.js`)
* so the main thread is not blocked during low-priority network calls
* (e.g., `update_lock_components_state`).
*
* Each call spawns a fresh Worker, posts `{url, body}`, waits for the
* `api_response` message, then terminates the worker. Errors at any stage
* (worker creation, onerror, missing `api_response`) are caught and resolved
* as a normalized error response so callers never receive a rejected promise.
*
* (!) Currently deactivated in `data_manager.request` (see the commented-out
* block) while network issue debugging is in progress.
*
* @param {string} url - API endpoint URL
* @param {Object} body - Request payload (not yet JSON-stringified)
* @returns {Promise<Object>} Resolved with the parsed API response object
*/
data_manager._handle_worker_request = function(url, body) {

	return new Promise((resolve, reject) => {
		try {
			const current_worker = new Worker(DEDALO_CORE_URL + '/common/js/worker_data.js', {
				type: 'module'
			});

			current_worker.postMessage({ url, body });

			current_worker.onerror = (event) => {
				console.error("There is an error with current worker error!", event);
				this._record_api_error('data_manager', 'Worker error', 'worker onerror', event);
				current_worker.terminate();
				reject(this._create_error_response('Worker error', event.message));
			};

			current_worker.onmessage = (e) => {
				if (!e.data?.api_response) {
					const error_message = 'Error in worker response: missing api_response';
					console.error(error_message, 'e.data:', e.data);
					this._record_api_error('data_manager', error_message, 'worker onmessage', e.data);
					current_worker.terminate();
					reject(this._create_error_response(error_message, 'Missing API response from worker'));
					return;
				}
				current_worker.terminate();
				resolve(e.data.api_response);
			};
		} catch (error) {
			console.error("Error creating worker:", error);
			this._record_api_error('data_manager', error.message, 'worker creation');
			reject(this._create_error_response(error.message, 'Failed to create worker'));
		}
	}).catch(error => {
		console.error("Worker Promise Catch:", error);
		this._record_api_error('data_manager', error.message, 'data_manager worker catch error');
		return this._create_error_response(error.message, error);
	});
}//end _handle_worker_request



/**
* _RECORD_API_ERROR
* Appends a structured error entry to `page_globals.api_errors`.
* The array is reset to `[]` at the start of every `data_manager.request` call
* and inspected by the page renderer to decide whether to show an error overlay.
* @param {string} error_type - Category label (e.g. `'data_manager'`)
* @param {string} message - Human-readable error description
* @param {string} trace - Code location identifier for debugging (e.g. `'data_manager catch error'`)
* @param {*} [details=null] - Optional raw error object or additional context
* @returns {void}
*/
data_manager._record_api_error = function(error_type, message, trace, details = null) {
	page_globals.api_errors.push({
		error	: error_type,
		msg		: message,
		trace	: trace,
		details	: details,
	});
}//end _record_api_error



/**
* _CREATE_ERROR_RESPONSE
* Builds a normalized failure response object matching the shape that callers
* of `data_manager.request` expect when the API cannot be reached.
* Ensures downstream code can always destructure `{ result, msg, error, errors }`
* without null-checking.
* @param {string} msg - Human-readable error description
* @param {*} error - Original error object or message string
* @returns {Object} `{ result: false, msg, error, errors: [msg] }`
*/
data_manager._create_error_response = function(msg, error) {
	return {
		result	: false,
		msg		: msg,
		error	: error,
		errors	: [msg],
	};
}//end _create_error_response



/**
* REQUEST_STREAM
* Opens a Server-Sent Events (SSE) streaming connection to the API.
* Unlike `data_manager.request`, this method does not parse JSON — it resolves
* with the raw `ReadableStream` from `response.body`, which must then be consumed
* by `data_manager.read_stream`.
*
* The body is force-patched with `is_stream: true` before serialization, signalling
* to the PHP endpoint that it should switch to `Content-Type: text/event-stream`
* and flush chunks incrementally.
*
* Also carries the CSRF token (SEC-008) in the `X-Dedalo-Csrf-Token` header.
*
* @see https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/ReadableStream
* @param {Object} options - Request configuration (same shape as `data_manager.request`)
* @param {Object} options.body - Request payload; `is_stream` is appended automatically
* @param {string} [options.url] - Override the default API URL
* @param {string} [options.method='POST'] - HTTP method
* @param {Object} [options.headers] - HTTP headers; `Accept: text/event-stream` set by default
* @returns {Promise<ReadableStream>} Resolved with the raw `response.body` stream
*/
data_manager.request_stream = async function(options) {

	const self = this

	// short vars
	const url			= options.url || self.url
	const method		= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
	const cache			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
	const mode			= options.mode || self.mode // no-cors, cors, *same-origin
	const credentials	= options.credentials || self.credentials // include, *same-origin, omit . Default Dédalo: 'same-origin' (use 'include' for cross origin API)
	const headers		= options.headers || {
		'Content-Type'		: 'application/json',
		'Accept'			: 'text/event-stream',
		'Content-Encoding'	: 'none',
	}
	const redirect		= options.redirect || 'follow' // manual, *follow, error
	const referrer		= options.referrer || 'no-referrer' // no-referrer, *client
	const body			= options.body // body data type must match "Content-Type" header
	// always force the request as a stream
	body.is_stream = true

	// SEC-008: SSE stream must also carry the per-session CSRF token.
	if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
		if (!headers['X-Dedalo-Csrf-Token']) {
			headers['X-Dedalo-Csrf-Token'] = window.page_globals.csrf_token
		}
	}

	return new Promise(function(resolve){

		fetch(
			url,
			{
				method		: method,
				mode		: mode,
				cache		: cache,
				credentials	: credentials,
				headers		: headers,
				redirect	: redirect,
				referrer	: referrer,
				body		: JSON.stringify(body)
			}
		)
		.then(response => {

			// Get the readable stream from the response body
			const stream = response.body;

			resolve(stream)
		})
		.catch(error => {
			// Log the error
			console.error(error);
		});
	})
}//end request_stream



/**
* REQUEST_FETCH_STREAM
* Generic fetch stream request using the `ReadableStream` API.
* Intended for NDJSON or other binary/line-delimited streams, as opposed to
* `request_stream` which is SSE-specific (`Content-Type: text/event-stream`).
* Primarily used by `tool_export` to stream rows row-by-row without the overhead
* of `EventSource`.
*
* Unlike `request_stream`, this method does NOT set `is_stream` on the body; the
* caller is responsible for signalling the desired transfer mode in the body payload.
* Throws immediately on a non-2xx response instead of wrapping in a Promise.
*
* Also carries the CSRF token (SEC-008) via `X-Dedalo-Csrf-Token`.
*
* @param {Object} options - Request configuration
* @param {string} [options.url] - Override the default API URL
* @param {string} [options.method='POST'] - HTTP method
* @param {Object} [options.headers] - HTTP headers; defaults to `application/x-ndjson` Accept
* @param {Object} options.body - Request payload (will be JSON-stringified)
* @returns {Promise<ReadableStream>} Raw `response.body` stream for NDJSON consumption
* @throws {Error} On non-2xx HTTP response
*/
data_manager.request_fetch_stream = async function(options) {

	const self = this

	const url			= options.url || self.url
	const method		= options.method || 'POST'
	const headers		= options.headers || {
		'Content-Type'	: 'application/json',
		'Accept'		: 'application/x-ndjson, application/json'
	}
	const body			= options.body

	// SEC-008: streaming fetch must also carry the per-session CSRF token.
	// Mirror the logic in data_manager.request: take the cached token from
	// page_globals (refreshed on every API response) and inject the
	// X-Dedalo-Csrf-Token header unless the caller already set it.
	if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
		if (!headers['X-Dedalo-Csrf-Token']) {
			headers['X-Dedalo-Csrf-Token'] = window.page_globals.csrf_token
		}
	}

	const response = await fetch(url, {
		method	: method,
		headers	: headers,
		body	: JSON.stringify(body)
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return response.body;
}//end request_fetch_stream



/**
* READ_STREAM
* Reads an SSE `ReadableStream` chunk-by-chunk and dispatches parsed SSE messages
* to caller-supplied callbacks.
*
* SSE transport quirks handled here:
* - HTTP servers may split a single `data:\n…\n\n` message across multiple chunks
*   (partial message). The `ar_chunks` accumulator collects pieces until the
*   terminating `\n\n` (byte values 10, 10) is detected at the end of the current
*   chunk.
* - The server may also merge two messages into one chunk. In that case the chunk
*   contains `\n\ndata:\n` as an internal separator; the older partial message is
*   discarded (its reassembly is complex and it is never the final message).
* - Each complete message payload is decoded via `TextDecoder`, split on `data:\n`,
*   and the last non-empty part is taken as the current message fragment.
* - JSON parsing uses `JSON_parse_safely` to avoid breaking the read loop on
*   malformed messages; invalid JSON yields a synthetic error SSE response.
*
* The reader is pushed into `page_globals.stream_readers` so that navigation away
* from the page can abort all in-flight readers.
*
* @see https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader
* @param {ReadableStream} stream - Body stream obtained from `response.body`
* @param {Function} on_read - Called for each complete SSE message: `on_read(sse_response, reader)`
* @param {Function} on_done - Called once when the stream is fully consumed: `on_done(true)`
* @returns {void}
*/
data_manager.read_stream = function(stream, on_read, on_done) {

	// Get the reader from the stream
	const reader = stream.getReader();

	// register reader (allow stop on page navigation)
	page_globals.stream_readers.push(reader)

	// exec previous callback
	on_read({
		data : {
			msg : 'Preparing data...'
		},
		is_running	: true
	}, reader)

	const ar_chunks = []
	// Define a function to read each chunk
	const readChunk = () => {
		// Read a chunk from the reader

		reader.read()
			.then(({
				value,
				done
			}) => {

				// Check if the stream is done
				if (done) {
					// Log a message
					console.log('Stream finished', done, value);
					// exec callback function on_done
					on_done(true)
					// Return from the function
					return;
				}

				// CHEKING THE STRING TO DETERMINATE THE MSG SENT
				// The event message always begins with "data:\n" and end with "\n\n"
				// PHP create the message correctly, but HTTP server can split it or merge it into a chunk
				// Why is not coherent ???? (only gods knows!)
				// So, every value received needs to be analyzed to determinate:
				//	1 - It's a full message, perfect! the message is OK.
				// 	2 - It's a part (message divided in parts, then need to be joined to get the message)
				//	3 - It has more than 1 message (merged, then need to be split to get the message)

				// Get the last two character of the value
				// it will be check to determinate if the value is the final message
				const last		= value[value.length-1]
				const previous	= value[value.length-2]

				// Convert the chunk value to a string
				// every chuck is decoded and analyzed to determinate if the message is a part or it's a full
					const chunk_string		= new TextDecoder().decode(value);

					// split the string by the initial string: data:\n
					const chunk_split_in	= chunk_string.split('data:\n');
					// split again the string with the end string and initial
					// this case has two message in one chunk, so delete the previous message because is complicate to rebuild it
					// and it's not the final message (the message has new one that begins with "data:\n")
					const chunk_split_in2	= chunk_string.split('\n\ndata:\n');
					// in the case that the string has two o more message deletes previous stored message and begins again.
					if(chunk_split_in2.length > 1){
						// reset the array
						ar_chunks.length = 0
					}
					// check if the split has information (some messages can be empty)
					// and get the last one or previous (empty message will be discarded)
					const valid_chunk = chunk_split_in.length >1 && !chunk_split_in[chunk_split_in.length-1].length
						?  chunk_split_in[chunk_split_in.length-2]
						:  chunk_split_in[chunk_split_in.length-1]
					//add the valid chuck into the array, is used to add divided messages into 1 valid.
					ar_chunks.push(valid_chunk)

				// if the value indicate the is the final part of the message, decode it and get the JSON
				// if not, the message is incomplete and can't be processed and showed.
				if(last === 10 && previous === 10){

					// join the messages parts into one string
					// and parse message response as JSON
					// JSON_parse_safely is needed to check and don't stop the event loop
					// BUT only a valid JSON is expected here.
					const data_string	= ar_chunks.join('')
					const sse_response	= JSON_parse_safely(data_string) || {
						data : {
							msg : 'JSON invalid SSE message'
						},
						is_running	: true,
						errors		: ['Invalid JSON message'],
						total_time	: '0 sec',
						data_string	: data_string
					}

					// reset the array
					ar_chunks.length = 0

					if(sse_response){
						// exec callback function on_read
						on_read(sse_response, reader)
					}
				}

				// Read the next chunk
				readChunk();
			})
			.catch(error => {
				// Log the error
				console.error(error);
			});
	};
	// Start reading the first chunk
	readChunk();
}//end read_stream



/**
* GET_ELEMENT_CONTEXT
* Fetches the full server-side context object for an element identified by a
* minimal source descriptor. The server resolves the model class, ontology
* relationships, and data-layer metadata from the given `tipo` / `section_tipo`.
*
* Typical source shape:
* ```js
* {
*   model        : 'component_input_text',
*   tipo         : 'test159',
*   section_tipo : 'test65',
*   section_id   : null,
*   mode         : 'search'
* }
* ```
*
* Always sends `prevent_lock: true` to avoid acquiring a section lock just for
* a context lookup.
*
* @param {Object} source - Minimal element locator descriptor
* @param {string} source.tipo - Ontology tipo of the element
* @param {string} [source.section_tipo] - Ontology tipo of the parent section
* @param {string|null} [source.section_id] - Record ID (null for non-record contexts)
* @param {string} [source.mode] - Rendering mode (`'edit'`, `'search'`, `'list'`, …)
* @param {string} [source.model] - Component model class name (optional; server resolves if omitted)
* @returns {Promise<Object>} Full API response containing the resolved context
*/
data_manager.get_element_context = async function(source) {

	// api request
	const api_response = await this.request({
		body : {
			action			: 'get_element_context',
			prevent_lock	: true,
			source			: source
		}
	})


	return api_response
}//end get_element_context



/**
* RESOLVE_MODEL
* Resolves the PHP component model class name for a given ontology `tipo`.
* Fetches a lightweight `simple` context from the server (skips data resolution)
* and caches the result in `page_globals.models` keyed by `tipo` to avoid
* repeated API calls within the same page session.
*
* Used by `ts_object.js` to determine which JS/PHP component class to load
* when only the `tipo` is known at construction time.
*
* @param {string} tipo - Ontology tipo of the element (e.g. `'dd345'`)
* @param {string} section_tipo - Ontology tipo of the parent section
* @returns {Promise<string|null>} Model class name (e.g. `'component_input_text'`) or `null` if unresolvable
*/
data_manager.resolve_model = async function(tipo, section_tipo) {

	// cache from page_globals
		const cache_key = tipo
		page_globals.models = page_globals.models || {}
		if (page_globals.models[cache_key]) {
			return page_globals.models[cache_key]
		}

	// api request
		const api_response = await this.request({
			body : {
				action			: 'get_element_context',
				prevent_lock	: true,
				simple			: true, // force simple context here
				source			: {
					tipo			: tipo,
					section_tipo	: section_tipo
				}
			}
		})

	// model from context simple response
		const model = api_response.result?.model || null

	// store in cache
		page_globals.models[cache_key] = model


	return model
}//end resolve_model



/**
* GET_PAGE_ELEMENT
* Fetches a fully rendered page element from the server, including all context,
* data, and child components needed to mount it in the browser.
* The server action `get_page_element` accepts the following PHP-side properties
* (all optional, resolved from ontology when omitted):
*
* ```
* $tipo           = $options->tipo         ?? null;
* $model          = $options->model        ?? ontology_node::get_model_by_tipo($tipo, true);
* $lang           = $options->lang         ?? DEDALO_DATA_LANG;
* $mode           = $options->mode         ?? 'list';
* $section_id     = $options->section_id   ?? null;
* $component_tipo = $options->component_tipo ?? null;
* ```
*
* @param {Object} options - PHP-side options forwarded verbatim as the `options` body property
* @param {string} [options.tipo] - Ontology tipo of the page element
* @param {string} [options.model] - PHP model class name (resolved server-side when omitted)
* @param {string} [options.lang] - Language code (server default when omitted)
* @param {string} [options.mode='list'] - Rendering mode
* @param {string|null} [options.section_id] - Record ID
* @param {string} [options.component_tipo] - Specific component tipo within the element
* @returns {Promise<Object>} Full API response with the rendered page element
*/
data_manager.get_page_element = async function(options) {

	// api request
		const api_response = await data_manager.request({
			body : {
				action	: 'get_page_element',
				options	: options
			}
		})


	return api_response
}//end get_page_element



/**
* GET_LOCAL_DB
* Opens (and if necessary upgrades) the browser's IndexedDB `'dedalo'` database
* at schema version 11.
*
* Object stores managed:
* - `rqo`        — cached request/query objects
* - `context`    — component/section context cache
* - `status`     — UI state (e.g. section_group collapsed/expanded)
* - `data`       — generic transient data (e.g. menu datum resolution)
* - `ontology`   — ontology node cache
* - `pagination` — pagination state (replaced the now-deleted `sqo` store)
*
* The `onupgradeneeded` handler is idempotent: it only creates stores that do not
* already exist, and deletes the legacy `sqo` store if still present.
*
* Resolves with `false` (via the `.catch` handler) if IndexedDB is unavailable
* or blocked (e.g. in private browsing on some browsers). Callers must guard
* against a falsy result before proceeding.
*
* @returns {Promise<IDBDatabase|false>} Opened database instance, or `false` on failure
*/
data_manager.get_local_db = async function() {

	// db storage
		// In the following line, you should include the prefixes of implementations you want to test.
		const current_indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
		// DON'T use "var indexedDB = ..." if you're not in a function.
		// Moreover, you may need references to some window.IDB* objects:
		// const IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"}; // This line should only be needed if it is needed to support the object's constants for older browsers
		// const IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
		// (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

	// invalid local db case
		if (!current_indexedDB) {
			console.error("[get_local_db] Your browser doesn't support a stable version of IndexedDB. Such and such feature will not be available.");
		}


	return new Promise(function(resolve, reject){

		// open db. Let us open our database (name, version)
			const db_request = current_indexedDB.open('dedalo', 11);

		// error case
			db_request.onerror = function(event) {
				if(SHOW_DEBUG){
					console.error("[get_local_db] error:", event.target);
				}else{
					console.error("[get_local_db] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
				}

				reject(false)
			};

		// success case
			db_request.onsuccess = function(event) {

				const db = event.target.result;
				resolve(db)
			};

		// onupgradeneeded event
			db_request.onupgradeneeded = function(event) {

				console.log("[get_local_db] onupgradeneeded:", event.target);

				const db = event.target.result;
				console.log(`[get_local_db] Upgrading indexedDB 'dedalo' to version ${db.version}`);

				// objectStore

				// rqo
					db.objectStoreNames.contains('rqo') || db.createObjectStore('rqo', { keyPath:'id' });
				// context
					db.objectStoreNames.contains('context') || db.createObjectStore('context', { keyPath:'id' });
				// status
				// Used to store elements status like section_group collapse display
					db.objectStoreNames.contains('status') || db.createObjectStore('status', { keyPath:'id' });
				// data
				// Used to store temp data like menu datum resolution
					db.objectStoreNames.contains('data') || db.createObjectStore('data', { keyPath:'id' });
				// ontology
					db.objectStoreNames.contains('ontology') || db.createObjectStore('ontology', { keyPath:'id' });
				// sqo. No longer used (replaced by 'pagination')
					if (db.objectStoreNames.contains('sqo')) {
						db.deleteObjectStore("sqo");
						console.log(`[get_local_db] Deleting ObjectStore (table) sqo`);
					}
				// pagination
					db.objectStoreNames.contains('pagination') || db.createObjectStore('pagination', { keyPath:'id' });
			};
	})
	.catch(err => {
		console.error(err)
	});
}//end local_db



/**
* SET_LOCAL_DB_DATA
* Writes (upserts) a record into the specified IndexedDB object store using
* `IDBObjectStore.put()`. The record must have an `id` property matching the
* store's `keyPath`.
*
* Available tables / stores:
* - `'status'`   — UI element state (collapsed, expanded, …)
* - `'rqo'`      — request/query object cache
* - `'ontology'` — ontology node cache
* - `'data'`     — generic transient data (e.g. menu datum resolution)
* - `'context'`  — component/section context cache
* - `'pagination'` — pagination state
*
* Example:
* ```js
* data_manager.set_local_db_data({ id: 'my_key', value: 42 }, 'data')
* ```
*
* Resolves `false` if IndexedDB is unavailable.
*
* @param {Object} data - Record to store; must contain `id` (keyPath)
* @param {string} table - Name of the IndexedDB object store
* @returns {Promise<IDBValidKey|false>} Resolved with the record key on success, `false` on failure
*/
data_manager.set_local_db_data = async function(data, table) {

	const self = this

	// get local db
		const db = await self.get_local_db()

	// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

	return new Promise(function(resolve, reject){

		// transaction
			const transaction = db.transaction(table, "readwrite");

			// complete. Do something when all the data is added to the database.
				// transaction.oncomplete = function(event) {
				// 	console.log("All done!");
				// };

			// error
				transaction.onerror = function(event) {
					if(SHOW_DEBUG){
						console.error("[set_local_db_data] error:", event.target);
					}else{
						console.error("[set_local_db_data] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
					}
					reject(false)
				};

		// request
			const objectStore = transaction.objectStore(table);

			// Put this updated object back into the database.
			const request = objectStore.put(data);

			request.onsuccess = function(event) {
				resolve(event.target.result)
			};
			request.onerror = function(event) {
				console.error("[set_local_db_data] error:", event.target);
				reject(event.target.error);
			};
	})
}//end set_local_db_data



/**
* @var {Map<string, IDBDatabase>} db_table_cache
* Module-level cache mapping store names to open `IDBDatabase` instances.
* Populated by `get_local_db_data` when `use_cache=true` to avoid re-opening
* the database on every call within the same page session.
*/
const db_table_cache = new Map();

/**
* GET_LOCAL_DB_DATA
* Reads a single record from the specified IndexedDB object store by its `id` key.
*
* When `use_cache=true`, the open `IDBDatabase` handle is stored in the module-level
* `db_table_cache` map (keyed by table name) and reused on subsequent calls,
* avoiding the overhead of repeated `indexedDB.open()` calls.
*
* Throws and re-throws on unexpected errors so that callers can decide how to
* handle them; returns `false` when IndexedDB is unavailable.
*
* Example:
* ```js
* const cached = await data_manager.get_local_db_data('tool_export_config', 'data')
* ```
*
* @param {string} id - Key of the record to retrieve (must match the store's `keyPath`)
* @param {string} table - Name of the IndexedDB object store
* @param {boolean} [use_cache=false] - Whether to cache the open DB handle for this table
* @returns {Promise<*|false>} The stored record value, `undefined` when not found, or `false` on unavailability
* @throws {Error} On IndexedDB transaction or request errors
*/
data_manager.get_local_db_data = async function(id, table, use_cache=false) {

	const self = this

	try {

		// Input validation
		if (!id || !table) {
			throw new Error('Missing required parameters: id and table');
		}

		// Get database with optional caching
		const db = use_cache && db_table_cache.has(table)
			? db_table_cache.get(table)
			: await self.get_local_db();

		// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			console.warn('[get_local_db_data] IndexedDB not available, running without cache');
			return false
		}

		// Cache database if requested
		if (use_cache && !db_table_cache.has(table)) {
			db_table_cache.set(table, db);
		}

		// Get data from IndexedDB
		const result = await new Promise(function(resolve, reject){

			// transaction
				const transaction = db.transaction(table, 'readwrite');

				// complete. Do something when all the data is added to the database.
					// transaction.oncomplete = function(event) {
					// 	console.log("All done!");
					// };

				// error
					transaction.onerror = function(event) {
						if(SHOW_DEBUG){
							console.error("[get_local_db_data] error:", event.target);
							console.error('[get_local_db_data] table:', table, 'db:',db);
						}else{
							console.error("[get_local_db_data] It's not possible get_local_db, IndexedDB is blocked, Dédalo will run slowly without cache.");
						}
						reject(false)
					};

			// request
				const objectStore	= transaction.objectStore(table);
				const request		= objectStore.get(id);

				request.onsuccess = function(event) {
					resolve(event.target.result)
				};
				request.onerror = function(event) {
					console.error("[get_local_db_data] error:", event.target);
					reject(event.target.error);
				};
		})

		return result;

	} catch (error) {
		console.error('[get_local_db_data] Error:', error.message);
		throw error; // Re-throw to let caller handle
	}
}//end get_local_db_data



/**
* DELETE_LOCAL_DB_DATA
* Deletes a single record from the specified IndexedDB object store by its `id` key.
* Uses a `'readwrite'` transaction and `IDBObjectStore.delete()`.
* Resolves `false` if IndexedDB is unavailable.
* @param {string} id - Key of the record to delete
* @param {string} table - Name of the IndexedDB object store
* @returns {Promise<IDBValidKey|false>} Resolved with the delete result on success, `false` on failure
*/
data_manager.delete_local_db_data = async function(id, table) {

	const self = this

	// get local db
		const db = await self.get_local_db()

	// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

	return new Promise(function(resolve, reject){

		// transaction
			const transaction = db.transaction(table, "readwrite");

			// complete. Do something when all the data is added to the database.
				// transaction.oncomplete = function(event) {
				// 	console.log("All done!");
				// };

			// error
				transaction.onerror = function(event) {
					if(SHOW_DEBUG){
						console.error("[delete_local_db_data] error:", event.target);
					}else{
						console.error("[delete_local_db_data] It's not possible get_local_db, IndexedDB is blocked ");
					}
					reject(false)
				};

		// request
			const objectStore	= transaction.objectStore(table);
			const request		= objectStore.delete(id);

			request.onsuccess = function(event) {
				// success
				resolve(event.target.result)
			};
			request.onerror = function(event) {
				console.error("[delete_local_db_data] delete_local_db_data error:", event.target);
				reject(event.target.error);
			};
	})
}//end delete_local_db_data



/**
* DELETE_LOCAL_DB_DATA_BY_PREFIX
* Deletes all records in the specified IndexedDB object store whose `id` key
* begins with `prefix`, using an `IDBKeyRange.bound` range from `prefix` to
* `prefix + '￿'` (Unicode high surrogate — effectively "all strings starting
* with prefix").
* Useful for bulk-invalidating namespaced cache groups, e.g. `'menu_'` entries.
* (!) Note: the parameter order is `(table, prefix)`, not `(prefix, table)`.
* @param {string} table - Name of the IndexedDB object store
* @param {string} prefix - Key prefix; all matching records will be deleted
* @returns {Promise<void>} Resolves when deletion is complete
* @throws {Error} On IndexedDB errors
*/
data_manager.delete_local_db_data_by_prefix = async function(table, prefix) {

	const self = this

	try {
		// get local db
		const db = await self.get_local_db()

		// check if is possible create and use IndexDB, if not, the promise will return undefined and we use false
		if(!db){
			return false
		}

		const transaction = db.transaction(table, 'readwrite');
		const store = transaction.objectStore(table);

		// Create a key range for the prefix
		const range = IDBKeyRange.bound(prefix, prefix + '\uffff');

		// Delete all records in the range
		const request = store.delete(range);

		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('Error deleting data:', error);
		throw error;
	}
}//end delete_local_db_data_by_prefix



/**
* DELETE_WHOLE_LOCAL_DB
* Deletes the entire `'dedalo'` IndexedDB database from the browser.
* Triggers `get_local_db` to recreate and re-migrate the schema on the next
* call. Use after major application updates that change the stored data shape.
*
* The `onblocked` handler fires when another tab still has the database open;
* the deletion is deferred until all connections are closed (page reload required).
*
* @returns {Promise<*>} Resolves on successful deletion
* @throws {Error} (via rejection) when deletion fails
*/
data_manager.delete_whole_local_db = async function() {

	return new Promise(function(resolve, reject) {

		const db = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;

		const request = db.deleteDatabase('dedalo');

		request.onsuccess = function(event) {
			console.log("[delete_whole_local_db] Deleted database successfully");
			resolve(event.target.result)
		};
		request.onerror = function(event) {
			console.log("[delete_whole_local_db] Couldn't delete database");
			reject(event.target.error);
		};
		request.onblocked = function () {
			console.log("[delete_whole_local_db] Couldn't delete database due to the operation being blocked. Reload page to apply changes");
		};
	})
}//end delete_whole_local_db



/**
* CLEAR_LOCAL_DB_TABLE
* Empties a single IndexedDB object store without deleting the store itself
* or affecting other stores. Uses `IDBObjectStore.clear()`.
* Useful after application updates that invalidate cached data for one category
* (e.g. clearing all `'context'` entries after an ontology change).
* @param {string} table - Name of the IndexedDB object store to clear
* @returns {Promise<boolean>} Resolves `true` on success, rejects `false` on transaction error
*/
data_manager.clear_local_db_table = async function(table) {

	return new Promise(function(resolve, reject) {

		// Let us open our database
		const DBOpenRequest = window.indexedDB.open("dedalo");
		DBOpenRequest.onsuccess = (event) => {

			console.log("[clear_local_db_table] Database initialized");

			// store the result of opening the database in the db variable.
			const db = DBOpenRequest.result;

			// clear previous data
			const transaction = db.transaction([table], "readwrite");
			transaction.oncomplete = (event) => {
				console.log('[clear_local_db_table] Transaction done successful');
			};
			transaction.onerror = (event) => {
				console.error(`[clear_local_db_table] Transaction not opened due to error: ${transaction.error}`);
				reject(false)
			};
			const objectStore = transaction.objectStore(table);
			const objectStoreRequest = objectStore.clear();
			objectStoreRequest.onsuccess = (event) => {
				console.log('[clear_local_db_table] Request clear successful');
				resolve(true)
			};
		};
	})
}//end clear_local_db_table



/**
* DOWNLOAD_URL
* Fetches the resource at `url` as a binary blob and triggers a browser download
* using a temporary `<a>` element with the `download` attribute.
* The object URL is not explicitly revoked after the click; the browser handles
* cleanup when the document is unloaded.
* @param {string} url - URL of the resource to download
* @param {string} filename - Suggested filename for the downloaded file
* @returns {void}
*/
export function download_url(url, filename) {
	return fetch(url).then(function(response) {
		return response.blob().then((blob)=>{
			const object_url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = object_url;
			a.setAttribute("download", filename);
			a.click();
			a.remove();
			// release the object URL to avoid leaking memory
			URL.revokeObjectURL(object_url);
		});
	})
	.catch((error) => {
		console.error('download_url failed:', url, error);
	});
}//end download_url



/**
* DOWNLOAD_DATA
* Serializes `data` to a pretty-printed JSON string, wraps it in an
* `octet/stream` Blob, and triggers a browser download via a temporary `<a>`
* element. The object URL is revoked immediately after the click to free memory.
* @param {*} data - Any JSON-serializable value
* @param {string} filename - Suggested filename for the downloaded file
* @returns {boolean} Always `true` (download triggered)
*/
export function download_data(data, filename) {

	const json	= JSON.stringify(data, null, 2)
	const blob	= new Blob([json], {type: "octet/stream"})
	const url	= window.URL.createObjectURL(blob)

	const a = document.createElement("a")
	a.style = "display: none"
	document.body.appendChild(a)
	a.href = url
	a.download = filename
	a.click()
	window.URL.revokeObjectURL(url)

	return true
}//end download_data



// @license-end
