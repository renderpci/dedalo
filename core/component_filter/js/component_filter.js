// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_filter} from '../../component_filter/js/render_edit_component_filter.js'
	import {render_list_component_filter} from '../../component_filter/js/render_list_component_filter.js'
	import {render_search_component_filter} from '../../component_filter/js/render_search_component_filter.js'



export const component_filter = function(){

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

	// ui
	this.minimum_width_px = 250 // integer pixels
}//end component_filter



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_filter.prototype.init					= component_common.prototype.init
	component_filter.prototype.build				= component_common.prototype.build
	component_filter.prototype.render				= common.prototype.render
	component_filter.prototype.destroy				= common.prototype.destroy
	component_filter.prototype.refresh				= common.prototype.refresh
	component_filter.prototype.save					= component_common.prototype.save
	component_filter.prototype.load_data			= component_common.prototype.load_data
	component_filter.prototype.get_value			= component_common.prototype.get_value
	component_filter.prototype.set_value			= component_common.prototype.set_value
	component_filter.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter.prototype.update_datum			= component_common.prototype.update_datum
	component_filter.prototype.change_value			= component_common.prototype.change_value
	component_filter.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_filter.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_filter.prototype.list					= render_list_component_filter.prototype.list
	component_filter.prototype.tm					= render_list_component_filter.prototype.list
	component_filter.prototype.edit					= render_edit_component_filter.prototype.edit
	component_filter.prototype.search				= render_search_component_filter.prototype.search

	component_filter.prototype.change_mode			= component_common.prototype.change_mode



/**
* GET_CHANGED_KEY
* @param string action
* 	sample: insert
* @param object value
* 	sample: {section_tipo: 'dd153', section_id: '6'}
*/
component_filter.prototype.get_changed_key = function(action, value) {

	const self = this

	if (action==='insert') {
		// insert value

		// check if value already exists
		const ar_found = self.data.value.filter(item => item.section_id===value.section_id && item.section_tipo===value.section_tipo)
		if (ar_found.length>0) {
			console.warn("Ignored to add value because already exists:", value);
			return false
		}

		// component common add value and save (without refresh)
			return self.data.value.length || 0

	}else{
		// remove value

		const value_key = self.data.value.findIndex( (item) => {
			return (item.section_id===value.section_id && item.section_tipo===value.section_tipo)
		})
		if (value_key===-1) {
			console.warn("Error. item not found in values:", value);
			return false
		}

		return value_key
	}

	return false
}//end get_changed_key



/**
* CHANGE_HANDLER
* Manages the change event actions
* @param event e
* @param int key
* @param object self
* @return bool
*/
component_filter.prototype.change_handler = async function(options) {

	const self = this

	// options
		const datalist_value	= options.datalist_value
		const action			= options.action

	// change data vars
		// changed key. Find the data.value key (could be different of datalist key)
		const changed_key = self.get_changed_key(
			action,
			datalist_value,
			self.data.value
		)
		const changed_value	= (action==='insert') ? datalist_value : null

	// changed_data_item
		const changed_data_item = Object.freeze({
			action	: action,
			key		: changed_key,
			value	: changed_value
		})

	if (self.mode==='search') {

		// update the instance data (previous to save)
			self.update_data_value(changed_data_item)
		// set data.changed_data. The change_data to the instance
			// self.data.changed_data = changed_data
		// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

	}else{

		// change data array
			const changed_data = [changed_data_item]

		// fix instance changed_data
			self.data.changed_data = changed_data

		// force to save on every change. Needed to recalculate the value keys
			await self.change_value({
				changed_data	: changed_data,
				refresh			: false,
				remove_dialog	: ()=>{
					return true
				}
			})
	}


	return true
}//end change_handler


// @license-end

