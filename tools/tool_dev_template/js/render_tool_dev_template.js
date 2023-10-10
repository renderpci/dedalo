// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
// import ui to create DOM nodes and common HTML structures as wrappers or content_data compatible with the all Dédalo
	import {ui} from '../../../core/common/js/ui.js'
	import {pause} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_DEV_TEMPLATE
* Manages the component's logic and appearance in client side
*/
export const render_tool_dev_template = function() {

	return true
}//end render_tool_dev_template



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_dev_template.prototype.edit = async function(options) {

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

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'info_container',
			inner_html 		: `This sample tool is only to use as base or reference for create new tools.<br>
							   To see more complete information about how to create tools see the http://dedalo.dev documentation about tools`,
			parent 			: fragment
		})

	// components_container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// source component
		const main_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_component_container',
			parent			: components_container
		})
		self.main_element.render()
		.then(function(component_node){
			main_component_container.appendChild(component_node)
		})

	// footer_buttons_container
		const footer_buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer_buttons_container',
			parent			: fragment
		})

	// test_button 1
		const test_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('my_first_label') || 'Hello button without label 1',
			parent			: footer_buttons_container
		})
		test_button.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'component local value',
				callback			: async () => {

					await pause(700) // fake process wait

					const value_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: '',
						inner_html		: JSON.stringify(self.main_element.data.value, null, 2)
					})
					return value_node
				}
			})//end ui.load_item_with_spinner
		})

	// test_button 2
		const test_button2 = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('my_second_label') || 'Hello button without label 2',
			parent			: footer_buttons_container
		})
		test_button2.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'value from server',
				callback			: async () => {

					await pause(500) // fake process wait

					const response = await self.get_some_data_from_server()

					const value_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: '',
						inner_html		: JSON.stringify(response.result, null, 2)
					})
					return value_node
				}
			})//end ui.load_item_with_spinner
		})

	// value_container
		const value_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value_container',
			parent			: fragment
		})



	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



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

	const component = await self.load_component_sample({
		lang	: self,
		ddo		: self.main_element
	})
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
}//end add_component_sample



// @license-end
