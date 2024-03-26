// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {view_default_edit_check_box} from './view_default_edit_check_box.js'
	import {view_tools_edit_check_box} from './view_tools_edit_check_box.js'
	import {view_line_edit_check_box} from './view_line_edit_check_box.js'
	// import {render_view_mini} from './render_view_mini.js'



/**
* RENDER_EDIT_COMPONENT_CHECK_BOX
* Manage the components logic and appearance in client side
*/
export const render_edit_component_check_box = function() {

	return true
}//end render_edit_component_check_box



/**
* EDIT
* Chose the view render module to generate DOM nodes
* @param object options
* @return HTMLElement wrapper|null
*/
render_edit_component_check_box.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		// case 'mini':
			// return render_view_mini.render(self, options)

		case 'tools':
			return view_tools_edit_check_box.render(self, options)

		case 'line':
			return view_line_edit_check_box.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'default':
		default:
			return view_default_edit_check_box.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param instance self
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
						// set pointers
						content_data[i] = content_value_node
					}
				}

			// fill empty value cases with one empty content_value node
				if(!content_data[0]) {
					const current_value = '';
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


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Render a input element based on passed value
* @param int i
* 	data.value array key
* @param object current_value
* @param object self
*
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_item		= current_value
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label
		const section_id		= datalist_item.section_id

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		// const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input_checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		option_label.prepend(input_checkbox)
		input_checkbox.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input_checkbox.addEventListener('change', function(e){

			// add style modified to wrapper node
				// if (!self.node.classList.contains('modified')) {
				// 	self.node.classList.add('modified')
				// }

			// DES
				// const action		= (input_checkbox.checked===true) ? 'insert' : 'remove'
				// const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
				// const changed_value	= (action==='insert') ? datalist_value : null

				// const changed_data = [Object.freeze({
				// 	action	: action,
				// 	key		: changed_key,
				// 	value	: changed_value
				// })]
				// // force to save on every change
				// 	self.change_value({
				// 		changed_data	: changed_data,
				// 		refresh			: false,
				// 		remove_dialog	: ()=>{
				// 			return true
				// 		}
				// 	})
				// 	.then(()=>{
				// 		self.selected_key = i
				// 	})

			self.change_handler({
				self			: self,
				e				: e,
				i				: i,
				datalist_value	: datalist_value,
				input_checkbox	: input_checkbox
			})
		})//end change event
		input_checkbox.addEventListener('click', function(e) {
			e.stopPropagation()
		})

		// checked option set on match
			for (let j = 0; j < value_length; j++) {
				if (value[j] && datalist_value &&
					value[j].section_id===datalist_value.section_id &&
					value[j].section_tipo===datalist_value.section_tipo
					) {
						input_checkbox.checked = 'checked'
				}
			}

	// developer_info
		if(SHOW_DEBUG){
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'developer_info show_on_active',
				text_content	: `[${section_id}]`,
				parent			: content_value
			})
		}


	// button_edit
		// const button_edit = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button edit show_on_active',
		// 	parent			: content_value
		// })
		// button_edit.addEventListener("click", function(e){
		// 	e.stopPropagation()
		// 	try {
		// 		// target_section
		// 			const sqo = self.context.request_config.find(el => el.api_engine==='dedalo').sqo //.sqo.section_tipo
		// 			const target_section_tipo = sqo.section_tipo[0].tipo
		// 			console.log("+++ sqo:",sqo);
		// 		// navigation
		// 			const user_navigation_options = {
		// 				source		: {
		// 					action			: 'search',
		// 					model			: 'section',
		// 					tipo			: target_section_tipo,
		// 					section_tipo	: target_section_tipo,
		// 					mode			: 'edit',
		// 					lang			: self.lang
		// 				},
		// 				sqo : {
		// 					section_tipo		: [{tipo : target_section_tipo}],
		// 					filter				: null,
		// 					limit				: 1,
		// 					filter_by_locators	: [{
		// 						section_tipo	: target_section_tipo,
		// 						section_id		: section_id
		// 					}]
		// 				}
		// 			}
		// 		event_manager.publish('user_navigation', user_navigation_options)
		// 	} catch (error) {
		// 		console.error(error)
		// 	}
		// })


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

	// fragment
		const fragment = new DocumentFragment()

	// button_list (go to target section)
		if(show_interface.button_list === true){

			const target_sections			= self.context.target_sections
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
					})//end click event
			}//end for (let i = 0; i < target_sections_length; i++)
		}

	// button reset (delete) remove all values
		if(show_interface.button_delete === true){

			const button_reset = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button reset',
				title			: get_label.reset || 'Reset',
				parent			: fragment
			})
			button_reset.addEventListener('click', function(e) {
				e.stopPropagation()

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
					label			: 'All',
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

