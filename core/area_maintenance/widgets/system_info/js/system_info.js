// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_system_info} from './render_system_info.js'



/**
* SYSTEM_INFO
*/
export const system_info = function() {

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
}//end system_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	system_info.prototype.init		= widget_common.prototype.init
	// system_info.prototype.build	= widget_common.prototype.build
	system_info.prototype.render	= widget_common.prototype.render
	system_info.prototype.destroy	= widget_common.prototype.destroy
	system_info.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	system_info.prototype.edit		= render_system_info.prototype.list
	system_info.prototype.list		= render_system_info.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
system_info.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// delay value resolution to avoid blocking other widgets
		// note that system info has a lower priority because could be
		// a long request collecting the system resources info
		// value will be fixed at render, when datalist_container is in view port

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



// @license-end
