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
		const datalist 	= self.data.datalist

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		// const value 			= data.value
		const quality 			= "1.5MB"
		const url_object 		= datalist.filter(item => item.quality===quality)[0]
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

	// render_level
		const render_level = options.render_level

	// content_data
		const content_data = await content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)
	// quality
		const quality = get_quality_selector(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})
		wrapper.appendChild(quality)


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const is_inside_tool = ui.inside_tool(self)

	const fragment = new DocumentFragment()


	// url
		const datalist 			= self.data.datalist
		const quality 			= "1.5MB" //"original" //
		const url_object 		= datalist.filter(item => item.quality===quality)[0]
		const url 				= url_object.url // '/dedalo/media/media_development/image/original/test175_test65_4.jpg' // (typeof url_object==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : url_object.url

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
		// const canvas = ui.create_dom_element({
		// 	id 				: self.id,
		// 	element_type	: "canvas",
		// 	class_name 		: 'canvas',
		// 	parent 			: li
		// })
		// canvas.setAttribute("tabindex", 0)

	// image
	// 	const image = ui.create_dom_element({
	// 		element_type	: "img",
	// 		src 			: self.data.base_svg_url,
	// 		class_name 		: 'image',
	// 		parent 			: li
	// 	})
	// 	image.setAttribute("tabindex", 0)
	// 	// ui.component.add_image_fallback(image)
	// console.log("image:",image);
	// 	self.image_node = image

	// 	image.onload = function () {

	// 		const svg_image = image.querySelector('image')
	// 		console.log(svg_image)
	// 	}

		// opbject <object type="image/svg+xml" data="image.svg"></object>
			const object = ui.create_dom_element({
				element_type	: "object",
				class_name 		: 'image',
				parent 			: li
			})
			object.type = "image/svg+xml"
			object.data = self.data.base_svg_url

			self.object_node = object

		// image.onload = function () {
		// 	self.init_canvas(canvas, image)
		// }

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

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



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// full_screen
		const full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		full_screen.addEventListener("mouseup", (e) =>{
			self.node[0].classList.toggle('fullscreen')
			const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// open svg editor tools
		const vector_editor = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button vector_editor',
			parent 			: fragment
		})
		vector_editor.addEventListener("mouseup", (e) =>{
			vector_editor_tools.classList.toggle('hide')
			if(!vector_editor_tools.classList.contains('hide')){
				self.load_vector_editor({load:'full'})
			}
		})

	// svg editor tools
		const vector_editor_tools = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'vector_editor_tools hide',
			parent 			: fragment
		})
		self.vector_editor_tools = vector_editor_tools

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons


/**
* GET_QUALITY_SELECTOR
* @return
*/
const get_quality_selector = (self) => {

	// Options vars
		const context 	= self.context
		const data 		= self.data

		const fragment = new DocumentFragment()

	// create the quality selector
		const quality_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: 'quality_selector',
			parent			: fragment
		})
		quality_selector.addEventListener("change", (e) =>{
			const img_src = e.target.value
			event_manager.publish('image_quality_change_'+self.id, img_src)
		})

		const datalist 	= data.datalist
		const datalist_len = datalist.length
		for (let i = 0; i < datalist_len; i++) {
			//create the node with the all qualities sended by server
			const quality = ui.create_dom_element({
				element_type	: 'option',
				class_name 		: 'quality',
				value 			: (typeof datalist[i].url==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : datalist[i].url,
				parent			: quality_selector,
				text_node 		: datalist[i].quality
			})
			//set the default datalist to config variable dedalo_image_quality_default
			quality.selected = datalist[i].quality===page_globals.dedalo_image_quality_default ? true : false
		}

	return quality_selector
};//end get_quality_selector
