/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_TC
* Manages the component's logic and apperance in client side
*/
export const render_tool_tc = function() {

	return true
}//end render_tool_tc



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

	// modal container
		ui.tool.attach_to_modal(wrapper, self)

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

	// source lang select
		const source_select_lang = lang_selector(self.langs, self.source_lang, 'source_lang')
			
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

	// source on_change
		source_select_lang.addEventListener('change', async (e) => {
			e.stopPropagation()
			add_component(self, source_component_container, e.target.value)
			add_component(self, target_component_container, e.target.value)
		})

	// source default value check
		if (source_select_lang.value) {
			add_component(self, source_component_container, source_select_lang.value)
			add_component(self, target_component_container, source_select_lang.value)
		}


	//Language selection and time codes management container
		const tc_management_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'automatic_translation_container',
			parent 			: components_container
		})

	tc_management_container.appendChild(source_select_lang)

	// input text Offset in seconds
		const input = ui.create_dom_element({
			id				: 'tc_offset',
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',			
			parent 		 	: tc_management_container
		})

	// preview button
	const button_preview = document.createElement('button');
		  button_preview.type = 'button'
		  button_preview.textContent = get_label['preview'] || "Preview"
		  tc_management_container.appendChild(button_preview)
		  button_preview.addEventListener("click", (e) => {

		  	components_container.classList.add("loading")

		  	//TODO - add code to preview offset in the right part of the screen
		  	//alert("Add some code to show offset calculation in the right part of the screen")
		  		self.change_all_time_codes(false)
		  	
		  		components_container.classList.remove("loading")		  	
		  })

	// apply button
	const button_apply = document.createElement('button');
		  button_apply.type = 'button'
		  button_apply.textContent = get_label['apply'] || "Apply"
		  tc_management_container.appendChild(button_apply)
		  button_apply.addEventListener("click", (e) => {

		  	components_container.classList.add("loading")

		  	//TODO - add code to save offset to DB
		  		//alert("Add some code to save offset to DB")
		  		self.change_all_time_codes(true)
		  		//class.tool_tc.php --> call the function with true value to save
		  		//public function change_all_timecodes( $offset_seconds, $save=false )		  
		  		components_container.classList.remove("loading")
		  })

	//response div
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
}//end content_data_edit



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
}//end add_component



/**
* LANG_SELECTOR
*/
const lang_selector = function(langs, selected_lang, class_name='') {

	// components container
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: class_name
		})

		const option = ui.create_dom_element({
				element_type	: 'option',
				value 			: null,
				text_content 	: '',
				parent 			: select
			})

		const length = langs.length
		for (let i = 0; i < length; i++) {

			const lang = langs[i]
			const option = ui.create_dom_element({
				element_type	: 'option',
				value 			: lang.value,
				text_content 	: lang.label,
				parent 			: select
			})

			// selected options set on match
			if (lang.value === selected_lang) {
				option.selected = true
			}
		}

	return select
}//end lang_selector