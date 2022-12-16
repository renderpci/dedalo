/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_filter_records} from '../../component_filter_records/js/render_edit_component_filter_records.js'
	import {render_list_component_filter_records} from '../../component_filter_records/js/render_list_component_filter_records.js'
	import {render_search_component_filter_records} from '../../component_filter_records/js/render_search_component_filter_records.js'



export const component_filter_records = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	return true
}//end component_filter_records



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
	component_filter_records.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_filter_records.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_filter_records.prototype.list					= render_list_component_filter_records.prototype.list
	component_filter_records.prototype.tm					= render_list_component_filter_records.prototype.list
	component_filter_records.prototype.edit					= render_edit_component_filter_records.prototype.edit
	component_filter_records.prototype.search				= render_search_component_filter_records.prototype.search

	component_filter_records.prototype.change_mode			= component_common.prototype.change_mode



/**
* VALIDATE_VALUE
* @param array value
*	Like [1,5,8]
*/
component_filter_records.prototype.validate_value = (value) => {

	const safe_values  = []

	if (value && value.length>0) {

		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			const current_number = parseInt(value[i])
			// if value is valid number and not already included, push it to safe values array
			if (!isNaN(current_number) && current_number>0 && !safe_values.includes(current_number)) {
				safe_values.push(current_number)
			}
		}
	}

	return safe_values
}//end validate_value
