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
		const value			= current_data.value || []
		if (value.length>0) {
			// remove previous value
			const source = create_source(self, null)
			const data = clone(self.data)
			data.changed_data = [{
				action	: 'remove',
				key		: false,
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
			key		: null,
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



// @license-end
