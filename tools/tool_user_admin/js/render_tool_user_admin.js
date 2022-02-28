/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_user_admin */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {tool_common} from '../../tool_common/js/tool_common.js'
	import * as instances from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_USER_ADMIN
* Manages the component's logic and appearance in client side
*/
export const render_tool_user_admin = function() {

	return true
};//end render_tool_user_admin



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_user_admin.js'
* @param object options
* @return DOM node
*/
render_tool_user_admin.prototype.edit = async function(options) {

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

	// modal container
		const header = wrapper.querySelector('.tool_header') // is created by ui.tool.build_wrapper_edit
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			// when closing the modal, common destroy is called to remove tool and elements instances
			self.destroy(true, true, true)
		}


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// components
		const ar_promises			= []
		const component_list		= self.get_ddo_map()
		const component_list_length	= component_list.length
		for (let i = 0; i < component_list_length; i++) {

			// promise add and continue. Init and build
			ar_promises.push(new Promise(async function(resolve){

				// context
					const current_context = Object.assign({}, component_list[i])

				// init
					const instance_options = {
						model				: current_context.model,
						tipo				: current_context.tipo,
						section_tipo		: current_context.section_tipo,
						section_id			: page_globals.user_id,
						mode				: current_context.mode,
						lang				: current_context.lang || page_globals.dedalo_data_lang,
						section_lang		: self.lang,
						parent				: current_context.parent,
						type				: current_context.type,
						context				: current_context,
						id_variant			: self.model
						// data				: current_data,
						// datum			: self.datum,
						// request_config	: current_context.request_config,
						// columns_map		: current_context.columns_map,
						// caller			: self
					}
					const component_instance = await instances.get_instance(instance_options)

				// build
					await component_instance.build(true)

				// (!) update permissions more restrictively after build
					if (typeof current_context.permissions!=='undefined') {
						component_instance.permissions = current_context.permissions
					}

				// render
					const node = await component_instance.render()
					// components_container.appendChild(node)

				resolve(node)
			}))
		}//end for (let i = 0; i < component_list_length; i++)

	// ar_instances. When all section_record instances are built, set them
		await Promise.all(ar_promises).then((nodes) => {
			// add components rendered nodes to DOM components_container
			const nodes_length = nodes.length
			for (let i = 0; i < nodes_length; i++) {
				const node = nodes[i]
				components_container.appendChild(node)
			}
		});

	// source component
		// const source_component_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'source_component_container',
		// 	parent			: components_container
		// })
		// self.main_component.render()
		// .then(function(component_node){
		// 	source_component_container.appendChild(component_node)
		// })

	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'buttons_container',
		// 	parent			: components_container
		// })

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* ADD_COMPONENT_SAMPLE
* @param instance self
* @param DOM node component_container
* @param string lang
* @return bool true
*/
export const add_component_sample = async (self, component_container, lang) => {

	// user select blank lang case
		if (!lang) {
			while (component_container.firstChild) {
				// remove node from DOM (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(lang)
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
};//end add_component_sample


