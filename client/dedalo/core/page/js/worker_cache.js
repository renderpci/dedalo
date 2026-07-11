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
 *   { status: 'finish',  total_files: number, time: number }
 *   { status: 'finish',  error: string }   (on API failure)
 *
 * This Worker is intentionally self-contained: it bundles its own minimal
 * `data_manager` object (see below) rather than importing the full
 * `core/common/js/data_manager.js`, because that module depends on browser
 * globals (`page_globals`, event_manager, etc.) not available inside a Worker
 * context.
 */



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
		const api_response = await data_manager.request({
			url : url,
			body : {
				action	: 'get_dedalo_files',
				dd_api	: 'dd_utils_api'
			}
		});

		// API error case
		if (!api_response.result) {
			console.error('Error on get api response:', api_response);
			self.postMessage({
				status	: 'finish',
				error	: 'Error on get api response'
			});
			return
		}

	// response data
		const api_response_result_length = api_response.result.length

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

			const item = api_response.result[i]

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
			time			: performance.now()-t1
		})

	// debug
		console.log("__***Time performance.now()-t1 worker:", performance.now()-t1);


	return true
})//end message event



/**
 * DATA_MANAGER REQUEST CUSTOM
 * Avoid to use data_manager module to allow happy Firefox users
 *
 * A lightweight, self-contained HTTP client intentionally duplicated from
 * `core/common/js/data_manager.js`. It exists here because Web Workers cannot
 * import browser-globals-dependent modules (page_globals, event_manager, etc.)
 * and Firefox historically had issues with service-worker module imports.
 *
 * Only `request` is implemented; the full data_manager feature set (streaming,
 * retry, health checks, response cache) is not needed in this worker context.
 *
 * Exposed as a plain object literal (not a class) so it has no shared state;
 * concurrent calls are safe because all values are scoped to local `const`.
 */
const data_manager = {
	/**
	 * REQUEST
	 * Sends a JSON POST to a Dédalo API endpoint and returns the parsed response.
	 * All fetch options default to Dédalo conventions (POST, cors, no-cache,
	 * same-origin credentials). The body is always JSON-serialised.
	 *
	 * Error handling:
	 *   - HTTP-level errors (non-2xx) are caught by `handle_errors` and rethrown.
	 *   - API-level errors (`result.error` truthy) are logged but still returned
	 *     so the caller can inspect `api_response.result` directly.
	 *   - Network-level errors (fetch rejection) are caught and returned as a
	 *     synthetic `{ result: false, msg, error }` object so the caller never
	 *     receives a rejected Promise.
	 *
	 * @param {Object} options - Request configuration
	 * @param {string} options.url - Target API endpoint URL
	 * @param {Object} [options.body] - Request body; serialised with JSON.stringify
	 * @param {string} [options.method='POST'] - HTTP method
	 * @param {string} [options.mode='cors'] - Fetch mode
	 * @param {string} [options.cache='no-cache'] - Cache mode
	 * @param {string} [options.credentials='same-origin'] - Credentials policy
	 * @param {Object} [options.headers={'Content-Type':'application/json'}] - HTTP headers
	 * @param {string} [options.redirect='follow'] - Redirect behaviour
	 * @param {string} [options.referrer='no-referrer'] - Referrer policy
	 * @returns {Promise<Object>} Parsed JSON response from the API, or a synthetic
	 *   error object `{ result: false, msg: string, error: Error }` on failure
	 */
	request : async function(options) {

		// options (local variables prevent shared-state races on concurrent calls)
			const url			= options.url
			const method		= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
			const mode			= options.mode || 'cors' // no-cors, cors, *same-origin
			const cache			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
			const credentials	= options.credentials || 'same-origin' // include, *same-origin, omit
			const headers		= options.headers || {'Content-Type': 'application/json'}// 'Content-Type': 'application/x-www-form-urlencoded'
			const redirect		= options.redirect || 'follow' // manual, *follow, error
			const referrer		= options.referrer || 'no-referrer' // no-referrer, *client
			const body			= options.body // body data type must match "Content-Type" header

		// handle_errors
			// Converts a non-OK HTTP response into a thrown Error so the
			// Promise chain's `.catch` handler can intercept transport failures
			// separately from application-level `result.error` values.
			const handle_errors = function(response) {
				if (!response.ok) {
					console.warn("-> HANDLE_ERRORS response:",response);
					throw Error(response.statusText);
				}
				return response;
			}

		const api_response = fetch(
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
			})
			.then(handle_errors)
			.then(response => {
				const json_parsed = response.json().then((result)=>{

					if (result.error) {

						// debug console message
							console.error("result error:",result);

						// alert msg to user
							const msg = result.msg || result.error
							console.error("An error occurred in the connection with the API (worker cache data_manager). \n" + msg);

						// custom behaviors
							switch (result.error) {
								case 'not_logged':
									// redirect to login page
									// location.reload();
									console.warn('Result error. no logged!', result);
									break;

								default:
									// write message to the console
									break;
							}
					}

					return result
				})

				return json_parsed
			})
			.catch(error => {
				// Network or parse failure: return a synthetic object so the
				// caller always receives a plain Object (never a rejected Promise).
				// The caller must check `api_response.result === false` to detect
				// this error path.
				console.error("!!!!! [data_manager.request] SERVER ERROR. Received data is not JSON valid. See your server log for details. catch ERROR:\n", error)
				console.warn("options:", options);
				return {
					result	: false,
					msg		: error.message,
					error	: error
				}
			});


		return api_response
	}
}//end data_manager



// @license-end
