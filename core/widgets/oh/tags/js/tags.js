/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_tags} from '../js/render_tags.js'



export const tags = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = []

	this.status

	return true
}//end tags



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	tags.prototype.init 	 		= widget_common.prototype.init
	// render
	tags.prototype.edit 			= render_tags.prototype.edit
	tags.prototype.list 			= render_tags.prototype.edit


/**
* RENDER
*/
tags.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
