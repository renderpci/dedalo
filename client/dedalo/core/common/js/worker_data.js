// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* WORKER_DATA
* Dedicated Web Worker that offloads API calls to a background thread,
* keeping the main UI thread free during potentially expensive server round-trips.
*
* Design rationale:
* - Web Workers cannot share module scope with the main thread, so the full
*   `data_manager.js` module cannot be imported directly (and the `{type:'module'}`
*   Worker variant is broken in Firefox). Instead, this file bundles a
*   self-contained, minimal copy of `data_manager.request` as a plain script.
* - The worker receives its payload via `postMessage`, issues a fetch to the
*   Dédalo JSON API, and posts the parsed JSON response back to the caller.
* - Callers are responsible for terminating the worker after receiving the
*   response (see the usage example on `self.onmessage` below).
*
* Globals available in worker scope: `self`, `fetch`, `performance`.
* No ES-module imports are used (Firefox compat).
*/
// WORKER
// Calculate complex data in background
// (!) Note that the worker module version doesn't work in Firefox and scope is very annoying to receive functions by name
// import {data_manager} from '../../common/js/data_manager.js'



/**
* ONMESSAGE
* Worker message handler. Receives a structured payload from the main thread,
* delegates the HTTP request to the local `data_manager.request`, then posts
* the parsed JSON API response back via `self.postMessage`.
*
* Expected message shape (`e.data`):
* ```
* {
*   url  : {string} - fully-qualified API endpoint URL
*   body : {Object} - request body that will be JSON-serialised by data_manager.request
* }
* ```
*
* Response shape posted back:
* ```
* {
*   api_response : {Object} - parsed JSON returned by the server (or an error envelope)
* }
* ```
*
* Typical caller pattern (see `data_manager._handle_worker_request`):
* ```js
*   const current_worker = new Worker(DEDALO_CORE_URL + '/common/js/worker_data.js', {
*       type : 'module'
*   });
*   current_worker.postMessage({ url, body });
*   current_worker.onmessage = function(e) {
*       const api_response = e.data.api_response
*       current_worker.terminate()
*   }
* ```
*
* @param {MessageEvent} e - Worker message event; relevant data lives in `e.data`
* @returns {Promise<void>}
*/
self.onmessage = async function(e) {
	const t1 = performance.now()
	// console.log(')))))))))))))))) worker e.data:', e.data);

	// Dynamic import
		// const data_manager_instance	= await import('../../common/js/data_manager.js')
		// const data_manager			= data_manager_instance.data_manager

	// options
		const url	= e.data.url
		const body	= e.data.body

	// data_manager
		const api_response = await data_manager.request({
			url		: url,
			body	: body
		})

	const response = {
		api_response : api_response
	}

	console.log("__***Time performance.now()-t1 worker:", performance.now()-t1);

	self.postMessage(response);
}//end onmessage



/**
* DATA_MANAGER
* Lightweight inline replica of the main-thread `data_manager` module,
* bundled here so the worker can issue API calls without ES-module imports
* (which are unsupported by Firefox for the `{type:'classic'}` Worker variant).
*
* Only the `request` method is implemented; advanced features of the full
* `data_manager.js` (CSRF refresh, retry logic, IndexedDB caching) are
* intentionally omitted to keep the worker payload minimal.
*
* @type {Object}
*/
const data_manager = {}

/**
* DATA_MANAGER.REQUEST
* Issues a JSON POST to the Dédalo PHP API and returns the parsed response.
*
* Builds a complete `fetch` options object by merging caller-supplied values
* over safe defaults. On a non-OK HTTP status the response body is logged to
* the console and an Error is raised internally; on a network-level failure
* (no response at all) a rejection is thrown. Both paths are caught by the
* outer try/catch and converted to an error-envelope object, so the caller
* always receives a resolved value rather than an unhandled rejection.
*
* Default fetch options (callers may override any key via `options`):
* - method      : 'POST'
* - mode        : 'cors'
* - cache       : 'no-cache'
* - credentials : 'same-origin'
* - headers     : {'Content-Type': 'application/json'}
* - redirect    : 'follow'
* - referrer    : 'no-referrer'
*
* @param {Object} options - Request configuration; key fields:
*   @param {string}  [options.url]         - API endpoint URL; falls back to
*                                            `DEDALO_API_URL` global or relative
*                                            `'../api/v1/json/'` when not set.
*   @param {Object}  [options.body]        - Plain-object request body; serialised
*                                            to JSON before sending. Pass `null`
*                                            or omit for bodyless requests.
*   @param {string}  [options.method]      - HTTP verb (default 'POST').
*   @param {string}  [options.mode]        - CORS mode (default 'cors').
*   @param {string}  [options.cache]       - Cache policy (default 'no-cache').
*   @param {string}  [options.credentials] - Credentials policy (default 'same-origin').
*   @param {Object}  [options.headers]     - HTTP headers map.
*   @param {string}  [options.redirect]    - Redirect policy (default 'follow').
*   @param {string}  [options.referrer]    - Referrer policy (default 'no-referrer').
* @returns {Promise<Object>} Parsed JSON from the server on success, or an error
*   envelope `{ result:false, msg, error, errors }` on any failure (non-OK HTTP
*   status or network error). This function never rejects — all errors are caught
*   internally and returned as the error envelope so `self.onmessage` always
*   receives a postable object.
*/
data_manager.request = async function(options) {

	const default_options = {
		url			: typeof DEDALO_API_URL !== 'undefined' ? DEDALO_API_URL : '../api/v1/json/',
		method		: 'POST', // *GET, POST, PUT, DELETE, etc.
		mode		: 'cors', // no-cors, cors, *same-origin
		cache		: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
		credentials	: 'same-origin', // include, *same-origin, omit
		headers		: {'Content-Type': 'application/json'}, // 'Content-Type': 'application/x-www-form-urlencoded'
		redirect	: 'follow', // manual, *follow, error
		referrer	: 'no-referrer', // no-referrer, *client
		body		: null // body data type must match "Content-Type" header
	};

	const merged_options = { ...default_options, ...options };

	// vars from options applying defaults
	const { url, method, mode, cache, credentials, headers, redirect, referrer, body } = merged_options;

	// handle_errors
	// Inner helper: inspects the raw fetch Response and throws a descriptive Error
	// when the server returned a non-2xx status. Reading the response body as text
	// before throwing lets the full PHP/server error appear in the console.
	const handle_errors = async (response) => {
		if (!response.ok) {
			console.warn("-> HANDLE_ERRORS response:", response);
			// extract response text to console
			const response_text = await response.text();
			console.error(response_text);
			throw new Error(response.statusText || `HTTP error! status: ${response.status}`);
		}
		return response;
	}

	try {
		const fetch_response = await fetch(url, {
			method		: method,
			mode		: mode,
			cache		: cache,
			credentials	: credentials,
			headers		: headers,
			redirect	: redirect,
			referrer	: referrer,
			// (!) body must be null (not an empty string) when there is no payload;
			// passing an empty string can confuse some server-side parsers.
			body		: body ? JSON.stringify(body) : null
		})

		const json_response = await handle_errors(fetch_response).then(response => response.json());

		// error occurred
			if (json_response?.error) {
				// debug console message
				console.error("data_manager request api_response:", json_response);
			}

		return json_response;

	} catch (error) {

		console.warn('request url:', typeof url, url);
		console.warn("request options:", options);
		console.error("!!!!! [data_manager.request] SERVER ERROR. Received data is not JSON valid or network error. See your server log for details. catch ERROR:\n", error);

		// Return a normalised error envelope instead of rejecting the promise so
		// that `self.onmessage` always receives an object it can post back safely.
		return {
			result	: false,
			msg		: error.message || 'Network error',
			error	: error,
			errors	: [error.message || 'Network error'],
		};
	}
}//end request



// @license-end
