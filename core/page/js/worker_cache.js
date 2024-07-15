// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global*/
/*eslint no-undef: "error"*/



// WORKER
// Calculate complex data in background
// (!) Note that the worker module version doesn't work in Firefox and scope is very annoying to receive functions by name
// import {data_manager} from '../../common/js/data_manager.js'



// DES
	// self.addEventListener('fetch', e => {
	// 	e.respondWith(
	// 		(async () => {
	// 			console.log('///////////////////////////////// e:', e);
	// 			// // Load the asset from cache, and refresh the cache
	// 			const cacheResponse = await caches.match(e.request);
	// 			// Refresh the cache (async) while returning the cached response
	// 			// (ETags will prevent unnecessary downloads)
	// 			fetch(e.request).then(fetchResponse => {
	// 				caches
	// 					.open(CACHE_NAME)
	// 					.then(cache => cache.put(e.request, fetchResponse));
	// 			});
	// 			if (cacheResponse) return cacheResponse;
	// 			return fetch(e.request);
	// 		})()
	// 	);
	// });



/**
* ONMESSAGE
* Called from caller 'postMessage' action like:

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
self.onmessage = async function(e) {
	const t1 = performance.now()

	// options
		const url = e.data.url

	// get_dedalo_files from API
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
		self.postMessage({
			status		: 'ready',
			total_files	: api_response_result_length,
		});

	// headers for JS and CSS files
		const get_headers = (item) => {

			const headers = new Headers();

			switch (item.type) {
				case 'js':
					// time: one week = 604800 (7 x 24 x 60 x 60)
					headers.append('Cache-Control', 'stale-while-revalidate=604800');
					// mime: text/javascript
					headers.append('Content-Type', 'text/javascript');
					break;

				case 'css':
					// time: one day = 86400 (1 x 24 x 60 x 60)
					headers.append('Cache-Control', 'stale-while-revalidate=86400');
					// mime: text/css
					headers.append('Content-Type', 'text/css');
					break;
				default:

					break;
			}

			return headers
		}

	// fetch cache @see https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
		const cache = 'no-cache'; // (!) The only mode that really work's for all browsers is 'no-cache'

	// fetch each file. Force cache reload (https://hacks.mozilla.org/2016/03/referrer-and-cache-control-apis-for-fetch/)
		const ar_promises = []
		for (let i = 0; i < api_response_result_length; i++) {

			const item = api_response.result[i]

			ar_promises.push(
				fetch(item.url, {
					headers		: get_headers(item),
					method		: 'GET',
					cache		: cache, // "no-store","reload","no-cache","force-cache"
					credentials	: 'same-origin',
					credentials	: 'omit'
				})
				.then((response) => {

					// worker msg
					self.postMessage({
						status		: 'loading',
						total_files	: api_response_result_length,
						file_loaded	: true
					});

					if (!response.ok) {
						throw new Error('Network response was not OK', item);
					}
				})
				.catch((error) => {
					console.error('Error on load file:', item.url, error);
				})
			)
		}

	// wait until all fetch are done
		await Promise.all(ar_promises)

	// worker msg
		self.postMessage({
			status			: 'finish',
			api_response	: api_response,
			total_files		: api_response_result_length,
			time			: performance.now()-t1
		})

	// debug
		console.log("__***Time performance.now()-t1 worker:", performance.now()-t1);


	return true
}//end onmessage



/**
* DATA_MANGER REQUEST CUSTOM
* Avoid to use data_manager module to allow happy Firefox users
*/
const data_manager = {}
data_manager.request = async function(options) {
	// console.log("// request options:",options);

	// options
		this.url			= options.url
		this.method			= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
		this.mode			= options.mode || 'cors' // no-cors, cors, *same-origin
		this.cache			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
		this.credentials	= options.credentials || 'same-origin' // include, *same-origin, omit
		this.headers		= options.headers || {'Content-Type': 'application/json'}// 'Content-Type': 'application/x-www-form-urlencoded'
		this.redirect		= options.redirect || 'follow' // manual, *follow, error
		this.referrer		= options.referrer || 'no-referrer' // no-referrer, *client
		this.body			= options.body // body data type must match "Content-Type" header

	// handle_errors
		const handle_errors = function(response) {
			if (!response.ok) {
				console.warn("-> HANDLE_ERRORS response:",response);
				throw Error(response.statusText);
			}
			return response;
		}

	const api_response = fetch(
		this.url,
		{
			method		: this.method,
			mode		: this.mode,
			cache		: this.cache,
			credentials	: this.credentials,
			headers		: this.headers,
			redirect	: this.redirect,
			referrer	: this.referrer,
			body		: JSON.stringify(this.body)
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
			console.error("!!!!! [data_manager.request] SERVER ERROR. Received data is not JSON valid. See your server log for details. catch ERROR:\n", error)
			console.warn("options:", options);
			return {
				result	: false,
				msg		: error.message,
				error	: error
			}
		});


	return api_response
}//end request



// @license-end
