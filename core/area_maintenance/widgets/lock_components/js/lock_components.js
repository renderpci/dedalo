// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_lock_components} from './render_lock_components.js'



/**
* LOCK_COMPONENTS
*/
export const lock_components = function() {

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
}//end lock_components



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	lock_components.prototype.init		= widget_common.prototype.init
	lock_components.prototype.build		= widget_common.prototype.build
	lock_components.prototype.render	= widget_common.prototype.render
	lock_components.prototype.destroy	= widget_common.prototype.destroy
	// // render
	lock_components.prototype.edit		= render_lock_components.prototype.list
	lock_components.prototype.list		= render_lock_components.prototype.list



// @license-end
