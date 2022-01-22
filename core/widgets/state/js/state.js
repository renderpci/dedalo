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

	this.node = []

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
	state.prototype.destroy	= widget_common.prototype.destroy
	// render
	state.prototype.edit	= render_edit_state.prototype.edit
	state.prototype.list	= render_list_state.prototype.list


/**
* RENDER
*/
state.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
