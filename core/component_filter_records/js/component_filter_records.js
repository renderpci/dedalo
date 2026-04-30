// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
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
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen changed_data_item object from input value and tipo.
* Used by change_handler across edit and search views.
* @param string tipo - Section tipo from datalist
* @param object|null value - Processed value {tipo, value} or null for remove
* @param array entries - Current data entries to resolve id from
* @return object {changed_data_item, action}
*/
export const build_changed_data_item = function(tipo, value, entries) {

	const action = (value===null) ? 'remove' : 'update'

	// find entry id by tipo
		const current_entries	= entries || []
		const entries_length	= current_entries.length
		let entry_id			= null
		for (let i = 0; i < entries_length; i++) {
			if (current_entries[i].tipo===tipo) {
				entry_id = current_entries[i].id
				break
			}
		}

	const changed_data_item = Object.freeze({
		action	: action,
		id		: entry_id,
		value	: value
	})

	return {
		changed_data_item	: changed_data_item,
		action				: action
	}
}//end build_changed_data_item



/**
* CHANGE_HANDLER
* Manages the change event actions across edit and search views.
* Uses build_changed_data_item to construct the changed data uniformly.
* @param object options
*	{value: string, tipo: string, input_node: HTMLElement|null}
* @return bool|promise
*/
component_filter_records.prototype.change_handler = async function(options) {

	const self = this

	// options
		const raw_value		= options.value		// raw string from input
		const tipo			= options.tipo
		const input_node	= options.input_node || null

	// process value based on mode
		const value = (raw_value.length>0)
			? {
				tipo	: tipo,
				value	: self.mode==='search'
					? raw_value.split(',')
					: self.validate_value(raw_value.split(','))
			  }
			: null

	// build changed_data_item using shared function
		const {changed_data_item} = build_changed_data_item(
			tipo,
			value,
			self.data.entries || []
		)

	if (self.mode==='search') {

		// update the instance data (previous to save)
			self.update_data_value(changed_data_item)

		// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

	}else{

		// change data array
			const changed_data = [changed_data_item]

		// force to save on every change
			await self.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

		// update safe value in input text
			if (value && input_node) {
				input_node.value = value.value.join(',')
			}
	}

	return true
}//end change_handler



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



// @license-end
