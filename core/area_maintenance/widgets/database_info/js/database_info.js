// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_database_info} from './render_database_info.js'



/**
* DATABASE_INFO
*/
export const database_info = function() {

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
}//end database_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	database_info.prototype.init		= widget_common.prototype.init
	// database_info.prototype.build	= widget_common.prototype.build
	database_info.prototype.render		= widget_common.prototype.render
	database_info.prototype.destroy		= widget_common.prototype.destroy
	database_info.prototype.get_value	= area_maintenance.prototype.get_value
	// // render
	database_info.prototype.edit		= render_database_info.prototype.list
	database_info.prototype.list		= render_database_info.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
database_info.prototype.build = async function(autoload=false) {

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
