/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_IMAGE
* Manage the components logic and appearance in client side
*/
export const render_edit_component_image = function() {

	return true
};//end render_edit_component_image



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_image.prototype.edit = async function(options) {

	const self = this

	// render_level
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
			content_data : content_data,
			buttons 	 : buttons
		})

	// quality
		const quality = get_quality_selector(self)
		wrapper.appendChild(quality)


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// const is_inside_tool = ui.inside_tool(self)

	const fragment = new DocumentFragment()

	// url
		const datalist		= self.data.datalist
		const quality		= page_globals.dedalo_image_quality_default // '1.5MB'
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= url_object.url // '/dedalo/media/media_development/image/original/test175_test65_4.jpg' // (typeof url_object==='undefined') ? DEDALO_CORE_URL + '/themes/default/0.jpg' : url_object.url

	// ul
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			parent			: ul
		})

	// image. Only to get background color (!)
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name 		: 'hidden'
		})
	// image background color
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener('load', set_bg_color, false)
			ui.set_background_image(this, li)
			image.classList.remove('hidden')
		}
		image.src = url


	// object <object type="image/svg+xml" data="image.svg"></object>
		const object = ui.create_dom_element({
			element_type	: 'object',
			class_name		: 'image',
			parent			: li
		})
		object.type = "image/svg+xml"
		if (self.data.base_svg_url) {
			object.data = self.data.base_svg_url
		}

		self.object_node = object

	// change event
		const image_change_event = event_manager.subscribe('image_quality_change_'+self.id, img_quality_change)
		self.events_tokens.push(image_change_event)
		object.dataset.image_change_event = image_change_event // string like 'event_167'
		function img_quality_change (img_src) {

			// svg document inside the object tag
			const svg_doc 	= object.contentDocument;
			// Get one of the svg items by ID;
			const image 	= svg_doc.querySelector('image')
			// set the new source to the image node into the svg
			self.img_src 	= image.setAttributeNS('http://www.w3.org/1999/xlink','href',img_src)

			// add spinner when new image is loading
			li.classList.add('preload')
			image.addEventListener('load', function(){
				li.classList.remove("preload")
			})
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)



	return content_data
};//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			title			: 'Fullscreen',
			parent 			: fragment
		})
		button_full_screen.addEventListener("mouseup", () =>{
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
			title 			: 'Toggle vector editor',
			parent 			: fragment
		})
		vector_editor.addEventListener("mouseup", () => {
			vector_editor_tools.classList.toggle('hide')
			if(!vector_editor_tools.classList.contains('hide')){
				self.load_vector_editor({load:'full'})
			}
			// set wrapper as wide mode (100%)
				// self.node[0].classList.add('wide')
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
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
};//end get_buttons



/**
* GET_QUALITY_SELECTOR
* @return DOM node select
*/
const get_quality_selector = (self) => {

	// short vars
		const data = self.data

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

		const quality_list		= data.datalist.filter(el => el.file_exist===true && el.quality!=='thumb')
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {
			//create the node with the all qualities sended by server
			const quality = ui.create_dom_element({
				element_type	: 'option',
				class_name 		: 'quality',
				value 			: (typeof quality_list[i].url==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : quality_list[i].url,
				parent			: quality_selector,
				text_node 		: quality_list[i].quality
			})
			//set the default quality_list to config variable dedalo_image_quality_default
			quality.selected = quality_list[i].quality===page_globals.dedalo_image_quality_default ? true : false
		}

	return quality_selector
};//end get_quality_selector


