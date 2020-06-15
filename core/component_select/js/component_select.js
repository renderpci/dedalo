/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_select} from '../../component_select/js/render_component_select.js'



export const component_select = function(){

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

	this.tools

	this.datum

	return true
}//end component_select



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_select.prototype.init					= component_common.prototype.init
	component_select.prototype.build				= component_common.prototype.build
	component_select.prototype.render				= common.prototype.render
	component_select.prototype.refresh				= common.prototype.refresh
	component_select.prototype.destroy				= common.prototype.destroy

	// change data
	component_select.prototype.save					= component_common.prototype.save
	component_select.prototype.update_data_value	= component_common.prototype.update_data_value
	component_select.prototype.update_datum			= component_common.prototype.update_datum
	component_select.prototype.change_value			= component_common.prototype.change_value
	component_select.prototype.build_dd_request		= common.prototype.build_dd_request
	// component_select.prototype.load_data			= component_common.prototype.load_data
	// component_select.prototype.get_value			= component_common.prototype.get_value
	// component_select.prototype.set_value			= component_common.prototype.set_value
	//component_select.prototype.load_datum			= component_common.prototype.load_datum

	// render
	component_select.prototype.list					= render_component_select.prototype.list
	component_select.prototype.edit					= render_component_select.prototype.edit
	component_select.prototype.edit_in_list			= render_component_select.prototype.edit
	component_select.prototype.tm					= render_component_select.prototype.edit
	component_select.prototype.search				= render_component_select.prototype.search
	component_select.prototype.change_mode			= component_common.prototype.change_mode


