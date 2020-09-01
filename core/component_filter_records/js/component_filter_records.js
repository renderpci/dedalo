/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_filter_records} from '../../component_filter_records/js/render_component_filter_records.js'



export const component_filter_records = function(){

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

	return true
};//end component_filter_records




/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_filter_records.prototype.init					= component_common.prototype.init
	component_filter_records.prototype.build				= component_common.prototype.build
	component_filter_records.prototype.render				= common.prototype.render
	component_filter_records.prototype.destroy				= common.prototype.destroy
	component_filter_records.prototype.refresh				= common.prototype.refresh
	component_filter_records.prototype.save					= component_common.prototype.save
	component_filter_records.prototype.load_data			= component_common.prototype.load_data
	component_filter_records.prototype.get_value			= component_common.prototype.get_value
	component_filter_records.prototype.set_value			= component_common.prototype.set_value
	component_filter_records.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter_records.prototype.update_datum			= component_common.prototype.update_datum
	component_filter_records.prototype.change_value			= component_common.prototype.change_value
	component_filter_records.prototype.build_dd_request		= common.prototype.build_dd_request

	// render
	component_filter_records.prototype.mini					= render_component_filter_records.prototype.mini
	component_filter_records.prototype.list					= render_component_filter_records.prototype.list
	component_filter_records.prototype.edit					= render_component_filter_records.prototype.edit
	component_filter_records.prototype.edit_in_list			= render_component_filter_records.prototype.edit
	component_filter_records.prototype.search				= render_component_filter_records.prototype.search
	component_filter_records.prototype.change_mode			= component_common.prototype.change_mode
