/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_image = function(component) {

	return true
}//end render_component_image



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_image.prototype.list = function(options) {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const value 			= data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= (typeof url_object==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})
		ui.component.add_image_fallback(image)

	//const image_div = ui.create_dom_element({
	//	element_type	: "div",
	//	//class_name		: node_class_name,
	//	style 			: {
	//		"background-image" : "url("+url+")"
	//	},
	//	parent 			: wrapper
	//})


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_image.prototype.edit = async function(options) {

	const self = this


	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
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
const content_data_edit = async function(self) {

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// url
		const value 			= self.data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= url_object.url // (typeof url_object==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : url_object.url

	// ul
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: '',
			parent 			: fragment
		})

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name 		: '',
			parent 			: ul
		})

	// canvas
		const canvas = ui.create_dom_element({
			id 				: self.id,
			element_type	: "canvas",
			class_name 		: 'image',
			parent 			: li
		})

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			class_name 		: 'image',
			// parent 			: canvas
		})
		image.setAttribute("tabindex", 0)
		ui.component.add_image_fallback(image)

		self.init_canvas(li, canvas, image)
	
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

		

			  	// console.log("content_data:",content_data);

	// event_manager.subscribe('render_'+self.id, (node) => {
	// event_manager.subscribe('render_instance', (node) => {	
	// 	if (node.id==='page_list_lg-eng') {
	// 		console.log("node ++++++:",node);
	// 		const h = content_data.getBoundingClientRect() 
	// 		console.log("h:",h);
	// 	}
		
		// setTimeout(()=>{
		// 	const h = node.getBoundingClientRect() 
		// 	console.log("h:",h);
		// },1000)
		
	// })

	return content_data
}//end content_data_edit


