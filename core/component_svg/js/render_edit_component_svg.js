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
}//end render_edit_component_svg



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
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
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const value		= data.value || []
		// const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values iterate (one or zero is expected)
		const inputs_value	= value.length>0 ? value : [null]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = function(i, value, self) {

	// short vars
		const datalist	= self.data.datalist || []
		const quality	= self.quality || self.context.quality

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// media url from data.datalist based on selected context quality
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
		const url		= file_info
			? file_info.url
			: null

	// svg item
		if (url) {
			// image
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image svg_element',
				src				: url,
				parent			: content_value
			})
			image.setAttribute('tabindex', 0)
		}

	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// buttons tools
		ui.add_tools(self, fragment)

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
}//end get_buttons



/**
* GET_SVG_ELEMENT
* @param object item_value
* @return DOM node li
*/
	// const get_svg_element = function(item_value) {

	// 	const url = (typeof item_value==="undefined")
	// 		? DEDALO_CORE_URL + "/themes/icons/dedalo_icon_grey.svg"
	// 		: item_value.url

	// 	// media url from data.datalist based on selected context quality
	// 		// const quality	= self.quality || self.context.quality
	// 		// const file_info	= self.data.datalist.find(el => el.quality===quality)
	// 		// const url		= file_info
	// 		// 	? file_info.url
	// 		// 	: null

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type : 'li'
	// 		})

	// 	// image
	// 		const image = ui.create_dom_element({
	// 			element_type	: "img",
	// 			src				: url,
	// 			class_name		: 'image svg_element',
	// 			parent			: li
	// 		})
	// 		image.setAttribute("tabindex", 0)
	// 		// ui.component.add_image_fallback(image)


	// 	return li
	// }//end get_svg_element


