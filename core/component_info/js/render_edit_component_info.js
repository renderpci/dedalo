/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_INFO
* Manages the component's logic and apperance in client side
*/
export const render_edit_component_info = function() {

	return true
};//end render_edit_component_info



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_info.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// widgets load
		await self.get_widgets()

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// sort vars
		const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// values (inputs)
		const widgets			= self.ar_instances
		const widgets_length	= widgets.length
		for (let i = 0; i < widgets_length; i++) {
			const input_element_node = get_input_element_edit(i, widgets[i], self, is_inside_tool)
			inputs_container.appendChild(input_element_node)
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
const get_input_element_edit = async (i, current_widget, self) => {

	// const mode			= self.mode
	// const is_inside_tool	= self.is_inside_tool
	// const widget_name	= current_widget.widget
	// const widget_value	= current_widget.value

	await current_widget.build()
	const widget_node = await current_widget.render()

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	li.appendChild(widget_node)


	return li
};//end input_element
