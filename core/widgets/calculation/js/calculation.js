/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../widget_common/widget_common.js'
	import {render_calculation} from '../js/render_calculation.js'



export const calculation = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = null

	this.status

	return true
}//end calculation



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	calculation.prototype.init		= widget_common.prototype.init
	calculation.prototype.build		= widget_common.prototype.build
	calculation.prototype.render	= widget_common.prototype.render
	calculation.prototype.destroy	= widget_common.prototype.destroy
	// render
	calculation.prototype.edit		= render_calculation.prototype.edit
	calculation.prototype.list		= render_calculation.prototype.list
