// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_runtime_info} from './render_runtime_info.js'



/**
* WIDGET_REQUEST
* Shared helper for the widget's API calls.
* @param string action
* 	Backend action, one of 'clear_cache_files' | 'clear_session_files'.
* @param object options = {}
* @param int timeout = 30 * 1000
* 	Per-attempt timeout in ms.
* @return promise - api_response
*/
const widget_request = (action, options={}, timeout=30*1000) => {

	return data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'runtime_info',
				action	: action
			},
			options			: options
		},
		retries : 1, // one try only
		timeout : timeout
	})
}//end widget_request



/**
* RUNTIME_INFO
*/
export const runtime_info = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end runtime_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	runtime_info.prototype.init		= widget_common.prototype.init
	runtime_info.prototype.build		= widget_common.prototype.build
	runtime_info.prototype.render	= widget_common.prototype.render
	runtime_info.prototype.destroy	= widget_common.prototype.destroy
	runtime_info.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	runtime_info.prototype.edit		= render_runtime_info.prototype.list
	runtime_info.prototype.list		= render_runtime_info.prototype.list



/**
* CLEAR_CACHE_FILES
* Removes old files from the Dédalo cache directory.
* @return promise - api_response
*/
runtime_info.prototype.clear_cache_files = async function() {

	const api_response = await widget_request('clear_cache_files')

	return api_response
}//end clear_cache_files



/**
* CLEAR_SESSION_FILES
* Removes expired file-based session files.
* @return promise - api_response
*/
runtime_info.prototype.clear_session_files = async function() {

	const api_response = await widget_request('clear_session_files')

	return api_response
}//end clear_session_files



// @license-end
