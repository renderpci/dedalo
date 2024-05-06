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
			// set pointers
			self.node.content_data = content_data
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

	// event
		event_manager.subscribe('full_screen_'+self.id, () => {
			fit_image(self)
		})


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
		const quality			= self.quality || self.context.features.quality
		const extension			= self.context.features.extension
		const data				= self.data || {}
		const files_info		= value && value.files_info
			? value.files_info
			: []
		const external_source	= data.external_source

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value sgv_editor'
		})

	// external_source case. render the image when the source is external, image from URI
		if(external_source && external_source.length){
			const image_external_node = render_image_external(external_source)
			content_value.appendChild(image_external_node)

			return content_value
		}

	// file_info
		const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true)

	// render image node
		self.image_container = render_image_node(self, file_info, content_value)
		content_value.appendChild(self.image_container)

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
		const quality			= self.quality || self.context.features.quality
		const data				= self.data || {}
		const external_source	= data.external_source

	// render de image in Dédalo media
		const url = external_source
			? external_source
			: file_info
				? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

	// image. (!) Only to get background color and apply to li node
		const image_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'image_container work_area'
		})

		// des
			// const bg_reference_image_url = url // || page_globals.fallback_image
			// const image = ui.create_dom_element({
			// 	element_type	: 'img',
			// 	class_name 		: 'img',
			// 	// parent 			: image_container
			// })
			// // image background color
			// 	image.addEventListener('load', set_bg_color, false)
			// 	function set_bg_color() {
			// 		this.removeEventListener('load', set_bg_color, false)
			// 		// ui.set_background_image(this, content_value)
			// 		image.classList.remove('hide')
			// 	}
			// // error
			// 	image.addEventListener('error', function(){
			// 		// console.warn('Error on load image:', bg_reference_image_url, image);
			// 		svg_fallback(object_node)
			// 	}, false)
			// image.src = bg_reference_image_url
			// image_container.image = image

	// fallback to default svg file
		function svg_fallback(object_node) {
			// fallback to default svg file
			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
			const base_svg_url_default	= page_globals.fallback_image.substr(0, page_globals.fallback_image.lastIndexOf('.')) + '.svg'
			object_node.data			= base_svg_url_default

			if (self.permissions>1) {
				// upload tool is open on click
				content_value.addEventListener('click', function(e) {
					e.stopPropagation();
					// tool_upload. Get the tool context to be opened
					const tool_upload = self.tools.find(el => el.model==='tool_upload')
					// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
				})
				content_value.classList.add('clickable')
			}
		}

	// object_node <object type="image/svg+xml" data="image.svg"></object>
		const object_node = ui.create_dom_element({
			element_type	: 'object',
			class_name		: 'image',
			parent			: image_container
		})
		object_node.type	= "image/svg+xml"
		object_node.url		= url // image URL
		// set data or fallback
		if (data.base_svg_url) {

			// svg file already exists
			object_node.data = data.base_svg_url + '?t=' + (new Date()).getTime()

		}else{
			// fallback to default svg file
			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
			svg_fallback(object_node)
		}
		// set pointers
		image_container.object_node	= object_node

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
		// object_node.dataset.image_change_event = image_change_event // string like 'event_167'
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

				// update t var from image URL
				const beats	= img_src.split('?')

				// force to refresh image from svg
				await fetch(beats[0], { cache: 'reload' })

				// new_url
				const new_url = beats[0] + '?t=' + (new Date()).getTime()

				// set the new source to the image node into the svg
				image_node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', new_url)
			}

			return true
		}


	return image_container
}//end render_image_node



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true) {
			ui.add_tools(self, fragment)
		}

	// open svg editor tools
		if (show_interface.read_only === false && show_interface.tools === true) {
			// vector_editor
			const vector_editor = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button vector_editor',
				title			: 'Toggle vector editor',
				parent			: fragment
			})
			vector_editor.addEventListener('mouseup', (e) => {
				e.stopPropagation()

				vector_editor_tools.classList.toggle('hide')
				if(!vector_editor_tools.classList.contains('hide')){
					self.load_vector_editor()
				}
			})

			// svg editor tools
			const vector_editor_tools = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'vector_editor_tools hide',
				parent			: fragment
			})
			self.vector_editor_tools = vector_editor_tools
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node, ()=>{
					event_manager.publish('full_screen_'+self.id, false)
				})
				event_manager.publish('full_screen_'+self.id, true)
			})
		}

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
* FIT_IMAGE
* Resizes the image to fit the container
* Used on fullscreen mode to scale current image object to fit
* the new component dimensions
* @param object self
* @return void
*/
const fit_image = function(self) {

	// vector_editor. If isset, nothing to do, only for non edit image
		if (self.vector_editor || !self.image_container.object_node) {
			return
		}

	// wrapper
		const wrapper = self.node

	// image container
		const image_container		= self.image_container
		const bb_image_container	= image_container.getBoundingClientRect()

	// object_node
		const object_node	= image_container.object_node
		const layers		= object_node.contentDocument.querySelectorAll('.layer')
		const main_image	= object_node.contentDocument.querySelector('#main_image')
			|| object_node.contentDocument.querySelector('image')
			if (!main_image) {
				console.error('main_image not found in object_node!', object_node);
				return
			}

	// ratio
		const image_container_height	= bb_image_container.height
		const image_container_width		= bb_image_container.width
		const main_image_height			= main_image.height.baseVal.value
		const main_image_width			= main_image.width.baseVal.value

		const ratio_h	= image_container_height / main_image_height
		const ratio_w	= image_container_width / main_image_width

		const ratio = Math.min(ratio_h, ratio_w)

	// style scale
		const layers_length = layers.length
		for (let i = 0; i < layers_length; i++) {
			const el = layers[i]

			// el.style.transform = `scale(${ratio})`;
			el.style.scale = ratio

			if (i===0) {
				const bb = el.getBoundingClientRect()
				object_node.style.width = bb.width + 'px'
				// object_node.style.height = bb.height + 'px'
			}
		}

	// event resize. Only if we are in fullscreen
		const fn_resize = () => {
			fit_image(self)
		}
		if (wrapper.classList.contains('fullscreen')) {
			window.onresize = fn_resize;
		}
}//end fit_image



// @license-end
