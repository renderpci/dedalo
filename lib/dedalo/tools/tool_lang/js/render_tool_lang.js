// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



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
render_tool_lang.prototype.button = async function() {

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data

	// Value as string
		const value_string = data.value.join(' | ')

	// Node create
		const wrapper = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	//event
		// click
			wrapper.addEventListener("dblclick", function(e){
				e.stopPropagation()

				//change mode
				self.change_mode()

			})

	return wrapper
}//end render_tool_lang

