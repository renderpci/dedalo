/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'



/**
* VIEW_DEFAULT_EDIT_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_default_edit_image = function() {

	return true
}//end view_default_edit_image



/**
* RENDER
* Render node for use in current mode and view
* @return DOM node wrapper
*/
view_default_edit_image.render = function(self, options) {

	// options
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
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (images)
		const inputs_value	= (value.length>0) ? value : [null] // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = function(i, value, self) {

	// short vars
		const quality	= self.quality || self.context.quality
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// file_info
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)


	// render the image when the source is external, image from URI
		if(file_info && file_info.external){
			const img_node = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image',
				parent			: content_value,
				src 			: file_info.file_url
			})
			return content_value
		}

	// render de image in Dédalo media
		let url = file_info && file_info.file_url
			? file_info.file_url
			: null // DEDALO_CORE_URL + '/themes/default/0.jpg'

		// fallback to default (when not already in default)
		if (!url && quality!==self.context.default_quality) {
			const file_info_dq	= datalist.find(el => el.quality===self.context.default_quality && el.file_exist===true)
			url = file_info_dq
				? file_info_dq.file_url
				: null
			if (url) {
				// change the quality
				self.quality = self.context.default_quality
			}
		}

	// image. (!) Only to get background color and apply to li node
		const bg_reference_image_url = url || page_globals.fallback_image
		if (bg_reference_image_url) {
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name 		: 'hide'
			})
			// image background color
			image.addEventListener('load', set_bg_color, false)
			function set_bg_color() {
				this.removeEventListener('load', set_bg_color, false)
				ui.set_background_image(this, content_value)
				image.classList.remove('hide')
			}
			// image.addEventListener('error', function(){
			// 	console.warn('Error on load image:', bg_reference_image_url, image);
			// }, false)
			image.src = bg_reference_image_url
		}

	// object_node <object type="image/svg+xml" data="image.svg"></object>
		const object_node = ui.create_dom_element({
			element_type	: 'object',
			class_name		: 'image',
			parent			: content_value
		})
		object_node.type = "image/svg+xml"

		if (data.base_svg_url) {
			// svg file already exists
			object_node.data = data.base_svg_url
		}else{
			// fallback to default svg file
			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
			const base_svg_url_default	= page_globals.fallback_image.substr(0, page_globals.fallback_image.lastIndexOf('.')) + '.svg'
			object_node.data			= base_svg_url_default
			content_value.addEventListener('mouseup', function(e) {
				e.stopPropagation();
				// tool_upload. Get the tool context to be opened
				const tool_upload = self.tools.find(el => el.model==='tool_upload')
				// open_tool (tool_common)
				open_tool({
					tool_context	: tool_upload,
					caller			: self
				})
			})
		}
		// set pointer
		self.object_node = object_node

		// auto-change url the first time
		object_node.onload = async function() {
			if (quality!==self.context.default_quality) {
				await fn_img_quality_change(url)
			}
			content_value.classList.remove('hide')
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
				content_value.classList.add('loading')
				image_node.addEventListener('load', function(){
					content_value.classList.remove('loading')
				})

				// no load case (example: original tiff files)
				image_node.addEventListener('error', function(){
					content_value.classList.remove('loading')
				})

				// set the new source to the image node into the svg
				image_node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', img_src)
			}

			return true
		}

	// quality_selector
		const quality_selector = get_quality_selector(self)
		content_value.appendChild(quality_selector)


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// button_fullscreen
		const button_fullscreen = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button full_screen',
			title			: 'Fullscreen',
			parent			: fragment
		})
		// button_fullscreen.addEventListener('mouseup', () =>{
		// 	self.node.classList.toggle('fullscreen')
		// 	const fullscreen_state = self.node.classList.contains('fullscreen') ? true : false
		// 	event_manager.publish('full_screen_'+self.id, fullscreen_state)
		// })
		button_fullscreen.addEventListener('click', function() {
			ui.enter_fullscreen(self.node)
		})

	// buttons tools
		ui.add_tools(self, fragment)

	// open svg editor tools
		const vector_editor = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button vector_editor',
			title			: 'Toggle vector editor',
			parent			: fragment
		})
		vector_editor.addEventListener('mouseup', () => {
			vector_editor_tools.classList.toggle('hide')
			if(!vector_editor_tools.classList.contains('hide')){
				self.load_vector_editor({load:'full'})
			}
			// set wrapper as wide mode (100%)
				// self.node.classList.add('wide')
		})

	// svg editor tools
		const vector_editor_tools = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'vector_editor_tools hide',
			parent			: fragment
		})
		self.vector_editor_tools = vector_editor_tools

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		// const buttons_fold = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'buttons_fold',
		// 	parent			: buttons_container
		// })
		// buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_QUALITY_SELECTOR
* @return DOM node select
*/
const get_quality_selector = (self) => {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		const quality	= self.quality || self.context.quality

	const fragment = new DocumentFragment()

	// create the quality selector
		const quality_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'quality_selector',
			parent			: fragment
		})
		quality_selector.addEventListener('change', (e) =>{
			const img_src = e.target.value
			event_manager.publish('image_quality_change_'+self.id, img_src)
		})

		const quality_list		= datalist.filter(el => el.file_exist===true)
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {
			// create the node with the all qualities sended by server
			const value = (typeof quality_list[i].file_url==='undefined')
				? DEDALO_CORE_URL + '/themes/default/0.jpg'
				: quality_list[i].file_url

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
}//end get_quality_selector
