/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_COMPONENT_INFO
* Manages the component's logic and apperance in client side
*/
export const render_component_info = function() {

	return true
};//end render_component_info


/**
* LIST
* Render node to be used by service autocomplete or any datalist
* @return DOM node wrapper
*/
render_component_info.prototype.mini = async function() {

	const self = this

	// short vars
		const data 		= self.data
		const value 	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string


	return wrapper
};//end mini


/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_component_info.prototype.list = async function() {

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
};//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_info.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		// self.data.value = (self.data.value.length<1) ? [null] : self.data.value

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
};//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	// sort vars
		const mode 			= self.mode
		const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// widgets
	 	await self.get_widgets()

	// values (inputs)
		const widgets 			= self.ar_instances
		const widgets_length 	= widgets.length
		for (let i = 0; i < widgets_length; i++) {
			get_input_element_edit(i, widgets[i], inputs_container, self, is_inside_tool)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



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
};//end get_buttons



/**
* INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element_edit = async (i, current_widget, inputs_container, self) => {

	const mode 		 		 = self.mode
	const is_inside_tool 	 = self.is_inside_tool

	const widget_name 	= current_widget.widget
	const widget_value 	= current_widget.value

	const widget_node = await current_widget.render()

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	li.appendChild(widget_node)


	return li
};//end input_element
