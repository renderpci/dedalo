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

	this.events_tokens = []

	return true
}//end tags



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	tags.prototype.init		= widget_common.prototype.init
	tags.prototype.build	= widget_common.prototype.build
	tags.prototype.destroy	= widget_common.prototype.destroy
	tags.prototype.render	= widget_common.prototype.render
	// render
	tags.prototype.edit		= render_tags.prototype.edit
	tags.prototype.list		= render_tags.prototype.edit
