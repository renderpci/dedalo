// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_check_box} from '../../component_check_box/js/render_edit_component_check_box.js'
	import {render_list_component_check_box} from '../../component_check_box/js/render_list_component_check_box.js'
	import {render_search_component_check_box} from '../../component_check_box/js/render_search_component_check_box.js'



export const component_check_box = function(){

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
	this.id

	// ui
	this.minimum_width_px = 100 // integer pixels
}//end component_check_box



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_check_box.prototype.init				= component_common.prototype.init
	component_check_box.prototype.build				= component_common.prototype.build
	component_check_box.prototype.render			= common.prototype.render
	component_check_box.prototype.refresh			= common.prototype.refresh
	component_check_box.prototype.destroy			= common.prototype.destroy

	// change data
	component_check_box.prototype.save				= component_common.prototype.save
	component_check_box.prototype.update_data_value	= component_common.prototype.update_data_value
	component_check_box.prototype.update_datum		= component_common.prototype.update_datum
	component_check_box.prototype.change_value		= component_common.prototype.change_value
	component_check_box.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_check_box.prototype.build_rqo_show	= common.prototype.build_rqo_show

	// render
	component_check_box.prototype.list				= render_list_component_check_box.prototype.list
	component_check_box.prototype.tm				= render_list_component_check_box.prototype.list
	component_check_box.prototype.edit				= render_edit_component_check_box.prototype.edit
	component_check_box.prototype.search			= render_search_component_check_box.prototype.search

	component_check_box.prototype.change_mode		= component_common.prototype.change_mode




/**
 * GET_CHANGED_KEY
 * Find the key of the data with the selected value of the datalist
 * The key of datalist has all possible values of the components
 * Key of the data is the active options in data.
 * @param action
 * @param value
 * @param source
 */
component_check_box.prototype.get_changed_key = function(action, value, source=this.data.value) {

	// const self = this

	// source usually is self.data.value
	// source = source || self.data.value

	const changed_key = (() => {

		if (action==='insert') {

			// insert value
			if (source) {

				// check if value already exists
				const ar_found = source.filter(item =>
					item.section_id==value.section_id &&
					item.section_tipo===value.section_tipo
				)
				if (ar_found.length>0) {
					console.warn("Ignored to add value because already exists:", value)
				}

				// component common add value and save (without refresh)
				return source.length || 0
			}

		}else{

			// remove value
			const value_key = source.findIndex(item => {
				return (item.section_id==value.section_id &&
						item.section_tipo===value.section_tipo)
			})
			if (value_key===-1) {
				console.warn("Error. item not found in values:", value)
			}else{
				return value_key
			}
		}

		return 0;
	})()


	return changed_key
}//end get_changed_key



/**
* CHANGE_HANDLER
* Manages the change event actions
* @param object options
* @return bool
*/
component_check_box.prototype.change_handler = async function(options) {

	// options
		const self				= options.self
		const e					= options.e // event
		const i					= options.i // value key
		const datalist_value	= options.datalist_value
		const input_checkbox	= options.input_checkbox

	// prevent event default
		e.preventDefault()

	// change data vars
		const action		= (input_checkbox.checked===true) ? 'insert' : 'remove'
		// changed key. Find the data.value key (could be different of datalist key)
		const changed_key	= self.get_changed_key(
			action,
			datalist_value,
			self.data.value
		)
		const changed_value	= (action==='insert') ? datalist_value : null

	// change data array
		const changed_data = [Object.freeze({
			action	: action,
			key		: changed_key,
			value	: changed_value
		})]

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

	// fix selected_key
		self.selected_key = i


	return true
}//end change_handler



/**
* FOCUS_FIRST_INPUT
* Captures ui.component.activate calls
* to prevent default behavior
* @return bool
*/
component_check_box.prototype.focus_first_input = function() {

	return true
}//end focus_first_input



// @license-end
