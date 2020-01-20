/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_svg = function(component) {

	return true
}//end render_component_svg



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_svg.prototype.list = function(options) {

	const self = this

	// value
		const value	= self.data.value || []

	const fragment = new DocumentFragment()

	// svg elements
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {

			const item_value = value[i]
			const url 		 = item_value.url

			const image = ui.create_dom_element({
				element_type	: "img",
				src 			: url,
				parent 			: fragment
			})
			ui.component.add_image_fallback(image)

			fragment.appendChild(image)
		}

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.appendChild(fragment)

	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_svg.prototype.edit = async function(options) {

	const self = this


	const render_level 	= options.render_level

	// content_data
		const current_content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// value (array)
		const value = self.data.value || []

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// svg elements
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			const svg_element = get_svg_element(value[i])
			inputs_container.appendChild(svg_element)
		}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button upload
		// if((self.mode==='edit' || self.mode==='edit_in_list') && !ui.inside_tool(self)){
		// 	const button_upload = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button upload',
		// 		parent 			: buttons_container
		// 	})
		// 	.addEventListener("click", function(e){
		// 		alert("To tool upload (not implemented yet)");
		// 	})
		// }

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)



	return content_data
}//end get_content_data_edit



/**
* GET_SVG_ELEMENT
* @return dom node image
*/
const get_svg_element = function(item_value) {

	const url = (typeof item_value==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : item_value.url

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			class_name 		: 'image svg_element',
			parent 			: li
		})
		image.setAttribute("tabindex", 0)
		ui.component.add_image_fallback(image)


	return li
}//end get_svg_element


