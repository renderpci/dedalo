// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {array_equals} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_EDIT_FILTER_RECORDS
* Manage the components logic and appearance in client side
*/
export const view_default_edit_filter_records = function() {

	return true
}//end view_default_edit_filter_records



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_filter_records.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null


	// ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // remove label
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length
		const value				= data.value || []
		const permissions		= self.permissions

	// content_data
		const content_data = ui.component.build_content_data(self)

	// header_row
		const header_row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header_row',
			parent			: content_data
		})
		// header_tipo
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label_item tipo',
			inner_html		: 'tipo',
			parent			: header_row
		})
		// header_label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label_item label',
			inner_html		: get_label.section || 'Section',
			parent			: header_row
		})
		// header_value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label_item value',
			inner_html		: get_label.value || 'Value',
			parent			: header_row
		})

	// body rows
	// permissions switch
		if (permissions===1) {

			// filtered_datalist. Datalist values that exists into component value
				for (let i = 0; i < value.length; i++) {
					const data_value = value[i]
					const current_datalist_item	= datalist.find(el =>
						el.tipo===data_value.tipo
					)
					if(current_datalist_item){
						const current_value = {
							label	: current_datalist_item.label,
							tipo	: data_value.tipo,
							value	: data_value.value
						}
						// build options
						const content_value_node = get_content_value_read(0, current_value, self)
						content_data.appendChild(content_value_node)
						// set pointers
						content_data[i] = content_value_node
					}
				}

			// fill empty value cases with one empty content_value node
				if(!content_data[0]) {
					const current_value = {}
					const content_value_node = get_content_value_read(0, current_value, self)
					content_data.appendChild(content_value_node)
					// set pointers
					content_data[0] = content_value_node
				}

		}else{

			// build options
				for (let i = 0; i < datalist_length; i++) {
					const input_element_node = get_content_value(i, datalist[i], self)
					content_data.appendChild(input_element_node)
					// set pointers
					content_data[i] = input_element_node
				}
		}


	// realocate rendered DOM items
			// const nodes_lenght = inputs_container.childNodes.length
			// // iterate in reverse order to avoid problems on move nodes
			// for (let i = nodes_lenght - 1; i >= 0; i--) {

			// 	const item = inputs_container.childNodes[i]
			// 	if (item.dataset.parent) {
			// 		//const parent_id = datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id
			// 		const current_parent = inputs_container.querySelector("[data-id='"+item.dataset.parent+"']")
			// 		if (current_parent) {
			// 			current_parent.appendChild(item)
			// 		}
			// 	}
			// }


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value array current key
* @param object datalist_item
* {
* 	label		: "label",
* 	tipo		: "rsc23",
*	permissions	: 2
* }
* @return HTMLElement li
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// tipo
		const tipo	= datalist_item.tipo
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_item section_tipo',
			inner_html		: tipo,
			parent			: content_value
		})

	// label
		const label	= datalist_item.label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_item',
			inner_html		: label,
			parent			: content_value
		})

	// input field
		const item					= value.find(item => item.tipo===tipo)
		const input_value_string	= typeof item!=="undefined" ? item.value.join(',') : ''
		const input_node			= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'body_item input_value',
			value			: input_value_string,
			placeholder		: 'Comma separated id like 1,2,3',
			parent			: content_value
		})
		// change event
			input_node.addEventListener('change', function() {

				const section_tipo	= datalist_item.tipo
				const value			= this.value.length>0
					? {
						tipo 	: datalist_item.tipo,
						value 	: self.validate_value(this.value.split(','))
					  }
					: null;

				// key_found. search section tipo key if exists. Remember: data array keys are different that inputs keys
					const current_values	= self.data.value || []
					const values_length		= current_values.length
					let key_found			= values_length // default is last (length of array)
					for (let j = 0; j < values_length; j++) {
						if(current_values[j].tipo===section_tipo) {
							key_found = j;
							break;
						}
					}

				// change_value
					const changed_data = [Object.freeze({
						action	: (value===null) ? 'remove' : 'update',
						key		: key_found,
						value	: value
					})]
					self.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
					.then(()=>{
						// update safe value in input text
						if (value) {
							input_node.value = value.value.join(",")
						}
					})
			})//end change
		// keyup event
			input_node.addEventListener('keyup', function(e) {
				// page unload event
					// if (e.key!=='Enter') {
					// 	const value_key			= value.findIndex(el => el.tipo===datalist_item.tipo);
					// 	const original_value	= self.db_data.value[value_key]
					// 	const new_value			= this.value.length>0
					// 		? {
					// 			tipo 	: datalist_item.tipo,
					// 			value 	: self.validate_value(this.value.split(','))
					// 		  }
					// 		: null;

					// 	const is_equal = original_value && original_value.value && new_value && new_value.value
					// 		? array_equals(original_value.value, new_value.value)
					// 		: false
					// 	// set_before_unload (bool)
					// 	set_before_unload(!is_equal)
					// }

				// Enter key force to dispatchEvent change
					if (e.key==='Enter') {
						input_node.dispatchEvent(new Event('change'))
						return false
					}

				// set as changed to prevent accidentally loose unsaved data
				// Note that because this component have a validator, only change event will be used to save values
					set_before_unload(true)
			})//end keyup


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
* @param int i
* 	data.value array key
* @param object current_value
* @param object self
*
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// tipo
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: current_value.tipo || '',
			parent			: content_value
		})

	// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: current_value.label || '',
			parent			: content_value
		})

	// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: current_value.value || '',
			parent			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			})
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
