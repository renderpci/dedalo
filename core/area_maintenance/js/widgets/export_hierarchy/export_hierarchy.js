// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_export_hierarchy} from './render_export_hierarchy.js'



/**
* EXPORT_HIERARCHY
*/
export const export_hierarchy = function() {

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
}//end export_hierarchy



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	export_hierarchy.prototype.init		= widget_common.prototype.init
	export_hierarchy.prototype.build	= widget_common.prototype.build
	export_hierarchy.prototype.render	= widget_common.prototype.render
	export_hierarchy.prototype.destroy	= widget_common.prototype.destroy
	// render
	export_hierarchy.prototype.edit		= render_export_hierarchy.prototype.list
	export_hierarchy.prototype.list		= render_export_hierarchy.prototype.list



// @license-end
