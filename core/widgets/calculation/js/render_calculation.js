/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'


/**
* RENDER_COMPONENT_CALCULATION
* Manage the components logic and appearance in client side
*/
export const render_calculation = function(component) {

	return true
}//end render_calculation



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_calculation.prototype.list = async function() {

	const self = this

	// short vars
		const data 		= self.data
		const value 	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string


	return wrapper
}//end list


/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_calculation.prototype.edit = async function(options) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value===null || self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})

	// events
		// add_events(self, wrapper)

	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	// sort vars
		const value 		= self.data.value
		const mode 			= self.mode
		const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_edit(i, inputs_value[i], inputs_container, self, is_inside_tool)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element_edit = (i, current_value, inputs_container, self) => {

	const mode 		 		 = self.mode
	const multi_line 		 = (self.context.properties && self.context.properties.hasOwnProperty('multi_line')) ? self.context.properties.multi_line : false
	const element_type 		 = (multi_line===true) ? 'textarea' :'input'
	const is_inside_tool 	 = self.is_inside_tool
	const with_lang_versions = self.context.properties.with_lang_versions || false
		console.log("with_lang_versions:",with_lang_versions);

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: element_type,
			type 		 	: 'text',
			class_name 		: 'input_value',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: li
		})

	// button remove
		if((mode==='edit' || 'edit_in_list') && !is_inside_tool){
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button remove hidden_button',
				dataset			: { key : i },
				parent 			: li
			})
		}

	return li
}//end input_element



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
