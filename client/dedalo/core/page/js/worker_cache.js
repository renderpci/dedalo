// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global*/
/*eslint no-undef: "error"*/



/**
 * WORKER_CACHE
 * Dedicated Web Worker that pre-fetches and force-reloads all Dédalo core and
 * tool JS/CSS files into the browser's HTTP cache immediately after user login.
 *
 * This is the HTTP-level fallback cache strategy for environments that cannot
 * run a Service Worker (plain HTTP, Firefox quirks, sw.js registration failures).
 * When HTTPS is available and the service worker registers successfully,
 * sw.js handles caching instead; this worker is used only as the secondary path.
 * @see core/sw.js              — the primary HTTPS/Service-Worker cache path
 * @see login.js#run_worker_cache — the caller that spawns this Worker
 * @see dd_utils_api::get_dedalo_files — the PHP API endpoint that returns the
 *      manifest of files to cache
 *
 * Lifecycle:
 *   1. The caller (login.js `run_worker_cache`) spawns this Worker as a
 *      module-type Worker and immediately sends a `postMessage` containing
 *      `{ action: 'clear_cache', url: DEDALO_API_URL }`.
 *   2. The single 'message' listener fires: it calls `dd_utils_api::get_dedalo_files`
 *      to obtain the manifest, then parallel-fetches every file with
 *      `cache: 'reload'` to guarantee fresh copies are written into the
 *      browser HTTP cache.
 *   3. The worker sends progress messages (`ready`, `loading`, `finish`) back to
 *      the caller via `self.postMessage` so the UI can animate a progress bar.
 *   4. On user logout, the caller is expected to terminate the worker (if still
 *      running) and the browser HTTP cache is cleared through normal cache
 *      eviction — there is no explicit `delete` step needed here.
 *
 * Outbound messages (self → caller):
 *   { status: 'ready',   total_files: number }
 *   { status: 'loading', key: number, total_files: number, file_loaded: true }
 *   { status: 'finish',  total_files: number, time: number, error: string|null }
 * The 'finish' shape is SHARED with core/sw.js (one login handler consumes both)
 * and is ALWAYS sent, success or failure: the login navigates on it, so a
 * swallowed failure leaves the user on the progress ring forever.
 *
 * This Worker does NOT import the full `core/common/js/data_manager.js` (that
 * module depends on page globals a Worker scope lacks); it uses the shared,
 * DOM-free transport `core/common/js/api_transport.js` — the same one
 * data_manager.js and core/sw.js use, so there is no second copy of the
 * request algorithm.
 */

// imports
	import {fetch_api} from '../../common/js/api_transport.js'
	import {response_data} from '../../common/js/api_error.js'



/**
 * ONMESSAGE
 * Fired from caller 'postMessage' action like:
	const current_worker = new Worker('../area_development/js/worker.js', {
		type : 'module'
	});
	current_worker.postMessage({
		url		: DEDALO_API_URL,
		dd_api	: item.trigger.dd_api,
		action	: item.trigger.action,
		options	: item.trigger.options
	});
	current_worker.onmessage = function(e) {
		const api_response = e.data.api_response
		print_response(body_response, api_response)
		widget_info.classList.remove("lock")
		spinner.remove()
		current_worker.terminate()
	}
*/
// (!) The 'action' field sent by the caller (e.g. 'clear_cache') is received
// in event.data but is intentionally not read here — the worker performs the
// same cache-refresh routine on every message regardless of the action value.
self.addEventListener('message', async (event) => {
	const t1 = performance.now()

	// options
		const url = event.data.url

	// get_dedalo_files from API
		// Fetch the manifest of all cacheable Dédalo files from the server.
		// The API call is unauthenticated in the worker context; the server
		// validates the session via the cookie forwarded by `same-origin` credentials.
		const api_response = await api_request({
			url : url,
			body : {
				action	: 'get_dedalo_files',
				dd_api	: 'dd_utils_api'
			}
		});

		// API error case. The envelope carries an ApiError under `error`; the
		// caller (login.js) only needs to know the cache pass did not run.
		const files = response_data(api_response)
		if (api_response.error || !Array.isArray(files)) {
			console.error('Error on get api response:', api_response);
			// (!) Same 'finish' shape as core/sw.js: the login has ONE handler for both
			// cache paths and navigates on this message. Keep the keys identical.
			self.postMessage({
				status		: 'finish',
				total_files	: 0,
				time		: performance.now()-t1,
				error		: api_response.error?.code || 'Error on get api response'
			});
			return
		}

	// response data
		const api_response_result_length = files.length

	// worker msg
		// Notify the caller of the total file count so the UI can initialize
		// the progress bar before fetching begins.
		self.postMessage({
			status		: 'ready',
			total_files	: api_response_result_length,
		});

	// pre-built headers per type (avoids rebuilding on every iteration)
		// Each response must carry the correct Content-Type or some browsers
		// will refuse to execute/apply the cached resource. JS files and CSS
		// files need different Content-Type headers.
		const js_headers = new Headers();
		js_headers.append('Content-Type', 'text/javascript');

		const css_headers = new Headers();
		css_headers.append('Content-Type', 'text/css');

		const headers_map = {
			js	: js_headers,
			css	: css_headers
		}

	// fetch cache @see https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
		// cache modes
			// reload :
				// Download a resource with cache busting, but update the HTTP
				// cache with the downloaded resource.
			// no-cache:
				// Download a resource with cache busting when dealing with a
				// properly configured server that will send the correct ETag
				// and Date headers and properly handle If-Modified-Since and
				// If-None-Match request headers, therefore we can rely on the
				// validation to guarantee a fresh response.
		// 'reload' is chosen so that fresh bytes are always written to the
		// HTTP cache on login even when the browser still holds a valid cached
		// copy. This guarantees users always run the latest deployed code.
		const cache = 'reload';

	// atomic counter for monotonically increasing progress
		let loaded_count = 0

	// fetch each file. Force cache reload (https://hacks.mozilla.org/2016/03/referrer-and-cache-control-apis-for-fetch/)
		// All fetches are fired in parallel and collected into `ar_promises`;
		// individual failures are caught and logged without aborting the rest,
		// so one broken URL does not prevent the remaining files from loading.
		const ar_promises = []
		for (let i = 0; i < api_response_result_length; i++) {

			const item = files[i]

			const file_url = item.url

			// Fall back to js_headers for any unknown type (defensive default).
			const headers = headers_map[item.type] || js_headers

			ar_promises.push(
				fetch(file_url, {
					headers		: headers,
					method		: 'GET',
					cache		: cache, // "no-store","reload","no-cache","force-cache"
				})
				.then((response) => {

					if (!response.ok) {
						throw new Error('Network response was not OK', { cause: item });
					}

					// notify only after confirming a successful response
					// `loaded_count` is incremented synchronously inside a
					// `.then` microtask, so concurrent promises will each
					// read a different value; no mutex is needed here because
					// the JS event loop is single-threaded.
					loaded_count++
					self.postMessage({
						status		: 'loading',
						key			: loaded_count,
						total_files	: api_response_result_length,
						file_loaded	: true
					});
				})
				.catch((error) => {
					// Log the failure but do not re-throw: a missing file must
					// not abort caching of the remaining files.
					console.error('Error on load file:', item.url, error);
				})
			)
		}

	// wait until all fetch are done
		await Promise.all(ar_promises)

	// worker msg
		// 'finish' signals the caller to dismiss the progress UI and proceed
		// with whatever post-cache action it has queued (e.g. navigating to
		// the main application).
		self.postMessage({
			status			: 'finish',
			total_files		: api_response_result_length,
			time			: performance.now()-t1,
			error			: null
		})

	// debug
		console.log("__***Time performance.now()-t1 worker:", performance.now()-t1);


	return true
})//end message event



/**
 * API_REQUEST
 * One JSON POST through the shared transport (`fetch_api`). Resolves the
 * envelope; on failure it carries `error` (an ApiError) — read
 * `response_data()` for the payload. Never rejects.
 * @param {Object} options - {url, body}
 * @return Promise<Object>
 */
const api_request = async (options) => {
	const {json, api_error} = await fetch_api(
		options.url,
		{
			method		: 'POST',
			mode		: 'cors',
			cache		: 'no-cache',
			credentials	: 'same-origin',
			headers		: {'Content-Type': 'application/json'},
			redirect	: 'follow',
			referrer	: 'no-referrer',
			body		: JSON.stringify(options.body)
		},
		{timeout_ms: 30000, retries: 3, health_url: '/health'}
	)
	if (api_error) {
		console.error('[worker_cache] API request failed:', api_error.code, api_error.message, api_error)
		return {ok:false, error:api_error}
	}
	return json
}//end api_request



// @license-end
