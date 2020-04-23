/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_UPLOAD
* Manages the component's logic and apperance in client side
*/
export const render_tool_pdf_extractor = function() {

	return true
}//end render_tool_pdf_extractor



/**
* RENDER_TOOL_upload
* Render node for use like button
* @return DOM node
*/
render_tool_pdf_extractor.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// // buttons container
	// 	const buttons_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'buttons_container',
	// 		parent 			: wrapper
	// 	})


	// tool_container
		//const tool_container = document.getElementById('tool_container')
		//if(tool_container!==null){
		//	tool_container.appendChild(wrapper)
		//}else{
		//	const main = document.getElementById('main')
		//	const new_tool_container = ui.create_dom_element({
		//		id 				: 'tool_container',
		//		element_type	: 'div',
		//		parent 			: main
		//	})
		//	new_tool_container.appendChild(wrapper)
		//}

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			self.destroy(true, true, true)
		}

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
}//end render_tool_pdf_extractor



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {


	const fragment = new DocumentFragment()


	// range page
		const page_range = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_in',
			text_content 	: '',
			parent 			: fragment
		})

		// page_in
			const page_in = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				class_name		: 'page_in',
				text_content 	: '',
				parent 			: page_range
			})
		// page_out
			const page_out = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				class_name		: 'page_out',
				text_content 	: '',
				parent 			: page_range
			})





	// response_container
		const response_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_container',
			parent 			: fragment
		})
		// response_msg
		const response_msg = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_msg',
			parent 			: response_container
		})

	// info
		// container info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'info',
			// text_content 	: '',
			parent 			: fragment
		})
		// caller component
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>Caller component</label>' + self.caller.model,
			parent 			: info
		})



	// // buttons container
	// 	const buttons_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'buttons_container',
	// 		parent 			: components_container
	// 	})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data
