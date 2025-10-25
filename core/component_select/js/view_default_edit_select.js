// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'
	import {delete_dataframe} from '../../component_common/js/component_common.js'
	import {
		get_content_data
	} from './render_edit_component_select.js'



/**
* VIEW_DEFAULT_EDIT_SELECT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_select = function() {

	return true
}//end view_default_edit_select



/**
* RENDER
* Render node for view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_select.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self, {
			render_content_data			: get_content_value,
			render_content_value_read	: get_content_value_read
		})
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
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

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select',
			parent			: content_value
		})
		// focus event
			const focus_handler = () => {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			}
			select.addEventListener('focus', focus_handler)
		// click event
			select.addEventListener('click', function(e){
				e.stopPropagation()
			})
		// change event
			const change_handler = async function(e) {

				const value = this.value
					? JSON.parse(this.value)
					: null

				const parsed_value	= (select.value.length>0)
					? JSON.parse(select.value)
					: null

				// when user change the value of the select, remove its dataframe
				if(self.data.value[0]?.section_id){
					delete_dataframe({
						self				: self,
						section_id			: self.section_id,
						section_tipo		: self.section_tipo,
						section_id_key		: self.data.value[0].section_id,
						section_tipo_key	: self.data.value[0].section_tipo,
						main_component_tipo	: self.data.value[0].main_component_tipo,
						delete_instace 		: true
					})
				}

				// change data
					const changed_data_item	= Object.freeze({
						action	: (parsed_value != null) ? 'update' : 'remove',
						key		: (parsed_value != null) ? i : false,
						value	: parsed_value
					})

				// fix instance changed_data
					self.set_changed_data(changed_data_item)

				// force to save on every change
					await self.change_value({
						changed_data	: [changed_data_item],
						refresh			: false,
						remove_dialog	: false
					})

				// show/hide button_edit based on value
					if (select.button_edit) {
						if (value) {
							select.button_edit.classList.remove('hide')

							const section_id	= parsed_value.section_id
							const section_tipo	= parsed_value.section_tipo

								const component_dataframe = get_dataframe({
									self				: self,
									section_id			: self.section_id,
									section_tipo		: self.section_tipo,
									section_id_key		: section_id,
									section_tipo_key	: section_tipo,
									main_component_tipo	: self.tipo,
									view				: 'default'
								}).then(async function(component_dataframe){

									if(component_dataframe){

										self.ar_instances.push(component_dataframe)
										const dataframe_node = await component_dataframe.render()

										content_value.appendChild(dataframe_node)
										// set pointers
										select.dataframe = dataframe_node
									}
								})


						}else{
							select.button_edit.classList.add('hide')
						}
					}

				// set_lang_value publish event
					if (parsed_value) {
						const datalist_item = datalist.find(el =>
							el.value &&
							el.value.section_id==parsed_value.section_id &&
							el.value.section_tipo==parsed_value.section_tipo
						)
						event_manager.publish('set_lang_value_' + self.id_base , datalist_item.section_id)
					}
			}
			select.addEventListener('change', change_handler)

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
				class_name		: 'button pen grey show_on_active',
				parent			: content_value
			})
			// set pointers
			select.button_edit = button_edit

			// click event
			const fn_click = function(e) {
				e.stopPropagation()

				// nothing is selected case
					if (!select.value || select.value==='null') {
						return false
					}

				// short vars
					const selected_locator		= JSON.parse(select.value)
					const target_section_tipo	= selected_locator.section_tipo
					const target_section_id		= selected_locator.section_id

				// open a new window
					const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
						tipo			: target_section_tipo,
						id				: target_section_id,
						mode			: 'edit',
						menu			: false,
						session_save	: false
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
			}//end fn_click
			button_edit.addEventListener('click', fn_click)

			// hide button on no value
			if (!select.value || select.value==='null') {
				button_edit.classList.add('hide')
			}
		}

	// first dataframe load if the component has data
		if(current_value){

			const component_dataframe = get_dataframe({
				self				: self,
				section_id			: self.section_id,
				section_tipo		: self.section_tipo,
				section_id_key		: current_value.section_id,
				section_tipo_key	: current_value.section_tipo,
				main_component_tipo	: current_value.main_component_tipo,
				view				: 'default'
			}).then(async function(component_dataframe){

				if(component_dataframe){

					self.ar_instances.push(component_dataframe)
					const dataframe_node = await component_dataframe.render()

					content_value.appendChild(dataframe_node)
				}
			})
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



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const target_sections			= self.context.target_sections || []
		const target_sections_length	= target_sections.length
		const show_interface			= self.show_interface

	// permissions to create new values in the target section
	// permissions below 2 can not create new values.
		const permissions_new = target_sections[0]?.permissions_new || 0;

	// fragment
		const fragment = new DocumentFragment()

	// button_add (not in component_select_lang)
		if( permissions_new > 1 && show_interface.button_add === true && self.model !== 'component_select_lang'){

			const button_add = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'New',
				parent			: fragment
			})
			const fn_add = async function(e) {
				e.stopPropagation()

				// check current value. LImit to one
					const data	= self.data || {}
					const value	= data.value || []
					// if (value.length>0) {
					// 	alert('Warning. Only one value is allowed');
					// 	return
					// }

				// target_section_tipo. to add section selector
					const target_section_tipo = target_sections_length > 1
						? false
						: target_sections[0].tipo
					if (!target_section_tipo) {
						alert('Error. Empty or invalid target_sections');
						return
					}

				// add_new_element
					const result = await self.add_new_element(target_section_tipo)
					if (result===true) {

						// last_value. Get the last value of the portal to open the new section
							const last_value	= self.data.value[self.data.value.length-1]
							const section_tipo	= last_value.section_tipo
							const section_id	= last_value.section_id

						// section. Create the new section instance
							const section = await get_instance({
								model			: 'section',
								mode			: 'edit',
								tipo			: section_tipo,
								section_tipo	: section_tipo,
								section_id		: section_id,
								inspector		: false,
								session_save	: false,
								session_key		: 'section_' + section_tipo + '_' + self.tipo
							})
							await section.build(true)
							const section_node = await section.render()

						// header
							const header = (get_label.new || 'New section') + ' ' + target_sections[0].label

						// modal. Create a modal to attach the section node
							const modal = ui.attach_to_modal({
								header	: header,
								body	: section_node
							})
							modal.on_close = function(){
								self.refresh()
							}

						// activate_first_component. Get the first ddo in ddo_map to be focused
							ui.activate_first_component({
								section	: section
							})
					}//end if (result===true)

				// remove aux items
					if (window.page_globals.service_autocomplete) {
						window.page_globals.service_autocomplete.destroy(true, true, true)
					}
			}
			button_add.addEventListener('click', fn_add)
		}//end button_add

	// button_list (go to target section)
		if(show_interface.button_list === true){

			const fn_mousedown = (e) => {
				e.stopPropagation()

				const item = e.target

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
			}//end fn_mousedown

			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				// button edit
					const label = (SHOW_DEBUG===true)
						? `${item.label} [${item.tipo}]`
						: item.label || ''
					const button_list = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button pen',
						title			: label.replace(/<\/?[^>]+(>|$)/g, ""),
						parent			: fragment
					})
					button_list.tipo = item.tipo
					button_list.addEventListener('mousedown', fn_mousedown)
			}//end for (let i = 0; i < target_sections_length; i++)
		}

	// tools buttons
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
