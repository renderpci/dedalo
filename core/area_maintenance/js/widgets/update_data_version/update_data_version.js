// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/widget_common.js'
	import {render_update_data_version} from './render_update_data_version.js'



/**
* UPDATE_DATA_VERSION
*/
export const update_data_version = function() {

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
}//end update_data_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	update_data_version.prototype.init		= widget_common.prototype.init
	update_data_version.prototype.build		= widget_common.prototype.build
	update_data_version.prototype.render	= widget_common.prototype.render
	update_data_version.prototype.destroy	= widget_common.prototype.destroy
	// render
	update_data_version.prototype.edit		= render_update_data_version.prototype.list
	update_data_version.prototype.list		= render_update_data_version.prototype.list



// @license-end
