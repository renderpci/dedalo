/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_INFO
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_info = function() {

	return true
}//end view_default_edit_info



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
view_default_edit_info.render = async function(self, options) {

	// options
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
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// sort vars
		// const is_inside_tool = self.is_inside_tool

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const widgets			= self.ar_instances
		const widgets_length	= widgets.length
		for (let i = 0; i < widgets_length; i++) {
			const content_value = get_content_value(i, widgets[i])
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, current_widget) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value ' + 'widget_item_' + current_widget.name
		})

	// widget
		current_widget.build()
		.then(async function(){
			const widget_node = await current_widget.render()
			content_value.appendChild(widget_node)
		})


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
