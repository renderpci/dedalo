// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_php_user} from './render_php_user.js'



/**
* PHP_USER
*/
export const php_user = function() {

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
}//end php_user



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	php_user.prototype.init		= widget_common.prototype.init
	php_user.prototype.build	= widget_common.prototype.build
	php_user.prototype.render	= widget_common.prototype.render
	php_user.prototype.destroy	= widget_common.prototype.destroy
	// // render
	php_user.prototype.edit		= render_php_user.prototype.list
	php_user.prototype.list		= render_php_user.prototype.list



// @license-end
