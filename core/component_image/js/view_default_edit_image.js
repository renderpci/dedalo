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

	// event
		const full_screen_handler = () => {
			fit_image(self)
		}
		self.events_tokens.push(
			event_manager.subscribe('full_screen_'+self.id, full_screen_handler)
		)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		// common media classes
		content_data.classList.add('media_content_data')

	// values (images)
		const inputs_value	= entries
		const entries_length	= inputs_value.length || 1
		for (let i = 0; i < entries_length; i++) {
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
		let file_info = files_info.find(el => el.quality===quality && el.file_exist===true)

	// when the default quality file doesn't exist, fallback to the first available quality
	// this keeps the image and the quality selector consistent
		if (!file_info && files_info.length > 0) {
			const available_file = files_info.find(el => el.file_exist===true)
			if (available_file) {
				self.quality = available_file.quality
				// re-resolve file_info with the updated quality
				file_info = available_file
			}
		}

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
* @param string file_url
* @return HTMLElement image_container
*/
const render_image_external = function(file_url) {

	const image_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'image_container work_area'
	})

	// image_external
	ui.create_dom_element({
		element_type	: 'img',
		class_name		: 'image image_external',
		src				: file_url,
		parent			: image_container
	})


	return image_container
}//end render_image_external



/**
* RENDER_IMAGE_NODE
* Creates an object of type 'image/svg+xml' with svg file and image
* cropped by the svg
* @param object self
* @param object|null file_info
* @param HTMLElement content_value
* @return HTMLElement image_container
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

	// image_container
		const image_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'image_container work_area'
		})
		// start invisible for smooth fade-in on load
		image_container.style.opacity	= '0'
		image_container.style.transition	= 'opacity 0.3s ease-in'

	// fallback to default svg file
		const svg_fallback = (object_node) => {
			// base_svg_url_default. Replace default image extension from '0.jpg' to '0.svg'
			const base_svg_url_default	= page_globals.fallback_image.substring(0, page_globals.fallback_image.lastIndexOf('.')) + '.svg'
			object_node.data			= base_svg_url_default

			if (self.permissions>1) {
				// tool_upload. Get the tool context to be opened
				const tool_upload = self.tools.find(el => el.model==='tool_upload')
				if (tool_upload) {
					// upload tool is open on click
					const click_handler = (e) => {
						e.stopPropagation();

						// open_tool (tool_common)
						open_tool({
							tool_context	: tool_upload,
							caller			: self
						})
					}
					content_value.addEventListener('click', click_handler)
					content_value.classList.add('clickable')
				}
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
		// set pointers
		image_container.object_node	= object_node

	// lazy load: defer setting object_node.data until the container is near the viewport
		const load_svg = () => {
			if (data.base_svg_url) {
				// svg file already exists
				object_node.data = data.base_svg_url + '?t=' + (new Date()).getTime()
			}else{
				svg_fallback(object_node)
			}
		}
		// use IntersectionObserver to load only when visible (with margin to preload slightly)
		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				observer.disconnect()
				load_svg()
			}
		}, { rootMargin: '200px' })
		observer.observe(image_container)

	// load handler: update image quality and apply cache-busting
		const load_handler = async () => {
			if (quality!==self.context.features?.default_quality) {
				await self.image_quality_change_handler(url)
			}

			// dynamic_url . prevents to cache files inside svg object
			const svg_doc = object_node.contentDocument
			if (svg_doc) {
				const image = svg_doc.querySelector('image')
				if (image) {
					const dynamic_url = image.href.baseVal + '?t=' + (new Date()).getTime()
					image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dynamic_url);
				}
			}

			// smooth appearance: fade in instead of instant show
			content_value.classList.remove('hide')
			image_container.style.opacity = '1'
		}
		object_node.addEventListener('load', load_handler)

	// error handler: fallback when SVG fails to load
		object_node.addEventListener('error', () => {
			if (self.permissions>1 && !content_value.classList.contains('clickable')) {
				const tool_upload = self.tools.find(el => el.model==='tool_upload')
				if (tool_upload) {
					const click_handler = (e) => {
						e.stopPropagation();
						open_tool({
							tool_context	: tool_upload,
							caller			: self
						})
					}
					content_value.addEventListener('click', click_handler)
					content_value.classList.add('clickable')
				}
			}
			content_value.classList.remove('hide')
			image_container.style.opacity = '1'
		})


	return image_container
}//end render_image_node



/**
* GET_BUTTONS
* @param object self
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
		if (show_interface.read_only === false && show_interface.tools === true && self.permissions > 1) {
			// vector_editor
			const vector_editor = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button vector_editor',
				title			: 'Toggle vector editor',
				parent			: fragment
			})
			// mouseup event
			const mouseup_handler = (e) => {
				e.stopPropagation()

				vector_editor_tools.classList.toggle('hide')
				if(!vector_editor_tools.classList.contains('hide')){
					self.load_vector_editor()
				}
			}
			vector_editor.addEventListener('mouseup', mouseup_handler)

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
			// click event
			const click_handler = (e) => {
				e.stopPropagation()
				ui.enter_fullscreen(self.node, ()=>{
					event_manager.publish('full_screen_'+self.id, false)
				})
				event_manager.publish('full_screen_'+self.id, true)
			}
			button_fullscreen.addEventListener('click', click_handler)
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
		const object_node = image_container.object_node
		if (!object_node || !object_node.contentDocument) {
			console.error('object_node not found in image_container!', image_container);
			return
		}
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
		const resize_handler = () => {
			fit_image(self)
		}
		if (wrapper.classList.contains('fullscreen')) {
			window.addEventListener('resize', resize_handler)
		}
}//end fit_image



// @license-end
