// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
// WORKER
// Calculate complex data in background
// (!) Note that the worker module version doesn't work in Firefox and scope is very annoying to receive functions by name
// import {data_manager} from '../../common/js/data_manager.js'



/**
* ONMESSAGE
* Called from caller 'postMessage' action like:

	const current_worker = new Worker('../common/js/worker.js', {
		type		: 'module',
		credentials	: 'omit'
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
* DATA_MANGER REQUEST CUSTOM
* Avoid to use data_manager module to allow happy Firefox users
*/
const data_manager = {}
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

		return {
			result	: false,
			msg		: error.message || 'Network error',
			error	: error,
			errors	: [error.message || 'Network error'],
		};
	}
}//end request



// @license-end
