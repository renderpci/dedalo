/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_pdf = function(component) {

	return true
}//end render_component_pdf



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_pdf.prototype.list = function(options) {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const value = data.value
		const url 	= DEDALO_CORE_URL + "/themes/default/pdf_icon.png"

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_pdf.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()
	const is_inside_tool = ui.inside_tool(self)

	// url
		const value 		= self.data.value
		const pdf_url 		= value[0].url || null
		const viewer_url 	= DEDALO_CORE_URL + '/component_pdf/html/component_pdf_viewer.php?pdf_url=' + pdf_url

	if (pdf_url) {

	// iframe
		const iframe = ui.create_dom_element({
			element_type	: "iframe",
			src 			: viewer_url,
			class_name 		: 'pdf_viewer_frame',
			parent 			: fragment
		})
		iframe.setAttribute('allowfullscreen',true)
	}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// tools
		if (!is_inside_tool) ui.add_tools(self, buttons_container)
		
	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit


