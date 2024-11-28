// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {get_instance} from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {pause} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_ontology
* Manages the component's logic and appearance in client side
*/
export const render_tool_ontology = function() {

	return true
}//end render_tool_ontology



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_ontology.prototype.edit = async function(options) {

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
		const user_info = ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'user_info',
			inner_html		: self.get_tool_label('user_info'),
			parent			: fragment
		})

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		});

	// active
		// component instance_options
		const active_instance_options = {
			model			: 'component_radio_button',
			mode			: 'edit',
			tipo			: 'hierarchy4',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			lang			: page_globals.dedalo_data_nolan,
			id_variant		: self.name, // id_variant prevents id conflicts
			caller			: self // set current tool as component caller (to check if component is inside tool or not)
		}
		// get instance and init
		const active_component_instance = await get_instance(active_instance_options)
		self.ar_instances.push(active_component_instance)
		// build
		await active_component_instance.build(true)
		// show_interface
		active_component_instance.show_interface.tools = false
		active_component_instance.show_interface.button_add = false
		// render
		const active_component_node = await active_component_instance.render()
		components_container.appendChild(active_component_node)

	// real_section_tipo
		// component instance_options
		const real_st_instance_options = {
			model			: 'component_input_text',
			mode			: 'edit',
			tipo			: 'hierarchy109',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			lang			: page_globals.dedalo_data_nolan,
			id_variant		: self.name, // id_variant prevents id conflicts
			caller			: self // set current tool as component caller (to check if component is inside tool or not)
		}
		// get instance and init
		const real_st_component_instance = await get_instance(real_st_instance_options)
		self.ar_instances.push(real_st_component_instance)
		// build
		await real_st_component_instance.build(true)
		// show_interface
		real_st_component_instance.show_interface.tools = false
		real_st_component_instance.show_interface.button_add = false
		// render
		const real_st_component_node = await real_st_component_instance.render()
		components_container.appendChild(real_st_component_node)

	// tld
		// component instance_options
		const tld_instance_options = {
			model			: 'component_input_text',
			mode			: 'edit',
			tipo			: 'hierarchy6',
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			lang			: page_globals.dedalo_data_nolan,
			id_variant		: self.name, // id_variant prevents id conflicts
			caller			: self // set current tool as component caller (to check if component is inside tool or not)
		}
		// get instance and init
		const tld_component_instance = await get_instance(tld_instance_options)
		self.ar_instances.push(tld_component_instance)
		// build
		await tld_component_instance.build(true)
		// show_interface
		tld_component_instance.show_interface.tools = false
		tld_component_instance.show_interface.button_add = false
		// render
		const tld_component_node = await tld_component_instance.render()
		components_container.appendChild(tld_component_node)

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
			button_generate.addEventListener('click', async function(e){
				e.stopPropagation();

				// reset component error class
					// real_st_component_instance.node.classList.remove('error')
					// tld_component_instance.node.classList.remove('error')
					// active_component_instance.node.classList.remove('error')
					// messages_container.classList.remove('error')
					[
						real_st_component_instance.node,
						tld_component_instance.node,
						active_component_instance.node,
						messages_container
					]
					.map(el => el.classList.remove('error'))

				let spinner
				function set_loading( set ) {

					if (set===true) {

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
						spinner.remove()
					}
				}

				// check value
					if (!real_st_component_instance.data.value || !real_st_component_instance.data.value[0]?.length) {
						real_st_component_instance.node.classList.add('error')
						return false
					}
					if (!tld_component_instance.data.value || !tld_component_instance.data.value[0]?.length) {
						tld_component_instance.node.classList.add('error')
						return false
					}
					if (!active_component_instance.data.value || active_component_instance.data.value[0]?.section_id!=1) {
						active_component_instance.node.classList.add('error')
						return false
					}

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
				await pause(3000)

				self.generate_virtual_section({
					force_to_create : check_force_to_create.checked
				})
				.then(function(api_response){

					// user messages
						messages_container.innerHTML = api_response.msg
							? (Array.isArray(api_response.msg) ? api_response.msg.join('<br>') : api_response.msg)
							: 'Unknown error'

					// reload section (caller)
						if (api_response.result!==false) {
							self.caller.refresh()
						}else{
							messages_container.classList.add('error')
						}

					set_loading(false)
				})
			})//end button_generate.addEventListener('click'

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



// @license-end
