// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	} from './render_edit_component_select.js'



/**
* VIEW_LINE_EDIT_SELECT
* Manages the component's logic and appearance in client side
*/
export const view_line_edit_select = function() {

	return true
}//end view_line_edit_select



/**
* RENDER
* Render node for view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_line_edit_select.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self, {
			render_content_data			: get_content_value,
			render_content_value_read	: get_content_value_read
		})
		// content_data.appendChild(button_exit_edit)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value key like 0
* @param object|null current_value
* 	Current locator value as {section_id: '2', section_tipo: 'rsc740'}
* @param object self
* 	Component instance pointer
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		// add empty option at beginning of the datalist array
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// button_exit_edit. Add once
		if (i===0) {
			const button_exit_edit = ui.component.build_button_exit_edit(self)
			content_value.appendChild(button_exit_edit)
		}

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select',
			parent			: content_value
		})
		// focus event
			select.addEventListener('focus', function(){
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
		// change event
			select.addEventListener('change', function(){

				const value = this.value
					? JSON.parse(this.value)
					: null

				const parsed_value	= (select.value.length>0)
					? JSON.parse(select.value)
					: null

				// change data
					const changed_data_item	= Object.freeze({
						action	: (parsed_value != null) ? 'update' : 'remove',
						key		: (parsed_value != null) ? i : false,
						value	: parsed_value
					})

				// fix instance changed_data
					self.set_changed_data(changed_data_item)

				// force to save on every change
					self.change_value({
						changed_data	: [changed_data_item],
						refresh			: false,
						remove_dialog	: false
					})
			})
		// click event
			select.addEventListener('click', function(e){
				e.stopPropagation()
			})

	// select options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			const current_section_id = typeof datalist_item.section_id!=='undefined'
				? datalist_item.section_id
				: null

			const current_label = (SHOW_DEBUG===true)
				? datalist_item.label + (current_section_id ? " [" + current_section_id + "]" : '')
				: datalist_item.label

			const option_node = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_item.value),
				inner_html		: current_label,
				parent			: select
			})
			// selected options set on match
			if (current_value && datalist_item.value &&
				current_value.section_id===datalist_item.value.section_id &&
				current_value.section_tipo===datalist_item.value.section_tipo
				) {
				option_node.selected = true
			}

			// developer_info
				// if (current_section_id) {
				// 	// developer_info
				// 	ui.create_dom_element({
				// 		element_type	: 'span',
				// 		class_name		: 'developer_info hide show_on_active',
				// 		text_content	: ` [${current_section_id}]`,
				// 		parent			: option_node
				// 	})
				// }
		}//end for (let i = 0; i < datalist_length; i++)

	// button_edit. Default is hidden
		if(self.show_interface.button_edit===true) {
			const button_edit = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button edit show_on_active',
				parent			: content_value
			})
			button_edit.addEventListener('click', function(e) {
				e.stopPropagation()

				// short vars
					const target_section_tipo = self.context.target_sections[0].tipo

				// open a new window
					const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
						tipo	: target_section_tipo,
						mode	: 'list',
						menu	: false
					})
					open_window({
						url		: url,
						name	: 'record_view',
						on_blur : () => {
							// refresh current instance
							self.refresh({
								build_autoload : true
							})
						}
					})
			})
			// if (!current_value) {
			// 	button_edit.classList.add('hide')
			// }
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @param int i
* 	Value key like 0
* @param object|null current_value
* 	Current locator value as {section_id: '2', section_tipo: 'rsc740'}
* @param object self
* 	Component instance pointer
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



// @license-end
