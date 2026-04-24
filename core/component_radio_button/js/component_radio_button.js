// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_radio_button} from './render_edit_component_radio_button.js'
	import {render_list_component_radio_button} from './render_list_component_radio_button.js'
	import {render_search_component_radio_button} from './render_search_component_radio_button.js'
	import {clone} from '../../common/js/utils/index.js'



export const component_radio_button = function(){

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

	// ui
	this.minimum_width_px = 90 // integer pixels
}//end component_radio_button



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_radio_button.prototype.init				= component_common.prototype.init
	component_radio_button.prototype.build				= component_common.prototype.build
	component_radio_button.prototype.render				= common.prototype.render
	component_radio_button.prototype.refresh			= common.prototype.refresh
	component_radio_button.prototype.destroy			= common.prototype.destroy

	// change data
	component_radio_button.prototype.save				= component_common.prototype.save
	component_radio_button.prototype.update_data_value	= component_common.prototype.update_data_value
	component_radio_button.prototype.update_datum		= component_common.prototype.update_datum
	component_radio_button.prototype.change_value		= component_common.prototype.change_value
	component_radio_button.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_radio_button.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_radio_button.prototype.list				= render_list_component_radio_button.prototype.list
	component_radio_button.prototype.tm					= render_list_component_radio_button.prototype.list
	component_radio_button.prototype.edit				= render_edit_component_radio_button.prototype.edit
	component_radio_button.prototype.search				= render_search_component_radio_button.prototype.search

	component_radio_button.prototype.change_mode		= component_common.prototype.change_mode



/**
* GET_CHECKED_VALUE_LABEL
* @return string label
*/
component_radio_button.prototype.get_checked_value_label = function() {

	const self = this

	if (!self.data.entries || typeof self.data.entries[0]==='undefined' || self.data.entries[0]===null) {
		return ''
	}

	const checked_key = self.data.datalist.findIndex( (item) => {
		return (item.section_id===self.data.entries[0]?.section_id)
	})

	const label = self.data.datalist[checked_key].label

	return label
}//end get_checked_value_label



/**
* FOCUS_FIRST_INPUT
* Captures ui.component.activate calls
* to prevent default behavior
* @return bool
*/
component_radio_button.prototype.focus_first_input = function() {

	return true
}//end focus_first_input



/**
* BUILD_CHANGED_DATA_ITEM
* Clones the datalist value, adds the entry id to it, and builds a frozen changed_data_item object.
* Used by edit views (via handle_radio_change) and search view (directly).
* @param object|null datalist_value
* 	Locator value from datalist
* @param int|null id
* 	Entry id from data
* @return object {changed_data_item, value}
*/
export const build_changed_data_item = function(datalist_value, id=null) {

	// clone datalist_value to avoid mutating the original
	// and add id to the value if available
	const parsed_value = (datalist_value != null)
		? { ...clone(datalist_value), ...(id ? { id: id } : {}) }
		: null

	// build changed_data_item
	const changed_data_item = Object.freeze({
		action	: (parsed_value != null) ? 'update' : 'remove',
		id		: id,
		value	: parsed_value
	})

	return {
		changed_data_item	: changed_data_item,
		parsed_value		: parsed_value
	}
}//end build_changed_data_item



/**
* HANDLE_RADIO_CHANGE
* Common change handler for component_radio_button across all edit views.
* Resolves id dynamically from self.data (not from stale closure),
* builds changed_data_item, sets changed_data, and saves via change_value.
* @param object self - Component instance
* @param object|null datalist_value - The locator value from datalist
* @param int|null id - Entry id from data
* @return object|null value - The value with id preserved, or null
*/
export const handle_radio_change = async function(self, datalist_value, id=null) {

	// resolve id from current data if not provided
	// (when component was initially empty, the closure id is null,
	// but after first save the entry gets an id from the API)
	if (id === null) {
		id = self.data.entries?.[0]?.id ?? null
	}

	// build changed_data_item (clone value + add id + freeze)
	const {changed_data_item, parsed_value} = build_changed_data_item(datalist_value, id)

	// fix instance changed_data
	self.set_changed_data(changed_data_item)

	// force to save on every change
	await self.change_value({
		changed_data	: [changed_data_item],
		refresh			: false,
		remove_dialog	: false
	})

	return parsed_value
}//end handle_radio_change



// @license-end
