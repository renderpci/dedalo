// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_diffusion_server_control} from './render_diffusion_server_control.js'



/**
* DIFFUSION_SERVER_CONTROL
* Control panel for the Bun diffusion server: status, health, lifecycle
* (start/stop/restart), in-flight processes and pending deletions.
*/
export const diffusion_server_control = function() {

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
}//end diffusion_server_control



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	diffusion_server_control.prototype.init		= widget_common.prototype.init
	diffusion_server_control.prototype.render	= widget_common.prototype.render
	diffusion_server_control.prototype.refresh	= widget_common.prototype.refresh
	diffusion_server_control.prototype.destroy	= widget_common.prototype.destroy
	diffusion_server_control.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	diffusion_server_control.prototype.edit		= render_diffusion_server_control.prototype.list
	diffusion_server_control.prototype.list		= render_diffusion_server_control.prototype.list



/**
* BUILD
* Custom build overwrites common widget method. Data loads on open via the
* unified widget load() (see render_area_maintenance).
* @param bool autoload = false
* @return bool
*/
diffusion_server_control.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* WIDGET_REQUEST
* Shared helper: dispatch a widget action to the server through
* dd_area_maintenance_api::widget_request.
* @param string action - method name (must be in the widget's API_ACTIONS)
* @param object options = {}
* @param int timeout = 60000
* @return promise - api_response
*/
diffusion_server_control.prototype.widget_request = async function(action, options={}, timeout=60*1000) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'diffusion_server_control',
				action	: action
			},
			options	: options
		},
		retries : 1, // one try only
		timeout : timeout
	})
	if(SHOW_DEBUG===true) {
		console.log('diffusion_server_control ' + action + ' api_response:', api_response);
	}

	return api_response
}//end widget_request



/**
* START_SERVER / STOP_SERVER / RESTART_SERVER
* Lifecycle actions (global-admin gated server-side). Run the deployment
* supervisor command. @return promise - api_response
*/
diffusion_server_control.prototype.start_server = async function() {
	return this.widget_request('start_server')
}//end start_server

diffusion_server_control.prototype.stop_server = async function() {
	return this.widget_request('stop_server')
}//end stop_server

diffusion_server_control.prototype.restart_server = async function() {
	return this.widget_request('restart_server')
}//end restart_server



/**
* CANCEL_PROCESS
* Cancels one in-flight diffusion process by id (global-admin gated).
* @param string process_id
* @return promise - api_response
*/
diffusion_server_control.prototype.cancel_process = async function(process_id) {
	return this.widget_request('cancel_process', { process_id : process_id })
}//end cancel_process



/**
* RETRY_PENDING_DELETIONS
* Retries propagation of pending unpublish deletions (global-admin gated).
* @return promise - api_response
*/
diffusion_server_control.prototype.retry_pending_deletions = async function() {
	return this.widget_request('retry_pending_deletions', {}, 3600 * 1000)
}//end retry_pending_deletions



// @license-end
