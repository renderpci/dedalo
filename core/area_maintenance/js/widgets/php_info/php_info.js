// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_php_info} from './render_php_info.js'



/**
* php_info
*/
export const php_info = function() {

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
}//end php_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	php_info.prototype.init		= widget_common.prototype.init
	php_info.prototype.build	= widget_common.prototype.build
	php_info.prototype.render	= widget_common.prototype.render
	php_info.prototype.destroy	= widget_common.prototype.destroy
	// // render
	php_info.prototype.edit		= render_php_info.prototype.list
	php_info.prototype.list		= render_php_info.prototype.list



// @license-end
