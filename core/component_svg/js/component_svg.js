/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_svg} from '../../component_svg/js/render_component_svg.js'



export const component_svg = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node


	return true
}//end component_svg



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_svg.prototype.init 	 		= component_common.prototype.init
	component_svg.prototype.build 	 		= component_common.prototype.build
	component_svg.prototype.destroy 	 	= common.prototype.destroy
	component_svg.prototype.save 	 		= component_common.prototype.save
	component_svg.prototype.load_data 		= component_common.prototype.load_data
	component_svg.prototype.load_datum 		= component_common.prototype.load_datum
	component_svg.prototype.get_value 		= component_common.prototype.get_value
	component_svg.prototype.set_value 		= component_common.prototype.set_value

	// render
	component_svg.prototype.render 			= common.prototype.render
	component_svg.prototype.list 			= render_component_svg.prototype.list
	component_svg.prototype.edit 			= render_component_svg.prototype.edit


