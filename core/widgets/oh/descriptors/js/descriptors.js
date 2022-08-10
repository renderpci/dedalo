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
	descriptors.prototype.init		= widget_common.prototype.init
	descriptors.prototype.build		= widget_common.prototype.build
	descriptors.prototype.destroy	= widget_common.prototype.destroy
	descriptors.prototype.render	= widget_common.prototype.render
	// render
	descriptors.prototype.edit		= render_descriptors.prototype.edit
	descriptors.prototype.list		= render_descriptors.prototype.list
