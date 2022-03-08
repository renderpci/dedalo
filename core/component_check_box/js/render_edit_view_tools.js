/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_buttons,
		add_events
	} from './render_edit_component_check_box.js'



/**
* RENDER_EDIT_VIEW_tools
* Manage the components logic and appearance in client side
*/
export const render_edit_view_tools = function() {

	return true
};//end render_edit_view_tools



/**
* RENDER
* Render node for use in edit
* @return DOM node
*/
render_edit_view_tools.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		wrapper.classList.add('view_'+self.context.view)

	// events
		add_events(self, wrapper)

	return wrapper
};//end render



/**
* GET_CONTENT_DATA_EDIT
* @return
*/
const get_content_data_edit = function(self) {

	const datalist = self.data.datalist || []

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		// build options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element_edit(i, datalist[i], self)
			inputs_container.appendChild(input_element)
		}

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

		content_data.classList.add("nowrap")
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM node li
*/
const get_input_element_edit = (i, current_value, self) => {

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const datalist_value	= datalist_item.value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// input checkbox
		const option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			id 				: self.id +"_"+ i,
			dataset 	 	: { key : i },
			value 			: JSON.stringify(datalist_value),
			parent 			: li
		})
		// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					option.checked = 'checked'
			}
		}

	// label
		const label_parts	= label.split(' | ')
		const tool_label	= label_parts[0]
		const tool_name		= label_parts[1]
		const label_string	= (SHOW_DEBUG===true) ? tool_label + ` [${tool_name} - ${section_id}]` : tool_label
		const option_label	= ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		option_label.setAttribute("for", self.id +"_"+ i)

	// tool_icon
		const icon_url = DEDALO_TOOLS_URL + '/' + tool_name + '/img/icon.svg'
		const tool_icon	= ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'tool_icon',
			src				: icon_url
		})
		li.prepend(tool_icon)

	return li
};//end get_input_element_edit


