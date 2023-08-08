// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {get_quality_selector} from './render_edit_component_image.js'



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
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_image.render = function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons,
			add_styles		: ['media_wrapper'] // common media classes
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to crate label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		// common media classes
		content_data.classList.add('media_content_data')

	// values (images)
		const inputs_value	= value
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param object value
* @object self
* @return HTMLElement content_value
*/
const get_content_value = function(i, value, self) {

	// short vars
		const quality	= self.quality || self.context.features.quality
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value'
		})

	// file_info
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)


	// render the image when the source is external, image from URI
		if(file_info && file_info.external){
			const image_external_node = render_image_external(file_info.file_url)
			content_value.appendChild(image_external_node)

			return content_value
		}

	// render image node
		const image_node = render_image_node(self, file_info, content_value)
		content_value.appendChild(image_node)

	// quality_selector
		const quality_selector = get_quality_selector(self)
		content_value.appendChild(quality_selector)


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @param int i
* @param object value
* @object self
* @return HTMLElement content_value
*/
	// const get_content_value_read = function(i, value, self) {

	// 	// short vars
	// 		const quality	= self.quality || self.context.features.quality
	// 		const data		= self.data || {}
	// 		const datalist	= data.datalist || []

	// 	// content_value
	// 		const content_value = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'content_value read_only'
	// 		})

	// 	// file_info
	// 		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)

	// 	// render the image when the source is external, image from URI
	// 		if(file_info && file_info.external) {

	// 			const img_node = render_image_external(file_info.file_url)
	// 			content_value.appendChild(img_node)

	// 			return content_value
	// 		}

	// 	// render de image in Dédalo media

	// 	// url
	// 		let url = file_info && file_info.file_url
	// 			? file_info.file_url
	// 			: null // DEDALO_CORE_URL + '/themes/default/0.jpg'
	// 		// fallback to default (when not already in default)
	// 		if (!url && quality!==self.context.features.default_quality) {
	// 			const file_info_dq	= datalist.find(el => el.quality===self.context.features.default_quality && el.file_exist===true)
	// 			url = file_info_dq
	// 				? file_info_dq.file_url
	// 				: null
	// 			if (url) {
	// 				// change the quality
	// 				self.quality = self.context.features.default_quality
	// 			}
	// 		}

	// 	// image. (!) Only to get background color and apply to li node
	// 		const bg_reference_image_url = url || page_globals.fallback_image
	// 		if (bg_reference_image_url) {
	// 			const image = ui.create_dom_element({
	// 				element_type	: 'img',
	// 				class_name 		: 'hide'
	// 			})
	// 			// image background color
	// 			image.addEventListener('load', set_bg_color, false)
	// 			function set_bg_color() {
	// 				this.removeEventListener('load', set_bg_color, false)
	// 				ui.set_background_image(this, content_value)
	// 				image.classList.remove('hide')
	// 			}
	// 			// image.addEventListener('error', function(){
	// 			// 	console.warn('Error on load image:', bg_reference_image_url, image);
	// 			// }, false)
	// 			image.src = bg_reference_image_url
	// 		}

	// 	// object_node <object type="image/svg+xml" data="image.svg"></object>
	// 		const object_node = ui.create_dom_element({
	// 			element_type	: 'object',
	// 			class_name		: 'image',
	// 			parent			: content_value
	// 		})
	// 		object_node.type = "image/svg+xml"

	// 		if (data.base_svg_url) {
	// 			// svg file already exists
	// 			object_node.data = data.base_svg_url
	// 		}else{
	// 			// fallback to default svg file
	// 			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
	// 			const base_svg_url_default	= page_globals.fallback_image.substr(0, page_globals.fallback_image.lastIndexOf('.')) + '.svg'
	// 			object_node.data			= base_svg_url_default
	// 		}
	// 		// set pointer
	// 		self.object_node = object_node

	// 		// auto-change url the first time
	// 		object_node.onload = async function() {
	// 			if (quality!==self.context.features.default_quality) {
	// 				await fn_img_quality_change(url)
	// 			}
	// 			content_value.classList.remove('hide')
	// 		}


	// 	return content_value
	// }//end get_content_value_read



/**
* RENDER_IMAGE_EXTERNAL
* @param object file_info
* @return HTMLElement image_external_node
*/
const render_image_external = function(file_url) {

	const image_external_node = ui.create_dom_element({
		element_type	: 'img',
		class_name		: 'image',
		src 			: file_url
	})


	return image_external_node
}//end render_image_external



/**
* RENDER_IMAGE_NODE
* Creates an object of type 'image/svg+xml' with svg file and image
* cropped by the svg
* @param object self
* @param object file_info
* @return HTMLElement object_node
*/
const render_image_node = function(self, file_info, content_value) {

	// short vars
		const quality	= self.quality || self.context.features.quality
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// render de image in Dédalo media
		let url = file_info && file_info.file_url
			? file_info.file_url
			: null // DEDALO_CORE_URL + '/themes/default/0.jpg'

		// fallback to default (when not already in default)
		if (!url && quality!==self.context.features.default_quality) {
			const file_info_dq	= datalist.find(el => el.quality===self.context.features.default_quality && el.file_exist===true)
			url = file_info_dq
				? file_info_dq.file_url
				: null
			if (url) {
				// change the quality
				self.quality = self.context.features.default_quality
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
			class_name		: 'image'
		})
		object_node.type = "image/svg+xml"

		if (data.base_svg_url) {
			// svg file already exists
			object_node.data = data.base_svg_url // + '?t=' + (new Date()).getTime()

		}else{
			// fallback to default svg file
			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
			const base_svg_url_default	= page_globals.fallback_image.substr(0, page_globals.fallback_image.lastIndexOf('.')) + '.svg'
			object_node.data			= base_svg_url_default

			if (self.permissions>1) {
				// upload tool is open on click
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
		}
		// set pointer
		self.object_node = object_node

		// auto-change url the first time
		object_node.onload = async function() {
			if (quality!==self.context.features.default_quality) {
				await fn_img_quality_change(url)
			}

			// dynamic_url . prevents to cache files inside svg object
			const image = object_node.contentDocument.querySelector('image')
			if (image) {
				const dynamic_url = image.href.baseVal + '?t=' + (new Date()).getTime()
				image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dynamic_url);
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
			const svg_doc = object_node.contentDocument;
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


	return object_node
}//end render_image_node



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
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
		if( self.show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

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



// @license-end
