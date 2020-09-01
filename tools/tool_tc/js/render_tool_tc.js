/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TC
* Manages the component's logic and apperance in client side
*/
export const render_tool_tc = function() {
	
	return true
};//end render_tool_tc



/**
* RENDER_TOOL_TC
* Render node for use like button
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
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// fix wrapper
		self.wrapper = wrapper

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			self.destroy(true, true, true)
		}


	return wrapper
};//end render_tool_tc



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

	//TODO - Add offset input text, preview button and apply button

	// source
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component_container disabled_component',
			parent 			: components_container
		})

	// target
		const target_component_container = ui.create_dom_element({
			id				: 'tc_target_content',
			element_type	: 'div',
			class_name 		: 'target_component_container disabled_component',
			parent 			: components_container
		})

	// Language selection and time codes management container
		const tc_management_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'offset_management_container',
			parent 			: components_container
		})

	// source_select_lang
		const source_select_lang = ui.build_select_lang({
			langs  		: self.langs,
			selected 	: self.source_lang,
			class_name	: 'source_lang',
			action 		: on_change_source_select_lang
		})
		function on_change_source_select_lang(e) {
			add_component(self, source_component_container, e.target.value)
			add_component(self, target_component_container, e.target.value)
		}
		// source default value check
			if (source_select_lang.value) {
				add_component(self, source_component_container, source_select_lang.value)
				add_component(self, target_component_container, source_select_lang.value)
			}
		tc_management_container.appendChild(source_select_lang)

	// offset_input in seconds
		const offset_input = ui.create_dom_element({
			id				: 'tc_offset',
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
			placeholder 	: '0',
			parent 		 	: tc_management_container
		})

	// preview button
		const button_preview = ui.create_dom_element({
			element_type 	: 'button',
			class_name 		: 'secondary button_preview',
			text_content 	: get_label['preview'] || "Preview",
			parent 			: tc_management_container
		})
		button_preview.addEventListener("click", () => {

			components_container.classList.add("loading")

			//TODO - add code to preview offset in the right part of the screen
			//alert("Add some code to show offset calculation in the right part of the screen")
				self.change_all_time_codes(false)

			components_container.classList.remove("loading")
		})

	// apply button
		const button_apply = ui.create_dom_element({
			element_type 	: 'button',
			class_name 		: 'warning button_apply',
			text_content 	: get_label['apply'] || "Apply",
			parent 			: tc_management_container
		})

		button_apply.addEventListener("click", (e) => {

			components_container.classList.add("loading")

			//TODO - add code to save offset to DB
				//alert("Add some code to save offset to DB")
				self.change_all_time_codes(true)
				//class.tool_tc.php --> call the function with true value to save
				//public function change_all_timecodes( $offset_seconds, $save=false )

			components_container.classList.remove("loading")
		})

	// response div
		const response_div = ui.create_dom_element({
			id				: 'response_div',
			element_type	: 'div',
			class_name 		: 'response_div',
			parent 			: tc_management_container
		})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end content_data_edit



/**
* ADD_COMPONENT
*/
export const add_component = async (self, component_container, value) => {

	// user select blank value case
		if (!value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(value)
	const node = await component.render()

	while (component_container.firstChild) {
		component_container.removeChild(component_container.firstChild)
	}
	component_container.appendChild(node)

	return true
};//end add_component
