// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common, create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {render_edit_component_select} from './render_edit_component_select.js'
	import {render_list_component_select} from './render_list_component_select.js'
	import {render_search_component_select} from './render_search_component_select.js'



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

	// ui
	this.minimum_width_px = 120 // integer pixels
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
	component_select.prototype.set_changed_data		= component_common.prototype.set_changed_data
	// component_select.prototype.build_rqo			= common.prototype.build_rqo
	// component_select.prototype.build_rqo_show	= common.prototype.build_rqo_show

	// render
	component_select.prototype.list					= render_list_component_select.prototype.list
	component_select.prototype.tm					= render_list_component_select.prototype.list
	component_select.prototype.edit					= render_edit_component_select.prototype.edit
	component_select.prototype.search				= render_search_component_select.prototype.search

	component_select.prototype.change_mode			= component_common.prototype.change_mode



/**
* ADD_NEW_ELEMENT
* Called from button add
* Create an new record in the target section and add the result locator as value to current component
* (Set default project too based on current user privileges and assigned projects)
* @verified 07-09-2023 Paco
* @param string target_section_tipo
* 	Like: rsc197
* @return bool
*/
component_select.prototype.add_new_element = async function(target_section_tipo) {

	const self = this

	// check current value. LImit to one
		const current_data	= self.data || {}
		const entries		= current_data.entries || []
		if (entries.length>0) {
			// remove previous value
			const source = create_source(self, null)
			const data = clone(self.data)
			data.changed_data = [{
				action	: 'remove',
				id		: null,
				value	: null
			}]
			const rqo = {
				action	: 'save',
				source	: source,
				data	: data
			}
			// data_manager. create new record
				const api_response = await data_manager.request({
					body : rqo
				})
				if(SHOW_DEBUG===true) {
					console.log('add_new_element remove previous api_response:', api_response);
				}
				if (api_response.response===false) {
					console.error('Error removing previous value. api_response:', api_response);
					alert("Error on remove previous value");
					return false;
				}
		}

	// source
		const source = create_source(self, null)

	// data
		const data = clone(self.data)
		data.changed_data = [{
			action	: 'add_new_element',
			id		: null,
			value	: target_section_tipo
		}]

	// rqo
		const rqo = {
			action	: 'save',
			source	: source,
			data	: data
		}

	// data_manager. create new record
		const api_response = await data_manager.request({
			body : rqo
		})
		if(SHOW_DEBUG===true) {
			console.log('add_new_element api_response:', api_response);
		}
		// add value to current data
		if (api_response.result) {

			// save return the datum of the component
			// to refresh the component, inject this api_response to use as "read" api_response
			// the build process will use it and does not re-call to API.
				await self.refresh({
					destroy				: false,
					build_autoload		: true,
					tmp_api_response	: api_response
				})

		}else{
			console.error('Error on api_response on try to create new row:', api_response);
			return false
		}


	return true
}//end add_new_element



/**
* BUILD_CHANGED_DATA_ITEM
* Parses the select value and builds a frozen changed_data_item object.
* Used by edit views (via handle_select_change) and search view (directly).
* @param HTMLSelectElement select
* @param int|null id
* @return object {changed_data_item, parsed_value}
*/
export const build_changed_data_item = function(select, id=null) {

	// parse select value from JSON string to object locator
	const parsed_value = (select.value.length > 0)
		? JSON.parse(select.value)
		: null

	// add id to parsed_value if available
	if (parsed_value && id) {
		parsed_value.id = id
	}

	// build changed_data_item
	const changed_data_item = Object.freeze({
		action	: (parsed_value != null) ? 'update' : 'remove',
		id		: id,
		value	: parsed_value // object locator or null expected
	})

	return {
		changed_data_item	: changed_data_item,
		parsed_value		: parsed_value
	}
}//end build_changed_data_item



/**
* HANDLE_SELECT_CHANGE
* Common change handler for component_select across all edit views.
* Parses the select value, builds changed_data_item, sets changed_data,
* and saves via change_value. Returns parsed_value for view-specific hooks.
* @param object self - Component instance
* @param HTMLSelectElement select - The select DOM element
* @param int|null id - Entry id from data
* @return object|null parsed_value - The parsed locator or null
*/
export const handle_select_change = async function(self, select, id=null) {

	// resolve id from current data if not provided
	// (when component was initially empty, the closure id is null,
	// but after first save the entry gets an id from the API)
	if (id === null) {
		id = self.data.entries?.[0]?.id ?? null
	}

	// build changed_data_item (parse + freeze)
	const {changed_data_item, parsed_value} = build_changed_data_item(select, id)

	// fix instance changed_data
	self.set_changed_data(changed_data_item)

	// force to save on every change
	await self.change_value({
		changed_data	: [changed_data_item],
		refresh			: false,
		remove_dialog	: false
	})

	return parsed_value
}//end handle_select_change



// @license-end
