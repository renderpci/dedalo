/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_edit_component_svg = function() {

	return true
};//end render_edit_component_svg



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_svg.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

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
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// value (array)
		const value = self.data.value || []

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// svg elements
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			const svg_element = get_svg_element(value[i])
			inputs_container.appendChild(svg_element)
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
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
};//end get_buttons



/**
* GET_SVG_ELEMENT
* @param object item_value
* @return DOM node li
*/
const get_svg_element = function(item_value) {

	const url = (typeof item_value==="undefined")
		? DEDALO_CORE_URL + "/themes/icons/dedalo_icon_grey.svg"
		: item_value.url

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src				: url,
			class_name		: 'image svg_element',
			parent			: li
		})
		image.setAttribute("tabindex", 0)
		ui.component.add_image_fallback(image)
		// li.appendChild(image)


	return li
};//end get_svg_element


