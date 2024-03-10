// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_edit_descriptors} from './render_edit_descriptors.js'
	import {render_list_descriptors} from './render_list_descriptors.js'


export const descriptors = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens = []

	this.status

	return true
}//end descriptors



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	descriptors.prototype.init		= widget_common.prototype.init
	descriptors.prototype.build		= widget_common.prototype.build
	descriptors.prototype.destroy	= widget_common.prototype.destroy
	descriptors.prototype.render	= widget_common.prototype.render
	descriptors.prototype.refresh	= widget_common.prototype.refresh
	// render
	descriptors.prototype.edit		= render_edit_descriptors.prototype.edit
	descriptors.prototype.list		= render_list_descriptors.prototype.list




// @license-end
