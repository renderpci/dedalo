// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TC
* Manages the component's logic and appearance in client side
*/
export const render_tool_tc = function() {

	return true
}//end render_tool_tc



/**
* EDIT
* Render node
* @param object options
* @return HTMLElement wrapper
*/
render_tool_tc.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// source component
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'source_component_container',
			parent			: components_container
		})
		// main_element render
		// show_interface
		self.main_element.show_interface.read_only	= true
		self.main_element.show_interface.tools		= false
		// auto_init_editor
		self.main_element.auto_init_editor			= false
		self.main_element.render()
		.then(function(node){
			source_component_container.appendChild(node)
		})

	// tc_management_container. Language selection and time codes management container
		const tc_management_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tc_management_container',
			parent			: components_container
		})

	// source_select_lang
		const source_select_lang = ui.build_select_lang({
			langs		: self.langs,
			selected	: self.source_lang,
			class_name	: 'source_lang'
		})
		tc_management_container.appendChild(source_select_lang)
		source_select_lang.addEventListener('change', async function(e) {
			change_component_lang({
				self		: self,
				component	: self.main_element,
				lang		: e.target.value
			})
		})

	// offset_input in seconds
		const offset_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_offset',
			placeholder		: self.get_tool_label('offset_in_seconds') || '*Offset in seconds',
			parent			: tc_management_container
		})
		// fix input
		self.offset_input = offset_input

	// apply button
		const button_apply = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_apply',
			inner_html		: self.get_tool_label('apply') || 'Apply',
			parent			: tc_management_container
		})
		button_apply.addEventListener('click', (e) => {
			e.stopPropagation()

			// add loading
				components_container.classList.add('loading')

			// offset_seconds
				const offset_seconds = offset_input.value
				if (!offset_seconds || offset_seconds=='' || offset_seconds==0) {
					alert( self.get_tool_label('empty_offset_value') || 'Error. Empty offset value');
					// remove loading
					components_container.classList.remove('loading')
					return
				}

			// change_all_time_codes
				self.change_all_time_codes(offset_seconds, true)
				.then(function() {
					// refresh target
					self.main_element.refresh()
					.then(function(){
						// remove loading
						components_container.classList.remove('loading')
					})
				})
		})

	// response div
		const response_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_div',
			parent			: tc_management_container
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* CHANGE_COMPONENT_LANG
* Create a component instance, clean container and
* render the component inside
* @param object self
* @param object component
* @param string lang
* @return bool
* 	Instance of component in given lang
*/
export const change_component_lang = async (options) => {

	// options
		const self		= options.self
		const component	= options.component
		const lang		= options.lang

	// loading add
		component.node.classList.add('loading')

	// configure always
		component.show_interface.read_only	= true
		component.lang						= lang
		component.auto_init_editor			= false

	// render
		await component.refresh()

	// loading remove
		component.node.classList.remove('loading')


	return true
}//end change_component_lang



// @license-end
