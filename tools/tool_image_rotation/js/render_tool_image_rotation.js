// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



// imports
	import { ui } from '../../../core/common/js/ui.js'
	import { render_tool_image_crop } from './render_tool_image_crop.js'



/**
* RENDER_TOOL_IMAGE_ROTATION
* Manages the component's logic and appearance in client side
*/
export const render_tool_image_rotation = function() {

	return true
}//end render_tool_image_rotation



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common
* @param object options
* @return HTMLElement wrapper
*/
render_tool_image_rotation.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const default_file_info = self.main_element.get_default_file_info()

	// no image case
		if (!default_file_info) {
			const content_data = ui.tool.build_content_data(self)
			content_data.innerHTML = '<br><h3> No image is available </h3>'
			return content_data
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})
		const buttons_wrapper = get_buttons(self)
		buttons_container.appendChild(buttons_wrapper)

	// main_element_container
		const main_element_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_element_container',
			parent			: fragment
		})

		// image_container
			const image_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'image_container',
				parent			: main_element_container
			})
			self.image_container = image_container

		// main_element_image. Temporal image to show while main_element is rebuilt and rendered
			const main_element_image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'noevents',
				parent			: image_container
			})
			// set pointer
			self.main_element_image = main_element_image
			// load event
			const load_handler = () => {
				const image_size = main_element_image.getBoundingClientRect()
				image_container.style.width		= image_size.width +'px'
				image_container.style.height	= image_size.height +'px'
				// save current values as default values (will use into the no-expand option)
				self.image_container.dd_options = {
					width	: image_size.width,
					height	: image_size.height
				}
			}
			main_element_image.addEventListener('load', load_handler)
			// set source
			requestAnimationFrame(
				() => {
					main_element_image.src = DEDALO_MEDIA_URL + default_file_info?.file_path + '?t=' + (new Date()).getTime()
				}
			)

		// axis_container
			const axis_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'axis_container',
				parent			: main_element_container
			})
			const horizontal_axis = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'horizontal_axis',
				parent			: axis_container
			})
			const vertical_axis = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'vertical_axis',
				parent			: axis_container
			})
			const diagonal_left_axis = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'diagonal_left_axis',
				parent			: axis_container
			})
			const diagonal_rigth_axis = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'diagonal_rigth_axis',
				parent			: axis_container
			})
			const circle_axis = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'circle_axis',
				parent			: main_element_container
			})

			self.axis_container	= axis_container
			self.circle_axis	= circle_axis

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* Render buttons bellow the av player
* @param object instance self
* @return HTMLElement buttons_wrapper
*/
const get_buttons = function(self) {

	const fragment = new DocumentFragment()

	// nodes pointer
	// storage of the nodes to be used for check and change status.
		const nodes = {}

	// status
		const status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_container'
		})
		//save the pointer
			nodes.status_container = status_container

	// slider_range
		const slider_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'slider_container',
			parent 			: fragment
		})
			const slider_label = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'slider_label',
				inner_html 		: self.get_tool_label('rotation') || 'Rotation',
				parent 			: slider_container
			})
			const slider = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'slider',
				parent 			: slider_container
			})

				const output = ui.create_dom_element({
					element_type	: 'input',
					class_name		: 'output_value',
					parent			: slider,
					value 			: 0
				})
				output.addEventListener('input', function(){
					range.value	= output.value
					self.main_element_image.style.transform = "rotate("+ (range.value % 360) +"deg)"
				})

				const range = ui.create_dom_element({
					element_type	: 'input',
					class_name 		: 'slider',
					type 			: 'range',
					parent 			: slider
				})
				range.value	= output.value
				range.min	= -360
				range.max	= 360
				range.step	= 0.01
				range.addEventListener('input', function(){
					output.value = range.value
					self.main_element_image.style.transform = "rotate("+ (range.value % 360) +"deg)"
					if(expanded_checkbox.checked === true){
						const image_size		= self.main_element_image.getBoundingClientRect()
						// Resize the container_size to fit
						self.image_container.style.width = `${image_size.width}px`;
						self.image_container.style.height = `${image_size.height}px`;
					}
				})

	// color options
		const color_options_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'color_options_container',
			parent 			: fragment
		})

			const color_picker_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'color_picker_label',
				inner_html		: self.get_tool_label('bk_colour') || 'Background color',
				parent			: color_options_container
			})

			// color picker
			const color_picker = ui.create_dom_element({
				element_type	: 'input',
				type			: 'color',
				id 				: 'color_picker',
				name 			: 'color_picker',
				class_name		: 'color_picker',
				value			: '#ffffff',
				parent			: color_options_container
			})
			color_picker.addEventListener("input", function(e){
				// color_picker.value = e.target.value;
				self.image_container.style.background = e.target.value;
				alpha_checkbox.checked = false
			});

			// transparent check box
			// label
			const option_label = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: self.get_tool_label('transparent') || 'Transparent',
				parent			: color_options_container
			})

			// alpha_checkbox
				const alpha_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox'
				})
				option_label.prepend(alpha_checkbox)
				alpha_checkbox.addEventListener('change', function(e) {

					if(e.target.checked === true){
						self.image_container.classList.add('checkborad');
						self.image_container.style.background = null
						color_picker.value = '#ffffff'
					}else{
						self.image_container.classList.remove('checkborad');
					}

				})

			// expanded check box
			// rotate the image and expand the canvas, with this option active the image expand the background avoiding crop.
			// label
			const expanded_label = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: self.get_tool_label('expand') || 'Expand',
				parent			: color_options_container
			})

			// expanded_checkbox
				const expanded_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox'
				})
				expanded_label.prepend(expanded_checkbox)
				expanded_checkbox.addEventListener('change', function(e) {

					if(e.target.checked === true){
						const image_size = self.main_element_image.getBoundingClientRect()
							self.image_container.style.width	= image_size.width +'px'
							self.image_container.style.height	= image_size.height +'px'
					}else{
						self.image_container.style.width	= self.image_container.dd_options.width +'px'
						self.image_container.style.height	= self.image_container.dd_options.height +'px'
					}
				})

	// options container
	const options_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'options_container',
		parent			: fragment
	})

	// crop button
		const crop_button_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'crop_button_container',
			parent			: options_container
		})

		// crop_button
			const crop_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light crop_button',
				// inner_html		:  self.get_tool_label('crop_image') || 'Crop image',
				parent			: crop_button_container
			})

			const crop_button_click_handler = function(){

				if(crop_button.active === true){
					crop_button.active = false
					crop_button.classList.remove('active')
					render_tool_image_crop.destroy()
					return
				}
				crop_button.active = true
				crop_button.classList.add('active')

				self.axis_container.classList.add('hide')
				self.circle_axis.classList.add('hide')

				render_tool_image_crop.build({
					container				: self.image_container,
					image					: self.main_element_image,
					status_container		: status_container,
					crop_button_container	: crop_button_container
				})
			}
			crop_button.addEventListener('click', crop_button_click_handler)

	// apply_rotation_button_container
		const apply_rotation_button_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'apply_rotation_button_container',
			parent			: options_container
		})

		// button_apply_rotation
			const button_apply_rotation = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light gear apply_rotation',
				inner_html		: get_label.create || 'Create',
				parent			: apply_rotation_button_container
			})
			button_apply_rotation.addEventListener('click', async function(){
				self.node.content_data.classList.add('loading')
				const rotation_degrees = output.value
				const result = await self.apply_rotation({
					rotation_degrees	: rotation_degrees,
					background_color	: color_picker.value,
					alpha				: alpha_checkbox.checked,
					rotation_mode		: expanded_checkbox.checked ? 'expanded' : 'default',
					crop_area			: render_tool_image_crop.crop_area || null,
				})
				if (result===true) {
					// reload the image
					await fetch(self.main_element_image.src, {cache: 'reload', mode: 'no-cors'});
					self.main_element_image.src = self.main_element_image.src
					output.value	= 0
					range.value		= 0
					self.main_element_image.style.transform = null
					// reset the crop
					render_tool_image_crop.reset_selection()
				}
				self.node.content_data.classList.remove('loading')
			})

	// remove background
		const remove_background_button_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'remove_background_button_container',
			parent			: options_container
		})

		// button_remove_background
			const button_remove_background = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_remove_background',
				inner_html		:  self.get_tool_label('remove_background') || 'Remove background',
				parent			: remove_background_button_container
			})

			//save the pointer
			nodes.button_remove_background = button_remove_background

		// fire the remove background process
		const button_remove_background_click_handler = async function(e){
			e.stopPropagation()

			// Get the most quality image, mainly the origianl quality
			const image_file = ( self.main_element.get_quality_file_info('original') )
				? self.main_element.get_quality_file_info('original')
				: (self.main_element.get_quality_file_info('modified'))
					? self.main_element.get_quality_file_info('modified')
					: self.main_element.get_quality_file_info('1.5MB')

			if( !image_file ){
				return
			}
			// set the image URL to be used in the process worker
			const image = DEDALO_MEDIA_URL + image_file?.file_path
			nodes.main_element_image = self.main_element_image

			// check for browser requirements. This check allows Edge (Chromium) too
			const is_chrome137_or_higher = () => {
				if (navigator.userAgentData) {
					const brands = navigator.userAgentData.brands;
					const chromeBrand = brands.find(b => b.brand === "Google Chrome" || b.brand === "Chromium");

					if (chromeBrand) {
						const version = parseInt(chromeBrand.version, 10);
						return version >= 137;
					}
				}

				// Fallback to userAgent
				const ua = navigator.userAgent;
				const match = ua.match(/Chrome\/(\d+)/i);
				if (match && match[1]) {
					const version = parseInt(match[1], 10);
					return version >= 137;
				}

				return false;
			}
			if (!is_chrome137_or_higher()) {
				if(!confirm("This feature requires Chrome version 136 or newer. Continue?")) {
					return false
				}
			}

			if(button_remove_background.active === false){
				return
			}
			const engine = 'briaai/RMBG-1.4' // 'Xenova/rmbg-1.4'
			if(!engine){
				return
			}
			button_remove_background.classList.add('disable')
			button_remove_background.blur()

			// options to be sent to engine
			const background_removal_options = {
				self_caller			: self.main_element,
				engine				: engine,
				image				: image,
				original_file_name	: self.main_element.get_original_file_name(),
				nodes				: nodes
			}

			// process with the engine
			// type = browser -> (Default) the engine will be use the default transformer process in client browser
			// return a Promise with the data to be saved into transcription component.
			self.automatic_background_removal(background_removal_options)
			.then( async (response)=>{

				// set the status done
				button_remove_background.classList.remove('disable')
				const msg = self.get_tool_label('backgroun_removal_completed') || 'Background removal completed.';
				status_container.innerHTML = `<span class="success_text">${msg}</span>`;

				// // create the image
				// const image = URL.createObjectURL(blob)
				await self.main_element.build(true)

				// Get the valid extensions and check if any match with the images in the component
				// The process only show the result correctly when you have a transparent format as default extension
				// or in alternative extensions in the constant `DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS` in `config.php`
				const supported_formats = ['avif','png']
				const active_extensions = self.main_element.get_active_extensions()

				const valid_transparent_extension = supported_formats.find(item => active_extensions.includes(item))
				// if the config has not valid transparent format use the default extension to get the processed image.
				const extension = (valid_transparent_extension)
					? valid_transparent_extension
					: self.main_element.context.features.extension

				// get the processed image file
				const image_file = self.main_element.get_quality_file_info('1.5MB', extension)

				if( !image_file ){
					return
				}
				// asing the new processed image to the tool to show it
				const image = DEDALO_MEDIA_URL + image_file?.file_path
				nodes.main_element_image.src = image;
			})
		}
		button_remove_background.addEventListener('click', button_remove_background_click_handler)

	// status container set its parent
		options_container.appendChild(status_container)

	return fragment
}//end get_buttons




const get_crop_interface = function(self){

}



// @license-end
