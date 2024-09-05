// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {create_source} from '../../common/js/common.js'
	import {data_manager, download_data} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {render_node_info} from '../../common/js/utils/notifications.js'
	import {open_window, object_to_url_vars} from '../../common/js/utils/index.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'



/**
* RENDER_INSPECTOR
* Manages the component's logic and appearance in client side
*/
export const render_inspector = function() {

	return true
}//end render_inspector



/**
* EDIT
* Render node for use in this mode
* @param object options
* @return HTMLElement wrapper
*/
render_inspector.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label icon_arrow up',
			inner_html		: get_label.inspector || 'Inspector'
		})
		// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: label,
			container			: content_data,
			collapsed_id		: 'inspector_main_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			label.classList.remove('up')
		}
		function expose() {
			label.classList.add('up')
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id				: 'inspector',
			class_name		: 'wrapper_inspector inspector'
		})
		// set pointers
		wrapper.content_data = content_data

	// add elements
		wrapper.appendChild(label)
		wrapper.appendChild(content_data)

	// tooltip
		setTimeout(function(){
			ui.activate_tooltips(wrapper)
		}, 1)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Renders the whole content_data node
* @param object self
* 	inspector instance
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const section			= self.caller
		const section_buttons	= section.context.buttons || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data inspector_content_data hide'
		})
		content_data.addEventListener('mousedown', function(e) {
			e.stopPropagation();
		})

	// paginator container
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: content_data
		})
		// fix pointer to node placeholder
		self.paginator_container = paginator_container

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container top',
			parent			: content_data
		})

		// button_search. Show and hide all search elements
			const button_search = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light search',
				title			: get_label.find || "Search",
				parent			: buttons_container
			})
			button_search.addEventListener('mousedown', function(e){
				e.stopPropagation()
				event_manager.publish('toggle_search_panel_' + self.caller.id)
			})

		// button_new . Call API to create new section and navigate to the new record
			const section_button_new = section_buttons.find(el => el.model==='button_new')
			if (section_button_new) {
				const button_new = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light add_light',
					title			: section_button_new.label || 'New',
					parent			: buttons_container
				})
				button_new.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('new_section_' + self.caller.id)
				})
			}

		// button_duplicate . Call API to duplicate current record
		// use the section_button_new, if it's defined user can create or duplicate the section
			if (section_button_new) {
				const button_duplicate = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light duplicate',
					title			: get_label.duplicate || "Duplicate",
					parent			: buttons_container
				})
				button_duplicate.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('duplicate_section_' + self.caller.id, {
						section_tipo	: self.caller.section_tipo,
						section_id		: self.caller.section_id,
						caller			: self.caller // section
					})
				})
			}

		// button_delete . Call API to delete current record
			const section_button_delete = section_buttons.find(el => el.model==='button_delete')
			if (section_button_delete) {
				const button_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light remove',
					title			: section_button_delete.label || 'Delete',
					parent			: buttons_container
				})
				button_delete.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('delete_section_' + self.caller.id, {
						section_tipo	: self.caller.section_tipo,
						section_id		: self.caller.section_id,
						caller			: self.caller // section
					})
				})
			}

		// button_diffusion
			const tool_diffusion = self.caller.tools.find(el => el.name==='tool_diffusion')
			if (tool_diffusion) {
				const button_diffusion = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light diffusion',
					title			: get_label.diffusion || 'Diffusion',
					parent			: buttons_container
				})
				button_diffusion.addEventListener('mousedown', (e) => {
					e.stopPropagation()
					// open_tool (tool_common)
					open_tool({
						tool_context	: tool_diffusion, // tool context
						caller			: self.caller // section instance
					})
				})
			}

	// tools_container. Section tools buttons
		const inspector_tools			= self.caller.context.tools.filter(el => el.show_in_inspector && el.properties && el.properties?.mode==='edit')
		const inspector_tools_length	= inspector_tools.length
		if (inspector_tools_length>0) {
			const tools_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tools_container top',
				parent			: content_data
			})
			for (let i = 0; i < inspector_tools_length; i++) {
				const tool_context = inspector_tools[i]
				// button_tool
					const button_tool = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light blank',
						style			: {
							'--icon-path'	: "url('" +tool_context.icon +"')"
						},
						title			: tool_context.label,
						parent			: tools_container
					})
					button_tool.addEventListener('mousedown', function(e){
						e.stopPropagation()
						// open_tool (tool_common)
							open_tool({
								tool_context	: tool_context,
								caller			: self.caller
							})
					})
			}
		}

	// selection info
		const selection_info = render_selection_info(self)
		content_data.appendChild(selection_info)

	// element_info. Selected element information
		const element_info = render_element_info(self)
		content_data.appendChild(element_info)

	// project container
		// (!) Note that the filter node is collected from a subscribed
		// event 'render_component_filter_xx' from self inspector init event
		if (self.component_filter_node) {
			const project_block = render_project_block(self)
			content_data.appendChild(project_block)
		}

	// relation_list container
		if (self.caller.context.config && self.caller.context.config.relation_list_tipo) {
			const relation_list = render_relation_list(self)
			content_data.appendChild(relation_list)
		}

	// Note that 'time_machine_list' is a Ontology item children of current section if defined
	// as 'numisdata588' and is used ONLY to determine if current section have a history changes list or not
		// if (self.caller.context.time_machine_list) {
			// time_machine_list container
				const time_machine_list = render_time_machine_list(self)
				content_data.appendChild(time_machine_list)

			// component_history container
				const component_history = render_component_history(self)
				content_data.appendChild(component_history)
		// }

	// activity_info
		const activity_info = render_activity_info(self)
		content_data.appendChild(activity_info)

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container bottom',
			parent			: content_data
		})

		// data_link . Open window to full section JSON data
			const data_link = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light eye data_link',
				text_content	: get_label.record || 'View record data',
				parent			: buttons_bottom_container
			})
			const fn_data_link = function(e) {
				e.stopPropagation()
				e.preventDefault()

				const url = DEDALO_API_URL + '?' + object_to_url_vars({
					action			: 'read_raw',
					section_tipo	: self.caller.section_tipo,
					section_id		: self.caller.section_id,
					pretty_print	: true
				})
				open_window({
					url			: url,
					features	: 'new_tab'
				})
			}//end fn_data_link
			data_link.addEventListener('mousedown', fn_data_link)

		// tool register files.	dd1340
			if (self.section_tipo==='dd1340') {
				const register_download = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning download register_download',
					text_content	: 'Download register file',
					parent			: buttons_bottom_container
				})
				const fn_register = function(e) {
					e.stopPropagation()
					e.preventDefault()

					const file_name = 'register.json'

					// confirm action by user
						if (!confirm(`Download file: ${file_name} ${self.caller.section_id} ?`)) {
							return false
						}

					// read from Dédalo API
						const rqo = {
							action	: 'read_raw',
							source	: create_source(self.caller)
						}
						data_manager.request({
							body : rqo
						})
						.then(function(api_response){

							// error case
								if (api_response.result===false || api_response.error) {
									// alert("An error occurred. " + api_response.error);
									return
								}

							// download blob as JSON file
								const data = api_response.result;
								download_data(data, file_name)
						})
				}//end fn_register
				register_download.addEventListener('mousedown', fn_register)
			}//end if (self.section_tipo==='dd1340')


	return content_data
}//end get_content_data



/**
* RENDER_SELECTION_INFO
* Display current selected element name like 'Description'
* @param object self
* @return HTMLElement selection_info_node
*/
const render_selection_info = function(self) {

	// selection_info_node
		const selection_info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'selection_info'
		})
		// update_label function called form event caller (section) render and activate_componentº
		selection_info_node.update_label = function(caller) {

			// fix caller
			self.selection_info_node.caller = caller

			// clean container
			while (selection_info_node.firstChild) {
				selection_info_node.removeChild(selection_info_node.firstChild)
			}

			// add label text
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'selection_info_label',
				inner_html		: caller.label || '',
				parent			: selection_info_node
			})

			// add button list when info is about section
			add_list_button(caller)
		}
		// fix pointer
		self.selection_info_node = selection_info_node

	// add_list_button to go to section list
		const add_list_button = function(caller) {
			if (caller && caller.model==='section' && caller.session_save===true) {
				const button_list = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button light list',
					title			: get_label.list || 'List',
					parent			: selection_info_node
				})
				button_list.addEventListener('mousedown', (e) => {
					e.stopPropagation()
					// go to section in list mode (useful when no menu is available)
					self.caller.goto_list()
				})
			}
		}

	// exec once
		add_list_button(self.caller)


	return selection_info_node
}//end render_selection_info



/**
* RENDER_SECTION_INFO
* Called from info.js throw event manager: render_' + self.caller.id
* @param object self
* 	inspector instance
* @return DOM DocumentFragment
*/
export const render_section_info = function(self) {

	// short vars
		const container		= self.element_info_container
		const section		= self.caller
		const section_data	= section.data.value && section.data.value[0]
			? section.data.value[0]
			: {}

	// values from caller (section)
		const section_tipo				= section.section_tipo
		const label						= section.label
		const mode						= section.mode
		const view						= section.view || 'default'
		const created_date				= section_data.created_date
		const modified_date				= section_data.modified_date
		const created_by_user_name		= section_data.created_by_user_name
		const modified_by_user_name		= section_data.modified_by_user_name
		const publication_first_date	= section_data.publication_first_date
		const publication_last_date		= section_data.publication_last_date
		const publication_first_user	= section_data.publication_first_user
		const publication_last_user		= section_data.publication_last_user
		const matrix_table				= section.context.matrix_table


	// DocumentFragment
		const fragment = new DocumentFragment();

	// section name
		// // label
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'key',
		// 	inner_html		: get_label.section || 'Section',
		// 	parent			: fragment
		// })
		// // value
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'value',
		// 	inner_html		: label,
		// 	parent			: fragment
		// })

	// tipo
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: get_label.tipo || 'tipo',
				parent			: fragment
			})
		// value
			const tipo_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value bold',
				inner_html		: section_tipo,
				title			: 'Click to copy',
				parent			: fragment
			})
			tipo_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				// only available in https context for security reasons
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText( section_tipo )
				}
			})

	// info
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: 'info',
				parent			: fragment
			})
		// value
			const info_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				parent			: fragment
			})
			// render_docu_links
			const docu_links = render_docu_links(self, section_tipo)
			info_container.appendChild(docu_links)

	// model
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: get_label.model || 'Model',
				parent			: fragment
			})
		// value
			const model_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: section.model,
				title			: 'Click to copy',
				parent			: fragment
			})
			model_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				// only available in https context for security reasons
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText( section.model )
				}
			})

	// matrix_table
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: get_label.table || 'table',
				parent			: fragment
			})
		// value
			const matrix_table_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: matrix_table,
				title			: 'Click to copy',
				parent			: fragment
			})
			matrix_table_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				// only available in https context for security reasons
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText( matrix_table )
				}
			})

	// section_id
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: 'section_id',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: section.section_id,
			parent			: fragment
		})

	// view
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: 'View',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: view + ' - ' + mode,
			parent			: fragment
		})

	// section created
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.created || 'Created',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: created_date + '<br>' + created_by_user_name,
			parent			: fragment
		})

	// section modified
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: get_label.modified || 'Modified',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: modified_date + '<br>' + modified_by_user_name,
			parent			: fragment
		})

	// published
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: (get_label.publicado || 'Published') + ' (first/last)',
			parent			: fragment
		})
		// value
		const publication_value = publication_first_date
			? publication_first_date + '<br>' + publication_first_user + '<br>' + publication_last_date + '<br>' + publication_last_user
			: get_label.nunca || 'Never'
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: publication_value,
			parent			: fragment
		})

	// clean and set container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}
		container.appendChild(fragment)

	// re-activate tooltips
	ui.activate_tooltips(container)

	return fragment
}//end render_section_info



/**
* RENDER_COMPONENT_INFO
* Show selected component main info and value
* @param object self
* 	inspector instance
* @param object component
* 	component instance
* @return DOM DocumentFragment
*/
export const render_component_info = function(self, component) {

	const container	= self.element_info_container

	// values from caller (section)
		const tipo			= component.tipo
		// const label		= component.label
		const model			= component.model
		const mode			= component.mode
		const view			= component.view || 'default'
		const translatable	= component.context.translatable
			? JSON.stringify(component.context.translatable)
			: 'no'
		// const ontology_info = component.context.ontology_info || ''
		// const value		= component.data && component.data.value
		// 	? JSON.stringify(component.data.value, null, 1)
		// 	: ''

	// DocumentFragment
		const fragment = new DocumentFragment();

	// container

	// component label
		// // label
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'key',
		// 	inner_html		: get_label.component || 'Component',
		// 	parent			: fragment
		// })
		// // value
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'value',
		// 	inner_html		: label,
		// 	parent			: fragment
		// })

	// tipo
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: 'tipo',
				parent			: fragment
			})
		// value
			const tipo_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value bold',
				inner_html		: tipo,
				title			: 'Click to copy',
				parent			: fragment
			})
			tipo_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				// only available in https context for security reasons
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText( tipo )
				}
			})

	// info
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: 'info',
				parent			: fragment
			})
		// value
			const info_container = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				parent			: fragment
			})
			// render_docu_links
			const docu_links = render_docu_links(self, tipo)
			info_container.appendChild(docu_links)

	// model
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: get_label.model || 'Model',
				parent			: fragment
			})
		// value
			const model_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: model,
				title			: 'Click to copy',
				parent			: fragment
			})
			model_info.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				// only available in https context for security reasons
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText( model )
				}
			})

	// translatable
		// label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'key',
				inner_html		: get_label.translatable || 'Translatable',
				parent			: fragment
			})
		// value
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: translatable,
				parent			: fragment
			})

	// view
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key',
			inner_html		: 'View',
			parent			: fragment
		})
		// value
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: view + ' - ' + mode,
			parent			: fragment
		})

	// value
		// label
		const value_label_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'key wide icon_arrow',
			inner_html		: get_label.data || 'Data',
			parent			: fragment
		})
		// value
		const value_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value wide code hide',
			text_content	: 'Parsing data..',
			parent			: fragment
		})
		// dblclick event
		value_node.addEventListener('dblclick', (e) => {
			e.stopPropagation()
			// toggle value container max-height from default to none
			container.classList.toggle('auto_height')
		})
		// parse data. This time out prevents lock component selection
		const callback = () => {

			// set value
				const value = component.data?.value
					? JSON.stringify(component.data.value, null, 1)
					: ''
				value_node.textContent = value

			// monospace for JSON data
				// Note that this node is rendered again on each user component selection
				if (value.indexOf('[\n {')===0) {
					value_node.classList.add('monospace')
				}

			// button copy value
				const button_value_copy_node = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'button_value_copy warning',
					inner_html		: get_label.copy || 'Copy',
					parent			: value_node
				})
				// click event
				button_value_copy_node.addEventListener('click', (e) => {
					e.stopPropagation()
					// only available in https context for security reasons
					if (navigator && navigator.clipboard) {
						navigator.clipboard.writeText( JSON.stringify(component.data.value) )
					}
				})
		}
		const exec_idle_callback = ()=>{ dd_request_idle_callback(callback) }
		exec_idle_callback(callback)

		// event subscribe
		if (container.update_value_event_token) {
			// unsubscribe previous component subscription
			event_manager.unsubscribe(container.update_value_event_token)
		}
		// store subscription token to prevent duplicates
		container.update_value_event_token = event_manager.subscribe('update_value_'+ component.id_base, exec_idle_callback)

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: value_label_node,
			container			: value_node,
			collapsed_id		: 'inspector_component_value',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			value_label_node.classList.remove('up')
		}
		function expose() {
			value_label_node.classList.add('up')
		}

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	container.appendChild(fragment)

	// re-activate tooltips
	ui.activate_tooltips(container)


	return fragment
}//end render_component_info



/**
* RENDER_ELEMENT_INFO
* Note that self.element_info_containe is fixed to allow inspector init event
* to locate the target node when is invoked
* @param object self
* @return HTMLElement element_info_wrap
*/
const render_element_info = function(self) {

	// wrapper
	const element_info_wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'element_info_wrap'
	})
	element_info_wrap.addEventListener('mousedown', function(e) {
		// prevents deactivate selected component when user clicks the inspector
		e.stopPropagation()
	})

	// element_info_head
		const element_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info_head label icon_arrow up',
			inner_html		: get_label.informacion || "Info",
			parent			: element_info_wrap
		})

	// element_info_container (body)
		const element_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'element_info hide',
			parent			: element_info_wrap
		})
		// fix pointer to node placeholder
		self.element_info_container = element_info_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: element_info_head,
			container			: element_info_body,
			collapsed_id		: 'inspector_element_info_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			element_info_head.classList.remove('up')
		}
		function expose() {
			element_info_head.classList.add('up')
		}


	return element_info_wrap
}//end render_element_info



/**
* RENDER_PROJECT_BLOCK
* Show full component_project_filter of current section
* to allow user configure section projects
* @param object self
* 	inspector instance
* @return HTMLElement project_wrap
*/
const render_project_block = function(self) {

	// wrap
		const project_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_wrap'
		})

	// project_head
		const project_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_head icon_arrow up',
			inner_html		: get_label.project || "Project",
			parent			: project_wrap
		})

	// project container
		const project_container_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_container hide',
			parent			: project_wrap
		})
		// fix project_container_body
		self.project_container_body = project_container_body
		// component_filter_node (collected in inspector init event 'render_component_filter_xx')
		update_project_container_body(self)

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: project_head,
			container			: project_container_body,
			collapsed_id		: 'inspector_project_block',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			project_head.classList.remove('up')
		}
		function expose() {
			project_head.classList.add('up')
		}


	return project_wrap
}//end render_project_block



/**
* UPDATE_PROJECT_CONTAINER_BODY
* Clean project_container_body and add init event what fixed node: 'self.component_filter_node'
* @param object self
* @return bool true
*/
export const update_project_container_body = function(self) {

	// clean self.project_container_body
		while (self.project_container_body.firstChild) {
			self.project_container_body.removeChild(self.project_container_body.firstChild);
		}

	// add the new component_filter_node
		self.project_container_body.appendChild(self.component_filter_node)


	return true
}//end update_project_container_body



/**
* RENDER_RELATION_LIST
* @param object self
* @return HTMLElement relation_list_container
*/
const render_relation_list = function(self) {

	// wrapper
		const relation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_container'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			inner_html		: get_label.relations || "Relations",
			parent			: relation_list_container
		})

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_container
		})

	// relation_list events
		const fn_relation_list_paginator = function(relation_list) {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}
		self.events_tokens.push(
			event_manager.subscribe('relation_list_paginator_'+self.section_tipo, fn_relation_list_paginator)
		)

		const fn_updated_section = function() {
			// triggered after section pagination, it forces relation list update
			const is_open = !relation_list_body.classList.contains('hide')
			if (is_open) {
				load_relation_list()
			}
		}
		self.events_tokens.push(
			event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		)

	// track collapse toggle state of content
		const load_relation_list = async function(instance) {

			relation_list_head.classList.add('up')

			const relation_list_tipo = self.caller.context.config.relation_list_tipo

			const relation_list	= (instance && instance.model==='relation_list')
				? instance // pagination case do not need to init relation_list
				: await instances.get_instance({
					model			: 'relation_list',
					tipo			: relation_list_tipo, // self.caller.context['relation_list'],
					section_tipo	: self.caller.section_tipo,
					section_id		: self.caller.section_id,
					mode			: self.mode
				})

			await relation_list.build()
			const relation_list_container = await relation_list.render()
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild)
			}
			relation_list_body.appendChild(relation_list_container)
		}
		const unload_relation_list = function() {
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild);
			}
			relation_list_head.classList.remove('up')
		}
		ui.collapse_toggle_track({
			toggler				: relation_list_head,
			container			: relation_list_body,
			collapsed_id		: 'inspector_relation_list',
			collapse_callback	: unload_relation_list,
			expose_callback		: expose, // load_relation_list
			default_state		: 'closed'
		})
		function expose() {
			const load = () => {
				load_relation_list(self)
				relation_list_head.classList.add('up')
			}
			dd_request_idle_callback(load)
		}


	return relation_list_container
}//end render_relation_list



/**
* RENDER_TIME_MACHINE_LIST
* Show whole section recent activity (component value changes) list
* @param object self
* 	inspector instance
* @return HTMLElement time_machine_list_wrap
*/
export const render_time_machine_list = function(self) {

	// wrapper
		const time_machine_list_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list'
		})

	// time_machine_list_head
		const time_machine_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_head icon_arrow',
			inner_html		: get_label.latest_changes || 'Latest changes',
			parent			: time_machine_list_wrap
		})

	// time_machine_list_body
		const time_machine_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_machine_list_body hide',
			parent			: time_machine_list_wrap
		})
		// fix pointer to node placeholder
		self.time_machine_list_container = time_machine_list_body

	// time_machine_list events subscription
		// self.events_tokens.push(
		// 	event_manager.subscribe('render_' + self.caller.id, fn_updated_section)
		// )
		// function fn_updated_section(){
		// 	// triggered after section pagination, it forces relation list update
		// 	const is_open = !time_machine_list_body.classList.contains('hide')
		// 	if (is_open) {
		// 		load_time_machine_list()
		// 	}
		// }

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: time_machine_list_head,
			container			: time_machine_list_body,
			collapsed_id		: 'inspector_time_machine_list',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			time_machine_list_head.classList.remove('up')
		}
		function expose() {
			const load = () => {
				load_time_machine_list(self)
				time_machine_list_head.classList.add('up')
			}
			dd_request_idle_callback(load)
		}


	return time_machine_list_wrap
}//end render_time_machine_list



/**
* LOAD_TIME_MACHINE_LIST
* Get section time_machine history records
* @param object self
* 	inspector instance
* @return HTMLElement|null container
*/
export const load_time_machine_list = async function(self) {

	// container. Prevent to load data when the viewer is collapsed
		const container	= self.time_machine_list_container
		const is_open	= container && !container.classList.contains('hide')
		if (!is_open) {
			return null
		}

	// set as loading
		container.classList.add('loading')

	// (!) Note that expose is called on each section pagination, whereby must be generated
	// even if user close and re-open the time_machine_list inspector tab

	// create and render a service_time_machine instance
		const service_time_machine	= await instances.get_instance({
			model			: 'service_time_machine',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			view			: 'mini',
			id_variant		: self.section_tipo + '_tm_list',
			caller			: self,
			config			: {
				id					: 'section_history',
				model				: 'dd_grid', // used to create the filter
				tipo				: self.caller.section_tipo, // used to create the filter
				template_columns	: '1fr 1fr 1fr 2fr',
				ignore_columns		: [
					'matrix_id' // matrix_id dd1573
				],
				ddo_map				: [{
					tipo			: 'dd1574', // 'dd1574' generic tm info ontology item 'Value'
					type			: 'dd_grid',
					typo			: 'ddo',
					model			: 'dd_grid', // (!) changed to dd_grid to allow identification
					section_tipo	: self.section_tipo,
					parent			: self.section_tipo,
					debug_label		: 'Value',
					mode			: 'list',
					view			: 'mini'
				}]
			}
		})
		await service_time_machine.build(true)
		const time_machine_list_wrap = await service_time_machine.render()

	// remove previous node if a pointer exists
		if (container.time_machine_list_wrap) {
			container.time_machine_list_wrap.remove()
		}

	// append node
		container.appendChild(time_machine_list_wrap)
		// set pointers
		container.time_machine_list_wrap = time_machine_list_wrap

	// set as loaded
		container.classList.remove('loading')


	return container
}//end load_time_machine_list



/**
* RENDER_COMPONENT_HISTORY
* Note that self.element_info_containe is fixed to allow inspector init event
* to locate the target node when is invoked
* @param object self
* 	inspector instance
* @return HTMLElement component_history_wrap
*/
const render_component_history = function(self) {

	// wrapper
		const component_history_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history'
		})
		component_history_wrap.addEventListener('mousedown', function(e) {
			// prevents deactivate selected component when user clicks the inspector
			e.stopPropagation()
		})

	// component_history_head
		const component_history_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history_head icon_arrow',
			inner_html		: get_label.component_history || 'Component history',
			parent			: component_history_wrap
		})

	// component_history_body
		const component_history_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'component_history_body hide',
			parent			: component_history_wrap
		})
		// fix pointer to node placeholder
		self.component_history_container = component_history_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: component_history_head,
			container			: component_history_body,
			collapsed_id		: 'inspector_component_history_block',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			component_history_head.classList.remove('up')
		}
		function expose() {
			const load = () => {
				load_component_history(self, self.actived_component)
				component_history_head.classList.add('up')
			}
			dd_request_idle_callback(load)
		}


	return component_history_wrap
}//end render_component_history



/**
* LOAD_COMPONENT_HISTORY
* Get selected component time_machine history records and notes
* @param object self
* 	inspector instance
* @param object|null component
* 	component instance
* @return HTMLElement|null component_history_wrap
*/
export const load_component_history = async function(self, component) {

	// container
		const container	= self.component_history_container

	// prevent load the component data when component is not selected
		if(!component) {
			// remove previous node if exists pointer
			if (container && container.component_history_wrap) {
				container.component_history_wrap.remove()
			}
			return null
		}

	// prevent to affect modals
		if (component.section_tipo!==self.section_tipo) {
			return null
		}

	// container. Prevent to load data when the viewer is collapsed
		const is_open = container && !container.classList.contains('hide')
		if (!is_open) {
			return null
		}

	// set as loading
		container.classList.add('loading')

	// (!) Note that load_component_history is called on each section pagination, whereby must be generated
	// even if user close and re-open the component_history inspector tab

	// create and render a component_history instance
		const service_time_machine	= await instances.get_instance({
			model			: 'service_time_machine',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			view			: 'history',
			id_variant		: component.tipo +'_'+ component.section_tipo + '_tm_list',
			caller			: self,
			config			: {
				id					: 'component_history_' + component.tipo,
				model				: component.model, // used to create the filter
				tipo				: component.tipo, // used to create the filter
				lang				: component.lang, // used to create the filter
				// template_columns	: '1fr 1fr 2fr 2fr',
				ignore_columns		: [
					'matrix_id', // matrix_id dd1573
					'where' // where dd546
				],
				ddo_map				: [
					{ 	// selected component
						typo			: 'ddo',
						type			: 'component',
						model			: component.model,
						tipo			: component.tipo,
						section_tipo	: self.section_tipo,
						parent			: self.section_tipo,
						label			: component.label,
						mode			: 'list',
						fixed_mode		: true, // preserves mode across section_record
						view			: 'text'
					},
					{	// notes component
						typo			: 'ddo',
						type			: 'component',
						model			: 'component_text_area',
						tipo			: 'rsc329',
						section_tipo	: 'rsc832',
						parent			: self.section_tipo,
						label			: 'Annotation',
						mode			: 'list',
						fixed_mode		: true, // preserves mode across section_record
						view			: 'note'
					}
				]
			}
		})
		await service_time_machine.build(true)
		const component_history_wrap = await service_time_machine.render()

	// remove previous node if exists pointer
		if (container.component_history_wrap) {
			container.component_history_wrap.remove()
		}

	// append node
		container.appendChild(component_history_wrap)
		// set pointers
		container.component_history_wrap = component_history_wrap

	// set as loaded
		container.classList.remove('loading')


	return container
}//end load_component_history



/**
* RENDER_ACTIVITY_INFO
* Show component save and error messages
* @param object self
* 	inspector instance
* @return HTMLElement wrapper
*/
const render_activity_info = function(self) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info'
		})

	// activity_info_head
		const activity_info_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_head icon_arrow',
			inner_html		: get_label.activity || 'Activity',
			parent			: wrapper
		})

	// activity_info_body
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body hide',
			parent			: wrapper
		})
		// fix pointer to node placeholder
		self.activity_info_container = activity_info_body

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: activity_info_head,
			container			: activity_info_body,
			collapsed_id		: 'inspector_activity_info',
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			activity_info_head.classList.remove('up')
		}
		function expose() {
			activity_info_head.classList.add('up')
		}


	return wrapper
}//end render_activity_info



/**
* LOAD_ACTIVITY_INFO
* Get selected component time_machine history records and notes
* @param object self
* 	inspector instance
* @param object options
* 	event save subscription received options
* @return HTMLElement|null container
*/
export const load_activity_info = async function(self, options) {

	// container
		const container	= self.activity_info_container

	// render notification bubble
		const node_info = render_node_info(options)

	// prepend node (at top of the list)
		container.prepend(node_info)


	return container
}//end load_activity_info



/**
* OPEN_ONTOLOGY_WINDOW
* Opens Dédalo Ontology page in a new window
* @param object self
* @param string url
* @param string docu_type
* @param bool focus = true
* @return bool
*/
export const open_ontology_window = function(self, url, docu_type, focus=false) {

	// fix docu_type (used in inspector.init event 'fn_activate_component')
	self.last_docu_type = docu_type

	// docu_window
	window.docu_window = window.docu_window || null

	if (window.docu_window && !window.docu_window.closed) {
		// recycle current already existing window
		window.docu_window.location = url
		if (focus===true) {
			window.docu_window.focus()
		}
	}else{
		// create a window from scratch
		const window_width	= 1001
		const screen_width	= window.screen.width
		const screen_height	= window.screen.height
		const left = screen_width - window_width
		window.docu_window	= window.open(
			url,
			'docu_window',
			`left=${left},top=0,width=${window_width},height=${screen_height}`
		)
	}


	return true
}//end open_ontology_window



/**
* RENDER_DOCU_LINKS
* Opens Dédalo Ontology page in a new window
* @param object self
* @param string tipo
* @return DocumentFragment fragment
*/
const render_docu_links = function(self, tipo) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// docu_link
		const docu_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'button link',
			title			: 'Documentation',
			parent			: fragment
		})
		docu_link.addEventListener('mousedown', function(e) {
			e.stopPropagation()
			open_ontology_window(
				self,
				'https://dedalo.dev/ontology/' + tipo + '?lang=' + page_globals.dedalo_application_lang,
				'docu_link'
			)
		})

	if (SHOW_DEVELOPER===true) {

		// local_ontology
			const local_ontology = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button pen',
				title			: 'Local Ontology',
				parent			: fragment
			})
			local_ontology.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				open_ontology_window(
					self,
					DEDALO_CORE_URL + '/ontology/dd_edit.php?terminoID=' + tipo,
					'local_ontology'
				)
			})

		// local ontology tree search
			const local_ontology_search = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button tree',
				title			: 'Local Ontology tree search',
				parent			: fragment
			})
			local_ontology_search.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				open_ontology_window(
					self,
					DEDALO_CORE_URL + `/ontology/trigger.dd.php?modo=tesauro_edit&terminoID=${tipo}&accion=searchTSform`,
					'local_ontology_search'
				)
			})

		// master_ontology
			const master_ontology = ui.create_dom_element({
				element_type	: 'a',
				class_name		: 'button edit',
				title			: 'Master Ontology',
				parent			: fragment
			})
			master_ontology.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				open_ontology_window(
					self,
					'https://master.render.es/dedalo/lib/dedalo/ontology/dd_edit.php?terminoID=' + tipo,
					'master_ontology'
				)
			})

	}//end if (SHOW_DEVELOPER===true)


	return fragment
}//end render_docu_links



// @license-end
