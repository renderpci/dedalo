/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_select_lang} from '../../component_select_lang/js/render_component_select_lang.js'



export const component_select_lang = function(){

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
	//this.datum

	return true
}//end component_select_lang



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_select_lang.prototype.init 	 			= component_common.prototype.init
	component_select_lang.prototype.build 	 			= component_common.prototype.build
	component_select_lang.prototype.render 				= common.prototype.render
	component_select_lang.prototype.destroy 	 		= common.prototype.destroy
	component_select_lang.prototype.refresh 			= common.prototype.refresh
	component_select_lang.prototype.save 	 			= component_common.prototype.save
	component_select_lang.prototype.load_data 			= component_common.prototype.load_data
	component_select_lang.prototype.get_value 			= component_common.prototype.get_value
	component_select_lang.prototype.set_value 			= component_common.prototype.set_value
	component_select_lang.prototype.update_data_value 	= component_common.prototype.update_data_value
	component_select_lang.prototype.update_datum		= component_common.prototype.update_datum
	component_select_lang.prototype.change_value 		= component_common.prototype.change_value
	//component_select_lang.prototype.load_datum 		= component_common.prototype.load_datum

	// render
	component_select_lang.prototype.list 				= render_component_select_lang.prototype.list
	component_select_lang.prototype.edit 				= render_component_select_lang.prototype.edit
	component_select_lang.prototype.edit_in_list		= render_component_select_lang.prototype.edit
	component_select_lang.prototype.change_mode 		= component_common.prototype.change_mode
