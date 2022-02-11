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

	// quality_selector
		// const quality_selector = get_quality_selector(self)
		// wrapper.appendChild(quality_selector)


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const fragment = new DocumentFragment()

	// url
		let url
		const quality	= self.quality || self.context.quality
		const datalist	= self.data.datalist
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
		url = file_info
			? file_info.url
			: null // DEDALO_CORE_URL + '/themes/default/0.jpg'

	// fallback to default (when not already in default)
		if (!url && quality!==self.context.default_quality) {
			const file_info	= datalist.find(el => el.quality===self.context.default_quality && el.file_exist===true)
			url = file_info
				? file_info.url
				: null
			if (url) {
				// change the quality
				self.quality = self.context.default_quality
			}
		}


	// ul inputs container
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name 		: '',
			parent			: ul
		})

	// image. (!) Only to get background color and apply to li node
		if (url) {
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name 		: 'hide'
			})
			// image background color
			image.addEventListener('load', set_bg_color, false)
			function set_bg_color() {
				this.removeEventListener('load', set_bg_color, false)
				ui.set_background_image(this, li)
				image.classList.remove('hide')
			}
			image.src = url
		}

	// object_node <object type="image/svg+xml" data="image.svg"></object>
		const object_node = ui.create_dom_element({
			element_type	: 'object',
			class_name		: 'image',
			parent			: li
		})
		object_node.type = "image/svg+xml"
		if (self.data.base_svg_url) {
			object_node.data = self.data.base_svg_url
		}
		self.object_node = object_node

		// autochange the first time
		object_node.onload = async function() {
			if (quality!==self.context.default_quality) {
				await fn_img_quality_change(url)
			}
			li.classList.remove('hide')
		}

	// change event
		const image_change_event = event_manager.subscribe('image_quality_change_'+self.id, fn_img_quality_change)
		self.events_tokens.push(image_change_event)
		object_node.dataset.image_change_event = image_change_event // string like 'event_167'
		async function fn_img_quality_change (img_src) {

			self.img_src = img_src

			// svg document inside the object_node tag
			const svg_doc 	= object_node.contentDocument;
			// Get one of the svg items by ID;
			const image_node = svg_doc
				? await svg_doc.querySelector('image')
				: null

			// self.img_src = image.setAttributeNS('http://www.w3.org/1999/xlink','href',img_src)
			if (image_node) {

				// add spinner when new image is loading
				li.classList.add('loading')
				image_node.addEventListener('load', function(){
					li.classList.remove("loading")
				})

				// set the new source to the image node into the svg
				await image_node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', img_src)
			}

			return true
		}


	// quality_selector
		const quality_selector = get_quality_selector(self)
		fragment.appendChild(quality_selector)

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
		const data		= self.data
		const quality	= self.quality || self.context.quality

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

		const quality_list		= data.datalist.filter(el => el.file_exist===true)
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {
			// create the node with the all qualities sended by server
			const value = (typeof quality_list[i].url==="undefined")
				? DEDALO_CORE_URL + "/themes/default/0.jpg"
				: quality_list[i].url

			const select_option = ui.create_dom_element({
				element_type	: 'option',
				value			: value,
				text_node		: quality_list[i].quality,
				parent			: quality_selector
			})
			//set the default quality_list to config variable dedalo_image_quality_default
			select_option.selected = quality_list[i].quality===quality ? true : false
		}


	return quality_selector
};//end get_quality_selector


