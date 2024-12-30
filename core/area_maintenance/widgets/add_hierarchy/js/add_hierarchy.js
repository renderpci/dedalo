// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_add_hierarchy} from './render_add_hierarchy.js'



/**
* ADD_HIERARCHY
*/
export const add_hierarchy = function() {

	this.id

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end add_hierarchy



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	add_hierarchy.prototype.init	= widget_common.prototype.init
	add_hierarchy.prototype.build	= widget_common.prototype.build
	add_hierarchy.prototype.render	= widget_common.prototype.render
	add_hierarchy.prototype.destroy	= widget_common.prototype.destroy
	add_hierarchy.prototype.refresh	= widget_common.prototype.refresh
	// render
	add_hierarchy.prototype.edit	= render_add_hierarchy.prototype.list
	add_hierarchy.prototype.list	= render_add_hierarchy.prototype.list



// @license-end
