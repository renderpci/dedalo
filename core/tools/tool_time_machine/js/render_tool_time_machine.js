/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_tool_time_machine
* Manages the component's logic and apperance in client side
*/
export const render_tool_time_machine = function() {

	return true
}//end render_tool_time_machine



/**
* RENDER_tool_time_machine
* Render node for use like button
* @return DOM node
*/
render_tool_time_machine.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

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
		ui.tool.attach_to_modal(wrapper, self)

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
}//end render_tool_time_machine



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// section
		const section = await self.load_section()

		const section_node = await section.render()
		fragment.appendChild(section_node)

	// section container
		// const section_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'section_container',
		// 	parent 			: fragment
		// })


	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'buttons_container',
		// 	parent 			: components_container
		// })


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



// /**
// * ADD_COMPONENT
// */
// export const add_component = async (self, component_container, value) => {

// 	// user select blank value case
// 		if (!value) {
// 			while (component_container.firstChild) {
// 				// remove node from dom (not component instance)
// 				component_container.removeChild(component_container.firstChild)
// 			}
// 			return false
// 		}

// 	const component = await self.load_component(value)
// 	const node = await component.render()

// 	while (component_container.firstChild) {
// 		component_container.removeChild(component_container.firstChild)
// 	}
// 	component_container.appendChild(node)

// 	return true
// }//end add_component

