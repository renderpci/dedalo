// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_php_runtime} from './render_php_runtime.js'



/**
* WIDGET_REQUEST
* Shared helper for the widget's API calls.
* @param string action
* 	Backend action, e.g. 'reset_opcache'
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
				model	: 'php_runtime',
				action	: action
			},
			options			: options
		},
		retries : 1, // one try only
		timeout : timeout
	})
}//end widget_request



/**
* PHP_RUNTIME
*/
export const php_runtime = function() {

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
}//end php_runtime



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	php_runtime.prototype.init		= widget_common.prototype.init
	php_runtime.prototype.build		= widget_common.prototype.build
	php_runtime.prototype.render	= widget_common.prototype.render
	php_runtime.prototype.destroy	= widget_common.prototype.destroy
	php_runtime.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	php_runtime.prototype.edit		= render_php_runtime.prototype.list
	php_runtime.prototype.list		= render_php_runtime.prototype.list



/**
* CLEAR_CACHE_FILES
* Removes old files from the Dédalo cache directory.
* @return promise - api_response
*/
php_runtime.prototype.clear_cache_files = async function() {

	const api_response = await widget_request('clear_cache_files')

	return api_response
}//end clear_cache_files



/**
* CLEAR_SESSION_FILES
* Removes expired file-based session files.
* @return promise - api_response
*/
php_runtime.prototype.clear_session_files = async function() {

	const api_response = await widget_request('clear_session_files')

	return api_response
}//end clear_session_files



// @license-end
