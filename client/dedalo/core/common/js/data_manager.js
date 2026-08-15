// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL, Promise */
/*eslint no-undef: "error"*/



/**
* DATA_MANAGER
* Central client-to-server request layer for Dédalo v7.
*
* Responsibilities:
* - Building and dispatching all API calls to the JSON endpoint
*   (`api/v1/json/`) with configurable HTTP options (method, mode, credentials).
* - Delegating the fetch itself to the shared, DOM-free transport
*   `api_transport.js` (`fetch_api`: read-once body, JSON parse, envelope
*   normalisation, retry keyed on `retryable` + `Retry-After`, per-attempt
*   timeout with the busy-server health probe). The same transport serves the
*   cache Worker and the Service Worker, so there is ONE request algorithm.
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
* ERROR CONTRACT (envelope v2, see api_error.js): `request` resolves the server
* envelope. On ANY failure — envelope `ok:false`, transport, unparseable body —
* the resolved object carries `error` = an `ApiError` (`request_failed(api_response)`
* is THE test), and the transport publishes `'api_error'` (the ApiError) on the
* event bus. The payload of a success is `response_data(api_response)`.
* A SUCCESS may also carry `notices[]` (non-fatal coded facts, ERRORS_SPEC §3):
* they are published once as `'api_notices'` and rendered by the page's
* `handle_api_notice` subscriber unless a caller reads them itself.
*
* Main exports: `data_manager` (namespace object), `check_server_health`,
* `render_msg_to_inspector`, `download_url`, `download_data`.
*/

// imports
	import {JSON_parse_safely} from '../../../core/common/js/utils/util.js'
	import {event_manager} from './event_manager.js'
	import {dd_request_idle_callback} from './events.js';
	import {fetch_api, check_health} from './api_transport.js'
	import {
		ApiError,
		CLIENT_ERROR,
		normalize_api_error,
		normalize_transport_error,
		response_data
	} from './api_error.js'
	import {render_error_toast} from './render_api_error.js'



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
* URL of the engine's lightweight liveness endpoint. The TS/Bun engine serves it
* at the ORIGIN ROOT `/health` (src/server.ts: `url.pathname === '/health'`), NOT
* under the API path — the legacy `<api>/health/` path 404s on the TS engine
* (that stale path is why the system_info widget reported `false`). Kept as an
* absolute, origin-relative path so it resolves the same from any page depth; the
* reverse proxy must forward `/health` to the engine (see deploy/nginx.conf).
* Used by the transport's mid-attempt probe to tell a slow-but-alive server
* from a dead one.
* @type {string}
*/
Object.defineProperty(data_manager, 'health_url', {
	get: function() {
		return '/health'
	}
});



/**
* CHECK_SERVER_HEALTH
* Probes the lightweight health endpoint to verify the server is reachable
* and responding without triggering the full API bootstrap (cache-busted, so a
* proxy cannot mask an outage). Thin wrapper over the transport's `check_health`
* kept for the widgets that import it (system_info, diffusion_server_control).
* @returns {Promise<boolean>} true when the server responds with HTTP 2xx
*/
export const check_server_health = async () => {
	return check_health(data_manager.health_url)
}//end check_server_health



/**
* CLIENT_FAILURE
* Builds the envelope `request` resolves when the call could not even be sent
* (bad URL, unserialisable body): v2 shape + the ApiError under `error`.
* @param {ApiError} api_error
* @returns {Object}
*/
const client_failure = (api_error) => ({
	ok		: false,
	error	: api_error
})



/**
* REQUEST
* Central API call dispatcher. Serializes `options.body` to JSON, attaches the
* CSRF token (SEC-008), dispatches through the shared transport (`fetch_api`),
* and resolves the API envelope.
*
* Algorithm:
*  1. Merge options over the safe defaults (5 retries, 500 ms base delay,
*     5 000 ms timeout) — every default is overridable per call.
*  2. CSRF header from `page_globals.csrf_token` unless the caller set one.
*  3. `cache_handler.handler==='localdb'` → IndexedDB short-circuit on a hit.
*  4. `page_globals.recovery_mode` → `recovery_mode:true` in the body.
*  5. URL / body validation → a `client.*` failure envelope, no network.
*  6. `fetch_api`: fetch never throws on status → body read ONCE → JSON →
*     `normalize_api_error` → retry ONLY when `api_error.retryable` or the
*     server sent `Retry-After` (no status list, no 401/403 carve-outs — an
*     auth/permission answer is an envelope like any other and is dispatched
*     on its CODE). The mid-attempt health probe reports a busy server through
*     the `awaiting_busy_server` notice.
*  7. Refresh `page_globals.csrf_token` from every envelope (success or
*     failure) and publish `session_activity` (WC-051).
*  8. `auth.csrf_failed` → resend exactly once
*     (`_csrf_retried`).
*  9. Failure: attach `error` = the ApiError to the envelope (or synthesise
*     `{ok:false, error}` when no JSON), publish `'api_error'`, toast TRANSPORT
*     failures (the user must learn the network is down even when no caller
*     handles the failure), resolve the envelope.
* 10. Success: publish `'api_notices'` when the envelope carries any, write
*     through to IndexedDB on idle when cached; resolve the envelope.
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
* @param {AbortSignal} [options.signal] - Caller abort (→ `client.aborted`, never retried)
* @param {number} [options.retries=5] - Maximum retry attempts
* @param {number} [options.base_delay=500] - Base exponential-backoff delay in ms
* @param {number} [options.timeout=5000] - Per-attempt timeout in ms
* @param {Object} [options.cache_handler] - IndexedDB cache descriptor `{handler:'localdb', id:string}`
* @param {string} [options.notices='page'] - Who renders a SUCCESS envelope's
*   `notices[]`: 'page' publishes `'api_notices'` (the page subscriber toasts them
*   through the policy table); 'caller' publishes NOTHING, because the caller
*   renders the notice in its own wrapper and a second toast would duplicate it.
* @param {boolean} [options._csrf_retried] - Internal flag; prevents recursive CSRF retry
* @returns {Promise<Object>} The API envelope. Always an object; on failure it
*   carries `error` (an ApiError) — test with `request_failed(api_response)`.
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
		signal		: null,
		retries		: 5, // default request retries int
		base_delay	: 500, // default base delay in ms
		timeout		: 5000, // default timeout in ms
		notices		: 'page' // 'page' = publish 'api_notices' (default); 'caller' = the caller renders them itself
	};

	const merged_options = { ...default_options, ...options };

	// vars from options applying defaults
	const { url, method, mode, cache, credentials, headers, redirect, referrer, body, signal, retries, base_delay, timeout, notices } = merged_options;

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
		const source_model	= body?.source?.model || ''
		console.warn(`> data_manager request ${method}:`, action.toUpperCase(), source_model, merged_options);
	}

	// recovery mode. Auto add if environment recovery_mode is true
	// On set to true, it is passed across all API request calls preserving the mode
	if (window.page_globals.recovery_mode && body) {
		if (typeof body === 'object') {
			body.recovery_mode = true;
		}
	}

	window.page_globals.request_message = null;

	// Check URL. Nothing can be sent: resolve a client failure, no network.
	if (!url || !url.length) {
		const api_error = new ApiError({
			code	: CLIENT_ERROR.NETWORK,
			message	: 'Empty or invalid API URL',
			details	: {reason: 'invalid_url'},
			source	: 'client'
		})
		console.error(api_error.message, { typeof: typeof url, value: url });
		event_manager.publish('api_error', api_error)
		return client_failure(api_error);
	}

	// Prepare body for request
	let request_body = null;
	if (body) {
		if (typeof body === 'string') {
			request_body = body;
		} else {
			try {
				request_body = JSON.stringify(body);
			} catch (json_error) {
				const api_error = new ApiError({
					code	: CLIENT_ERROR.NETWORK,
					message	: `Failed to serialize request body: ${json_error.message}`,
					details	: {reason: 'body_serialize'},
					source	: 'client',
					raw		: json_error
				})
				console.error(api_error.message, json_error);
				event_manager.publish('api_error', api_error)
				return client_failure(api_error);
			}
		}
	}

	const request_start_time = performance.now();

	// exec fetch through the shared transport
	const {json, api_error} = await fetch_api(
		url,
		{
			method		: method,
			mode		: mode,
			cache		: cache,
			credentials	: credentials,
			headers		: headers,
			redirect	: redirect,
			referrer	: referrer,
			body		: request_body,
			signal		: signal || undefined
		},
		{
			timeout_ms	: timeout,
			retries		: retries,
			base_delay	: base_delay,
			health_url	: self.health_url,
			on_wait		: (attempt, delay, reason) => {
				// The loop itself is silent; the page tells the user why it waits.
				if (reason==='busy') {
					const msg = (typeof get_label!=='undefined' && get_label.awaiting_busy_server) || 'Awaiting for busy server..'
					if(SHOW_DEBUG) {
						console.log(msg, {attempt});
					}
					render_msg_to_inspector(msg, 'warning', delay);
				} else if(SHOW_DEBUG) {
					console.log(`Retrying in ${delay}ms (attempt ${attempt})...`);
				}
			}
		}
	)

	// SEC-008: refresh the cached CSRF token from every response so the
	// next call carries the latest one (the server may rotate it on auth
	// state changes such as login or logout). Failure envelopes carry it too.
	if (json && typeof json.csrf_token === 'string' && json.csrf_token.length > 0) {
		if (typeof window !== 'undefined' && window.page_globals) {
			window.page_globals.csrf_token = json.csrf_token;
		}
		// WC-051: the same signal, for the same reason. A response carrying a CSRF
		// token IS an authenticated response, which is exactly what refreshed the
		// server's `last_seen` — so it is the honest beat for the client's idle
		// clock (session_expiry.js). Published rather than called directly to keep
		// the data layer free of a UI dependency, and to avoid an import cycle.
		event_manager.publish('session_activity');
	}

	// SEC-008: transparent retry on CSRF rejection. This handles the bootstrap
	// race where a non-exempt action fires before the SPA has obtained a
	// token from `start` (e.g. parallel menu/read calls during page build,
	// or the post-login full page reload that resets page_globals). The
	// rejection response already carries a fresh token (captured above), so
	// we just resend the original request exactly once. The `_csrf_retried`
	// flag on options prevents infinite loops if the server still refuses.
	if (
		api_error
		&& api_error.code === 'auth.csrf_failed'
		&& !options._csrf_retried
	) {
		console.warn('CSRF token mismatch; retrying once with fresh token.');
		return self.request({ ...options, _csrf_retried: true });
	}

	if(SHOW_DEBUG) {
		console.log(`_*_Time to request: ${(performance.now() - request_start_time).toFixed(2)}ms`);
	}

	// failure
	if (api_error) {

		// envelope: the server's own body when there is one, else synthesised
		const envelope = (json && typeof json === 'object' && !Array.isArray(json))
			? json
			: {ok:false}
		envelope.ok		= false
		envelope.error	= api_error

		// debug console message. Lock-state chatter is not worth a red line.
		if (body?.action !== 'update_lock_components_state') {
			console.error(`data_manager request failed [${api_error.code}]:`, api_error, envelope);
		}

		// THE failure event: one ApiError, dispatched on its code by whoever listens
		// (page.js relogin/no-access, error_dispatch.handle_api_error).
		event_manager.publish('api_error', api_error);

		// Transport failures (network/timeout/foreign status/unreadable body) get a
		// toast HERE: no caller can act on them and the user must know the server
		// is unreachable. Envelope failures are the caller's / policy's to render.
		// (REMOVAL: once every caller awaits handle_api_error, this toast moves
		// into the '*' policy and this block goes.)
		if (api_error.transport === true && api_error.code !== CLIENT_ERROR.ABORTED) {
			if (window.page_globals.request_message !== api_error.code) {
				render_error_toast(api_error, {remove_time: 10000});
				window.page_globals.request_message = api_error.code;
				setTimeout(() => {
					window.page_globals.request_message = null;
				}, 3000);
			}
		}

		return envelope;
	}

	// notices[] (ERRORS_SPEC §3): a SUCCESS may carry non-fatal coded facts —
	// a refused child delete, a degraded external source, a login soft warning.
	// They are published once, generically; error_dispatch.handle_api_notice
	// resolves each through the SAME policy table an ApiError goes through, so a
	// tool/area can silence or re-route its own domain with register_error_policy.
	// Callers that want to render a notice next to their own widget read
	// `api_response.notices` themselves — this event is the page-level default.
	if (notices !== 'caller' && json && Array.isArray(json.notices) && json.notices.length > 0) {
		event_manager.publish('api_notices', {notices: json.notices, api_response: json});
	}

	// cache_handler. Only cache successful envelopes
	if (cache_handler?.handler==='localdb' && json) {
		dd_request_idle_callback(
			() => {
				this.set_local_db_data(
					{
						id		: cache_handler.id,
						value	: json
					},
					'data' // string table
				);
			}
		);
	}

	return json
}//end request



/**
* RENDER_MSG_TO_INSPECTOR
* Publishes a user-visible notification via the `event_manager` 'notification' channel.
* The inspector UI subscribes to this event and renders a temporary banner.
* Used by the data layer for the busy-server notice; ApiErrors go through
* `render_api_error.render_error_toast` instead.
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
* @param {AbortSignal} [options.signal] - Aborts the fetch itself. `reader.cancel()`
*   cannot: a fetch still awaiting response headers has no reader yet, so a caller
*   that gives up during connect had no way to release the request without this.
* @returns {Promise<ReadableStream>} Resolved with the raw `response.body` stream
* @throws {ApiError} Rejects with an ApiError on network failure (`client.*`,
*   see normalize_transport_error) or on a non-2xx answer (the server's envelope
*   error when the body is one — e.g. `auth.not_logged` — else `client.http_status`)
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

	return new Promise(function(resolve, reject){

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
				body		: JSON.stringify(body),
				signal		: options.signal
			}
		)
		.then(response => {

			// (!) A non-2xx here is NOT a stream. Before this check the JSON error
			// body of a 401/500 was handed straight to read_stream, which found no
			// "data:\n…\n\n" framing, never fired on_read, and then ended cleanly —
			// so a hard failure was indistinguishable from a stream that had simply
			// finished, and the caller silently showed nothing.
			// The body is read (once) so the server's envelope error — its CODE —
			// is what the caller gets (`auth.not_logged` mid-job triggers relogin);
			// a non-envelope answer becomes `client.http_status`.
			if (!response.ok) {
				response.text()
					.then((text) => JSON_parse_safely(text))
					.catch(() => null)
					.then((json) => {
						const api_error = normalize_api_error(response, json)
							|| new ApiError({code: CLIENT_ERROR.HTTP_STATUS, status: response.status, details: {status: response.status, status_text: response.statusText}, source: 'transport'})
						console.error('request_stream failed:', api_error.code, api_error);
						event_manager.publish('api_error', api_error)
						reject(api_error)
					})
				return
			}

			// Get the readable stream from the response body
			const stream = response.body;

			resolve(stream)
		})
		.catch(error => {
			// (!) REJECT, do not just log. This used to `console.error` and return,
			// leaving the promise permanently PENDING — so `await request_stream(…)`
			// on a network failure never resumed and the caller hung forever with no
			// error path to run. Logging preserved: the console line was the only
			// diagnostic callers had. Rejects with an ApiError (`client.aborted`
			// when the caller's own signal fired — silent by policy).
			const api_error = normalize_transport_error(error, {caller_aborted: !!options.signal?.aborted})
			console.error('request_stream failed:', api_error.code, error);
			if (api_error.code !== CLIENT_ERROR.ABORTED) {
				event_manager.publish('api_error', api_error)
			}
			reject(api_error)
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
* @throws {ApiError} On network failure (`client.*`) or a non-2xx answer (the
*   envelope's error code when the body is an envelope, else `client.http_status`)
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

	let response
	try {
		response = await fetch(url, {
			method	: method,
			headers	: headers,
			body	: JSON.stringify(body),
			signal	: options.signal
		});
	} catch (error) {
		const api_error = normalize_transport_error(error, {caller_aborted: !!options.signal?.aborted})
		if (api_error.code !== CLIENT_ERROR.ABORTED) {
			event_manager.publish('api_error', api_error)
		}
		throw api_error
	}

	if (!response.ok) {
		// read the body once: an envelope names the failure, anything else is a foreign status
		const json = JSON_parse_safely(await response.text().catch(() => ''))
		const api_error = normalize_api_error(response, json)
			|| new ApiError({code: CLIENT_ERROR.HTTP_STATUS, status: response.status, details: {status: response.status, status_text: response.statusText}, source: 'transport'})
		event_manager.publish('api_error', api_error)
		throw api_error
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
*   malformed messages; invalid JSON yields a synthetic frame carrying
*   `error` = ApiError `client.bad_response` (source 'stream') — consumers
*   read it with `normalize_stream_error(frame)`, which also understands the
*   server's own end-of-run error frames (v2 `frame.error.code`).
*
* The reader is pushed into `page_globals.stream_readers` so that navigation away
* from the page can abort all in-flight readers. That registry is the LAST resort,
* not the lifecycle: a consumer that stops caring before the page unloads must
* release its own reader with `release_stream_reader` — an SSE stream held open by
* a dead consumer still occupies one of the browser's six per-origin HTTP/1.1
* connections, and six of them starve the whole origin (`/health` included).
*
* @see https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader
* @param {ReadableStream} stream - Body stream obtained from `response.body`
* @param {Function} on_read - Called for each complete SSE message: `on_read(sse_response, reader)`
* @param {Function} on_done - Called once when the stream is fully consumed: `on_done(true)`
* @returns {ReadableStreamDefaultReader} the reader driving this stream, so the
*   caller can release it (see `release_stream_reader`). Returned rather than only
*   handed to `on_read`: a consumer that must cancel BEFORE the first frame arrives
*   had no other way to reach it.
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
					const sse_response	= JSON_parse_safely(data_string) || (() => {
						const api_error = new ApiError({
							code	: CLIENT_ERROR.BAD_RESPONSE,
							message	: 'Invalid JSON stream message',
							details	: {reason: 'invalid_json'},
							source	: 'stream',
							raw		: data_string
						})
						return {
							data : {
								msg : 'JSON invalid SSE message'
							},
							is_running	: true,
							error		: api_error,
							total_time	: '0 sec',
							data_string	: data_string
						}
					})()

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


	return reader
}//end read_stream



/**
* RELEASE_STREAM_READER
* Cancel one SSE reader and drop it from the shared `page_globals.stream_readers`
* registry. THE teardown for any consumer that stops following a stream before the
* page unloads.
*
* WHY IT MATTERS. Cancelling the reader is what closes the underlying HTTP
* connection. A browser allows six per origin over HTTP/1.1, so six abandoned
* streams — six panels opened over a long transcode, say — queue every subsequent
* request on the page FOREVER, `/health` included. That starves the very probe
* `_fetch_with_retry_and_timeout` uses to tell a busy server from a dead one, so
* the UI reports timeouts against a server that is answering perfectly.
*
* (!) Splices the entry by IDENTITY. The registry is shared with make_backup,
* unit_test, the move_* widgets, tool_diffusion and job_follow — a `length = 0`
* here would silently orphan every other consumer's reader.
*
* @param {ReadableStreamDefaultReader|null} reader
* @param {string} [reason='consumer released'] - passed to reader.cancel()
* @returns {boolean} true when a reader was actually released
*/
export const release_stream_reader = function(reader, reason='consumer released') {

	if (!reader) {
		return false
	}

	try {
		reader.cancel(reason)
	} catch (error) {
		if (SHOW_DEBUG===true) {
			console.warn('release_stream_reader: cancel failed', error)
		}
	}

	const registry = (typeof page_globals!=='undefined' && Array.isArray(page_globals.stream_readers))
		? page_globals.stream_readers
		: null
	if (registry) {
		const at = registry.indexOf(reader)
		if (at !== -1) {
			registry.splice(at, 1)
		}
	}

	return true
}//end release_stream_reader



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

	// model from context simple response (THE payload accessor)
		const model = response_data(api_response)?.model || null

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
