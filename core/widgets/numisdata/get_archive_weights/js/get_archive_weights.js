/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_get_archive_weights} from '../js/render_get_archive_weights.js'



export const get_archive_weights = function(){

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
}//end get_archive_weights



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	get_archive_weights.prototype.init		= widget_common.prototype.init
	get_archive_weights.prototype.build		= widget_common.prototype.build
	// render
	get_archive_weights.prototype.edit 		= render_get_archive_weights.prototype.edit



/**
* RENDER
*/
get_archive_weights.prototype.render = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level || 'full'
	const render_mode 	= self.mode || 'edit'

	const node = await self[render_mode]({
		render_level : render_level
	})

	self.node.push(node)

	return node
}//end render
