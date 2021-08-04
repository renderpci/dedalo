/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_descriptors} from '../js/render_descriptors.js'



export const descriptors = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = []

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
	// descriptors.prototype.init 	 	= component_common.prototype.init
	// render
	descriptors.prototype.edit 			= render_descriptors.prototype.edit
	descriptors.prototype.list 			= render_descriptors.prototype.list



/**
* INIT
*/
descriptors.prototype.init = async function(options) {

	const self = this

	// call the generic commom init
		const common_init = widget_common.prototype.init.call(this, options);

}//end init



/**
* RENDER
*/
descriptors.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
