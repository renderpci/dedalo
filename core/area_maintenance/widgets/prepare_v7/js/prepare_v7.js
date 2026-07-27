// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/

/**
* PREPARE_V7
* v6 area-maintenance widget: "Prepare installation for v7".
*
* Thin client for the isolated v6→v7 migration package. Two server calls only,
* both through the standard maintenance API (dd_area_maintenance_api):
*
*   get_widget_value  → prepare_v7::get_value()  readiness snapshot + log tail
*   widget_request    → prepare_v7::prepare_v7({mode, skip_backup})  launch
*
* The server spawns the runner detached; this widget then polls get_value() to
* stream var/prepare_v7.log until the run reports a terminal line.
*
* Deploy: this folder is copied into <v6>/core/area_maintenance/widgets/prepare_v7/,
* so the relative imports below resolve from there.
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_prepare_v7} from './render_prepare_v7.js'



/**
* PREPARE_V7
*/
export const prepare_v7 = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.value			= null

	this.status
}//end prepare_v7



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	prepare_v7.prototype.init		= widget_common.prototype.init
	prepare_v7.prototype.render		= widget_common.prototype.render
	prepare_v7.prototype.refresh	= widget_common.prototype.refresh
	prepare_v7.prototype.destroy	= widget_common.prototype.destroy
	prepare_v7.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	prepare_v7.prototype.edit		= render_prepare_v7.prototype.list
	prepare_v7.prototype.list		= render_prepare_v7.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
prepare_v7.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common widget build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// readiness snapshot from prepare_v7::get_value
		self.value = await self.get_value()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* PREPARE_V7 (API)
* Launches the migration package runner in background (server side)
* @param object options
* {
*	mode		: string 'preflight'|'migrate'
*	skip_backup	: bool
* }
* @return object api_response
* 	{ result: bool, pid: int|null, msg: string, errors: [] }
*/
prepare_v7.prototype.launch = async function(options) {

	const self = this

	const api_response = await self.api_request('widget_request', {
		mode		: options.mode,
		skip_backup	: options.skip_backup===true
	}, 'prepare_v7')

	if(SHOW_DEBUG===true) {
		console.log('))) prepare_v7 launch api_response:', api_response);
	}


	return api_response
}//end launch



/**
* API_REQUEST
* Single seam to the v6 maintenance API
* @param string action
* 	'widget_request'
* @param object options
* @param string widget_action
* 	Method name of the widget server class
* @return object api_response
*/
prepare_v7.prototype.api_request = async function(action, options, widget_action) {

	const self = this

	const api_response = await data_manager.request({
		body : {
			dd_api			: 'dd_area_maintenance_api',
			action			: action,
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: self.id || 'prepare_v7',
				action	: widget_action
			},
			options			: options
		},
		retries	: 1, // one try only
		timeout	: 300 * 1000
	})


	return api_response
}//end api_request



// @license-end
