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

	// render_level
		const render_level = options.render_level

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


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// url
		const value 	= self.data.value
		const pdf_url 	= value[0].url || null
		const viewer_url= DEDALO_CORE_URL + '/component_pdf/html/component_pdf_viewer.php?pdf_url=' + pdf_url

	// iframe
		if (pdf_url) {
			const iframe = ui.create_dom_element({
				element_type	: "iframe",
				src 			: viewer_url,
				class_name 		: 'pdf_viewer_frame',
				parent 			: fragment
			})
			iframe.setAttribute('allowfullscreen',true)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		button_full_screen.addEventListener("mouseup", (e) =>{
			self.node[0].classList.toggle('fullscreen')
			const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
