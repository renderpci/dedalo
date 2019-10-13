// imports
	import event_manager from '../../../page/js/page.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_LANG
* Manages the component's logic and apperance in client side
*/
export const render_tool_lang = function() {

	return true
}//end render_tool_lang



/**
* RENDER_TOOL_LANG
* Render node for use like button
* @return DOM node
*/
render_tool_lang.prototype.edit = async function (options={
		render_level : 'full'
	}) {

	const self = this

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
		})

	// events
		// click
			wrapper.addEventListener("dblclick", function(e){
				e.stopPropagation()

				//change mode
				self.change_mode()

			})

	return wrapper
}//end render_tool_lang



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: content_data
		})

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})


	return content_data
}//end content_data_edit



/**
* LANG_SELECTOR
*/
const lang_selector = function(langs, selected_lang) {


}//end lang_selector






