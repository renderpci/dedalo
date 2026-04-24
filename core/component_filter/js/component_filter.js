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
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen changed_data_item object from checkbox state and datalist value.
* Used by change_handler (edit) and search view change handler.
* @param bool checked - Current checked state of the checkbox
* @param object datalist_value - Locator from datalist {section_id, section_tipo}
* @param array entries - Current data entries to resolve id from
* @return object {changed_data_item, action}
*/
export const build_changed_data_item = function(checked, datalist_value, entries) {

	const action		= (checked===true) ? 'insert' : 'remove'
	const locator		= entries.find(item => {
		return (item.section_id==datalist_value.section_id &&
				item.section_tipo===datalist_value.section_tipo)
	})
	const changed_value	= (action==='insert') ? datalist_value : null

	const changed_data_item = Object.freeze({
		action	: action,
		id		: locator?.id || null,
		value	: changed_value
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
*	{checked: bool, datalist_value: object}
* @return bool
*/
component_filter.prototype.change_handler = async function(options) {

	const self = this

	// options
		const checked			= options.checked
		const datalist_value	= options.datalist_value

	// build changed_data_item using shared function
		const {changed_data_item} = build_changed_data_item(
			checked,
			datalist_value,
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
