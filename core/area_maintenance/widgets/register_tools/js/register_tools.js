// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_register_tools} from './render_register_tools.js'



/**
* REGISTER_TOOLS
*/
export const register_tools = function() {

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
}//end register_tools



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	register_tools.prototype.init		= widget_common.prototype.init
	register_tools.prototype.build		= widget_common.prototype.build
	register_tools.prototype.render		= widget_common.prototype.render
	register_tools.prototype.destroy	= widget_common.prototype.destroy
	register_tools.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	register_tools.prototype.edit		= render_register_tools.prototype.list
	register_tools.prototype.list		= render_register_tools.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
register_tools.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		self.value = await self.get_value()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



// @license-end
