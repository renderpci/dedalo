// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {get_instance} from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {pause} from '../../../core/common/js/utils/index.js'
	import {dd_request_idle_callback} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_HIERARCHY
* Manages the component's logic and appearance in client side
*/
export const render_tool_hierarchy = function() {

	return true
}//end render_tool_hierarchy



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_hierarchy.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// user_info
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'user_info',
			inner_html		: self.get_tool_label('user_info'),
			parent			: fragment
		})

		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'msg_fields',
			inner_html		: self.get_tool_label('all_fields_mandatory') || 'All fields are mandatory',
			parent			: fragment
		})

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		});

	// components
	// components_instances list
		const components_instances = []

	// tld
		const tld_component_instance = await render_component(self, 'hierarchy6');
		components_container.appendChild(tld_component_instance.node)
		components_instances.push(tld_component_instance)

	// name
		const name_component_instance = await render_component(self, 'hierarchy5');
		components_container.appendChild(name_component_instance.node)
		components_instances.push(name_component_instance)

	// active
		const active_component_instance = await render_component(self, 'hierarchy4');
		components_container.appendChild(active_component_instance.node)
		components_instances.push(active_component_instance)

	// typology
		const typology_component_instance = await render_component(self, 'hierarchy9');
		components_container.appendChild(typology_component_instance.node)
		components_instances.push(typology_component_instance)

	// lang
		const lang_component_instance = await render_component(self, 'hierarchy8');
		components_container.appendChild(lang_component_instance.node)
		components_instances.push(lang_component_instance)

	// real_section_tipo
		const real_st_component_instance = await render_component(self, 'hierarchy109');
		components_container.appendChild(real_st_component_instance.node)
		components_instances.push(real_st_component_instance)

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// button_generate
			const button_generate = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning gear',
				inner_html		: self.get_tool_label('generate'),
				parent			: buttons_container
			})
			// click event
			const click_handler = async (e) => {
				e.stopPropagation();

				const clear_messages = () => {
					messages_container.classList.remove('error')
					messages_container.innerHTML = ''
					components_instances.forEach(el => el.node.classList.remove('error'))
				}
				clear_messages()

				// set_loading
					let spinner
					const set_loading = (set) => {
						if (set) {
							content_data.classList.add('loading')
							messages_container.innerHTML = ''
							// spinner
							spinner = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner',
								parent			: content_data.parentNode
							})
						}else{
							content_data.classList.remove('loading')
							if (spinner) spinner.remove()
						}
					}

				// set error
					const set_error = (instance) => {
						instance.node.classList.add('error')
						ui.component.activate(instance)
						messages_container.innerHTML =
						  (self.get_tool_label('insert_value') || 'Please, insert a valid value to continue.') + ' ' + instance.label
					}

				// is valid
					const is_invalid = (instance, condition_fn) => {
						if (!instance.data?.value || !condition_fn(instance.data?.value[0])) {
							set_error(instance)
							return true
						}
						return false
					}

				// check value
					if (
						is_invalid(tld_component_instance, val => val?.length) ||
						is_invalid(name_component_instance, val => val?.length) ||
						is_invalid(active_component_instance, val => val?.section_id == 1) ||
						is_invalid(typology_component_instance, val => val?.section_id) ||
						is_invalid(lang_component_instance, val => val?.section_id) ||
						is_invalid(real_st_component_instance, val => val?.length)
					) return false

				// confirm twice
					if (!confirm(get_label.sure || 'Sure?')) {
						return false
					}
					content_data.classList.add('loading')
					await pause(1000)
					const warning = self.get_tool_label('absolute_sure')
					if (!confirm(warning)) {
						content_data.classList.remove('loading')
						return false
					}

				set_loading(true)

				// API call
				let api_response
				try {
					api_response = await self.generate_virtual_section({
						force_to_create : check_force_to_create.checked
					})
				} catch (err) {
					messages_container.classList.add('error')
					ui.create_dom_element({
						element_type: 'div',
						class_name: 'error',
						inner_html: 'Unexpected error: ' + err.message,
						parent: messages_container
					})
					set_loading(false)
					return
				}

				// messages
					const msg = api_response.msg
						? (Array.isArray(api_response.msg) ? api_response.msg.join('<br>') : api_response.msg)
						: 'Unknown error'
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'messages',
						inner_html		: msg,
						parent			: messages_container
					})

				// errors
					if (api_response.errors?.length) {
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'error',
							inner_html		: api_response.errors.join('<br>'),
							parent			: messages_container
						})
					}

				// reload section (caller)
					if (api_response.result !== false) {
						try {
							// refresh section
							self.caller?.refresh()
							// refresh menu
							const menu = self.caller?.caller?.ar_instances?.find(el => el.model==='menu');
							if (menu) menu.refresh()
						} catch (error) {
							console.error('Unable to refresh section or menu: ' , error)
						}
					}else{
						messages_container.classList.add('error')
					}

				set_loading(false)
			}
			button_generate.addEventListener('click', click_handler)
			// focus buttons
			dd_request_idle_callback(
				() => {
					button_generate.focus()
				}
			)

		// check box force to create
			const label_field_check_box = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'checkbox-label',
				inner_html		: self.get_tool_label('force_to_create') || 'Force to create',
				parent			: buttons_container
			})
			const check_force_to_create = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				parent			: label_field_check_box
			})

	// messages_container
		const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_COMPONENT
* Creates de DOM nodes of the component based on given tipo
* @param object self
* @param string tipo
* @return object component_instance
*/
export const render_component = async function (self, tipo) {

	// component instance_options
	const lang_instance_options = {
		model			: null, // force to resolve model
		mode			: 'edit',
		tipo			: tipo,
		section_tipo	: self.caller.section_tipo,
		section_id		: self.caller.section_id,
		lang			: page_globals.dedalo_data_nolan,
		id_variant		: self.name, // id_variant prevents id conflicts
		caller			: self // set current tool as component caller (to check if component is inside tool or not)
	}
	// get instance and init
	const component_instance = await get_instance(lang_instance_options)
	self.ar_instances.push(component_instance)
	// build
	await component_instance.build(true)
	// show_interface
	component_instance.show_interface.tools = false
	component_instance.show_interface.button_add = false
	// render
	await component_instance.render()


	return component_instance
}//end render_component



// @license-end
