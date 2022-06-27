/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TC
* Manages the component's logic and apperance in client side
*/
export const render_tool_tc = function() {

	return true
}//end render_tool_tc



/**
* EDIT
* Render node
* @return DOM node
*/
render_tool_tc.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// fix wrapper
		self.wrapper = wrapper

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end render_tool_tc



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// source
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component_container',
			parent 			: components_container
		})

	// target
		// const target_component_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'target_component_container',
		// 	parent 			: components_container
		// })


	// offset_management_container. Language selection and time codes management container
		const tc_management_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'offset_management_container',
			parent 			: components_container
		})

	// source_select_lang
		const source_select_lang = ui.build_select_lang({
			langs		: self.langs,
			selected	: self.source_lang,
			class_name	: 'source_lang'
		})
		source_select_lang.addEventListener('change', function(){
			const lang = source_select_lang.value
			add_component(self, source_component_container, lang)
			// self.target_component = add_component(self, target_component_container, lang)
		})
		// source default value check
		if (source_select_lang.value) {
			// left side component (use already loaded on build, self.main_element)
			self.main_element.render()
			.then(function(node){
				node.classList.add('disabled_component')
				source_component_container.appendChild(node)
			})
			// right side component
			// self.target_component = add_component(self, target_component_container, source_select_lang.value)
		}
		tc_management_container.appendChild(source_select_lang)

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

	// preview button
		// const button_preview = ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'secondary button_preview',
		// 	inner_html		: get_label.preview || "Preview",
		// 	parent			: tc_management_container
		// })
		// button_preview.addEventListener("click", () => {
		// 	// loading add
		// 	components_container.classList.add('loading')

		// 	self.change_all_time_codes(false)
		// 	.then(function(){
		// 		// loading remove
		// 		components_container.classList.remove('loading')
		// 	})
		// })

	// apply button
		const button_apply = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_apply',
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
				.then(function(){

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
			id				: 'response_div',
			element_type	: 'div',
			class_name 		: 'response_div',
			parent 			: tc_management_container
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* ADD_COMPONENT
* Create a component instance, clean container and
* render the component inside
* @param object self
* @param DOM node component_container
* @param string lang
* @return object component
* 	Instance of component in given lang
*/
export const add_component = async (self, component_container, lang) => {

	// user select blank lang case
		if (!lang) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// instance
		const component = await self.load_component(lang)

	// render
		const node = await component.render()
		node.classList.add('disabled_component')

		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
		component_container.appendChild(node)


	return component
}//end add_component
