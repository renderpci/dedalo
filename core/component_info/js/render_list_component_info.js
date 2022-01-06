/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	}
	from '../../component_info/js/render_edit_component_info.js'


/**
* render_list_component_info
* Manages the component's logic and apperance in client side
*/
export const render_list_component_info = function() {

	return true
};//end render_list_component_info



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_list_component_info.prototype.list = async function() {

	const self = this

	// widgets load
		await self.get_widgets()

	// short vars
		const content_data = get_content_data_edit(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Set value
		wrapper.appendChild(content_data)


	return wrapper
};//end list



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
	// const get_content_data_edit = function(self) {

	// 	// sort vars
	// 		const is_inside_tool = self.is_inside_tool

	// 	const fragment = new DocumentFragment()

	// 	// inputs container
	// 		const inputs_container = ui.create_dom_element({
	// 			element_type	: 'ul',
	// 			class_name		: 'inputs_container',
	// 			parent			: fragment
	// 		})

	// 	// values (inputs)
	// 		const widgets			= self.ar_instances
	// 		const widgets_length	= widgets.length
	// 		for (let i = 0; i < widgets_length; i++) {
	// 			const input_element_node = get_input_element_edit(i, widgets[i], self, is_inside_tool)
	// 			inputs_container.appendChild(input_element_node)
	// 		}

	// 	// content_data
	// 		const content_data = ui.component.build_content_data(self)
	// 			  content_data.appendChild(fragment)


	// 	return content_data
	// };//end get_content_data_edit



/**
* INPUT_ELEMENT
* @return DOM node li
*/
	// const get_input_element_edit = async (i, current_widget, self) => {

	// 	// const mode			= self.mode
	// 	// const is_inside_tool	= self.is_inside_tool
	// 	// const widget_name	= current_widget.widget
	// 	// const widget_value	= current_widget.value

	// 	await current_widget.build()
	// 	const widget_node = await current_widget.render()

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type : 'li'
	// 		})

	// 	li.appendChild(widget_node)


	// 	return li
	// };//end input_element
