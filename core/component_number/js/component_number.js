/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_number} from '../../component_number/js/render_edit_component_number.js'
	import {render_list_component_number} from '../../component_number/js/render_list_component_number.js'
	import {render_mini_component_number} from '../../component_number/js/render_mini_component_number.js'
	import {render_search_component_number} from '../../component_number/js/render_search_component_number.js'



export const component_number = function(){

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
};//end component_number



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_number.prototype.init					= component_common.prototype.init
	component_number.prototype.build				= component_common.prototype.build
	component_number.prototype.render				= common.prototype.render
	component_number.prototype.refresh				= common.prototype.refresh
	component_number.prototype.destroy				= common.prototype.destroy

	// change data
	component_number.prototype.save					= component_common.prototype.save
	component_number.prototype.update_data_value	= component_common.prototype.update_data_value
	component_number.prototype.update_datum			= component_common.prototype.update_datum
	component_number.prototype.change_value			= component_common.prototype.change_value
	component_number.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_number.prototype.mini					= render_mini_component_number.prototype.mini
	component_number.prototype.list					= render_list_component_number.prototype.list
	component_number.prototype.edit					= render_edit_component_number.prototype.edit
	component_number.prototype.edit_in_list			= render_edit_component_number.prototype.edit
	component_number.prototype.search				= render_search_component_number.prototype.search
	component_number.prototype.change_mode			= component_common.prototype.change_mode



/**
* FIX_NUMBER_FORMAT
* Force unified number format.
* Example: Change 17,2 to 17.2
* @return
*/
component_number.prototype.fix_number_format = function( number ) {

	const new_number = number.replace(/,/g, ".");

	return Number(new_number)
};//end fix_number_format


