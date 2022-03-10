// WORKER
// Calculate complex data in background
import {data_manager} from '../../common/js/data_manager.js'

/**
* ONMESSAGE
* Called from caller 'postMessage' action like:

	const current_worker = new Worker('../component_security_access/js/worker.js');
	current_worker.postMessage({
		fn		: 'get_children',
		params	: [item, datalist]
	});
	current_worker.onmessage = function(e) {
		const children = e.data.result
		fn_global_radio(children)
		current_worker.terminate()
	}
*/
self.onmessage = async function(e) {
	const t1 = performance.now()

	// options
		const url		= e.data.url
		const dd_api	= e.data.dd_api
		const action	= e.data.action
		const options	= e.data.options

	// data_manager
		const api_response = await data_manager.prototype.request({
			url		: url,
			body	: {
				dd_api	: dd_api,
				action	: action,
				options	: options
			}
		})

	const response = {
		api_response : api_response
	}

	console.log("__***Time performance.now()-t1 worker:", performance.now()-t1);

	self.postMessage(response);
}//end onmessage




