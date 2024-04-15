// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'



/**
* VIEW_DEFAULT_EDIT_SVG
* Manage the components logic and appearance in client side
*/
export const view_default_edit_svg = function() {

	return true
}//end view_default_edit_svg



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_svg.render = async function(self, options) {

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
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons,
			add_styles		: ['media_wrapper'] // common media classes
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		// common media classes
		content_data.classList.add('media_content_data')

	// values iterate (one or zero is expected)
		const inputs_value	= value.length>0 ? value : [null]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// add node to content_data
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
* @param object self
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
			class_name		: 'content_value media_content_value'
		})

	// media url from files_info based on selected context quality
		const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true)
		const url		= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// svg item
		if (file_info) {
			// image
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image svg_element',
				src				: url,
				parent			: content_value
			})
			image.setAttribute('tabindex', 0)
		}else{

			// image fallback
			const image_url = page_globals.fallback_image
			const image_node = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image svg_element fallback_image clickable',
				parent			: content_value
			})
			// load event . image background color
				// image_node.addEventListener('load', set_bg_color, false)
				// function set_bg_color() {
				// 	this.removeEventListener('load', set_bg_color, false)
				// 	ui.set_background_image(this, content_value)
				// }

			image_node.src = image_url

			// click
			image_node.addEventListener('mousedown', function(e) {
				e.stopPropagation()

				const tool_upload = self.tools.find(el => el.model==='tool_upload')
				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			})
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @return HTMLElement content_value
*/
const get_content_value_read = function(i, value, self) {

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
			class_name		: 'content_value media_content_value read_only'
		})

	// media url from files_info based on selected context quality
		const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true)
		const url		= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// svg item
		if (url) {
			// image
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image svg_element',
				src				: url,
				parent			: content_value
			})
		}


	return content_value
}//end get_content_value_read



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
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
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
				ui.enter_fullscreen(self.node)
			})
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
