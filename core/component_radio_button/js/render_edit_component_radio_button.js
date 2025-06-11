// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {view_default_edit_radio_button} from './view_default_edit_radio_button.js'
	import {view_line_edit_radio_button} from './view_line_edit_radio_button.js'
	import {view_rating_edit_radio_button} from './view_rating_edit_radio_button.js'



/**
* RENDER_EDIT_COMPONENT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const render_edit_component_radio_button = function() {

	return true
}//end render_edit_component_radio_button



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return HTMLElement|null
*/
render_edit_component_radio_button.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_radio_button.render(self, options)

		case 'rating':
			return view_rating_edit_radio_button.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_radio_button.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length
		const value				= data.value || []
		const permissions		= self.permissions

	// content_data
		const content_data = ui.component.build_content_data(self)

	// permissions switch
		if (permissions===1) {

			// filtered_datalist. Datalist values that exists into component value
				for (let i = 0; i < value.length; i++) {
					const data_value = value[i]
					const current_datalist_item	= datalist.find(el =>
						el.value &&
						el.value.section_id==data_value.section_id &&
						el.value.section_tipo===data_value.section_tipo
					)
					if(current_datalist_item){
						const current_value = current_datalist_item.label || ''
						// build options
						const content_value_node = get_content_value_read(0, current_value, self)
						content_data.appendChild(content_value_node)
						// set the pointer
						content_data[i] = content_value_node
					}
				}

			// fill empty value cases with one empty content_value node
				if(!content_data[0]) {
					const current_value = '';
					const content_value_node = get_content_value_read(0, current_value, self)
					content_data.appendChild(content_value_node)
					// set the pointer
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


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Note that param 'i' is key from datalist, not from component value
* @param int i
* 	datalist key
* @param object datalist_item
* @param object self
*
* @return HTMLElement content_value
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})
		// mousedown_handler. On user mousedown, reset value
		const mousedown_handler = function(e) {
			if (e.altKey===true) {
				e.stopPropagation()
				e.preventDefault()

				if (self.data.value.length===0) {
					return true
				}
				// remove checked state
				input.checked = false

				const changed_data = [Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					label			: self.get_checked_value_label(),
					refresh			: false,
					remove_dialog	: ()=>{
						return true
					}
				})
			}
		}
		content_value.addEventListener('mousedown', mousedown_handler)

	// label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id
		})
		input_label.prepend(input)
		// change handler
		const change_handler = function() {

			const changed_data = [Object.freeze({
				action	: 'update',
				key		: 0,
				value	: datalist_value
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

			// update label checked status
			update_status(this)
		}
		input.addEventListener('change', change_handler)
		// focus event
		const focus_handler = () => {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		}
		input.addEventListener('focus', focus_handler)
		// permissions. Set disabled on low permissions
		if (self.permissions<2) {
			input.disabled = 'disabled'
		}

	// update status checked input set on match
		function update_status(input) {
			for (let j = 0; j < value_length; j++) {
				if (value[j] && datalist_value &&
					value[j].section_id===datalist_value.section_id &&
					value[j].section_tipo===datalist_value.section_tipo
					) {
						input.checked = 'checked'
						input_label.classList.add('checked')
				}
				else{
					input_label.classList.remove('checked')
				}
			}
		}
		// initial status checked input set on match
		update_status(input)


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
* @param int i
* 	data.value array key
* @param string current_value
* 	label from datalist item that match current data value
* @param object self
*
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: current_value
		})

	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// document fragment
		const fragment = new DocumentFragment()

	// button_list (go to target section)
		if(show_interface.button_list === true){

			const target_sections			= self.context.target_sections || []
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				// button edit
					const label = (SHOW_DEBUG===true)
						? `${item.label} [${item.tipo}]`
						: item.label
					const button_list = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button pen',
						title			: label,
						parent			: fragment
					})
					button_list.addEventListener('mousedown', function(e){
						e.stopPropagation()

						// open a new window
							const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
								tipo	: item.tipo,
								mode	: 'list',
								menu	: false
							})
							open_window({
								url		: url,
								name	: 'section_view',
								on_blur : () => {
									// refresh current instance
									self.refresh({
										build_autoload : true
									})
								}
							})
					})
			}//end for (let i = 0; i < target_sections_length; i++)
		}

	// button reset
		if(show_interface.button_delete === true){

			const reset_button = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button reset',
				title_label		: get_label.reset || 'Reset',
				parent			: fragment
			})
			reset_button.addEventListener('click', function(e) {
				e.stopPropagation()

				// force possible input change before remove
				document.activeElement.blur()

				if (self.data.value.length===0) {
					return true
				}

				const changed_data = [Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					label			: self.get_checked_value_label(),//'All',
					refresh			: true
				})
			})
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
