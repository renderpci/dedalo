/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../widget_common/widget_common.js'
	import {render_edit_state} from '../js/render_edit_state.js'
	import {render_list_state} from '../js/render_list_state.js'



export const state = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = null

	this.status

	this.events_tokens = []

	return true
}//end state



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	state.prototype.init	= widget_common.prototype.init
	state.prototype.build	= widget_common.prototype.build
	state.prototype.render	= widget_common.prototype.render
	state.prototype.destroy	= widget_common.prototype.destroy
	// render
	state.prototype.edit	= render_edit_state.prototype.edit
	state.prototype.list	= render_list_state.prototype.list
