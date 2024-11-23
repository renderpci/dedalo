// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_check_config} from './render_check_config.js'



/**
* CHECK_CONFIG
*/
export const check_config = function() {

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
}//end check_config



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	check_config.prototype.init		= widget_common.prototype.init
	check_config.prototype.build	= widget_common.prototype.build
	check_config.prototype.render	= widget_common.prototype.render
	check_config.prototype.refresh	= widget_common.prototype.refresh
	check_config.prototype.destroy	= widget_common.prototype.destroy
	// // render
	check_config.prototype.edit		= render_check_config.prototype.list
	check_config.prototype.list		= render_check_config.prototype.list



// @license-end
