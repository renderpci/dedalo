// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_SVG
* Manage the components logic and appearance in client side
*/
export const view_default_edit_svg = function() {

	return true
}//end view_default_edit_svg



/**
* RENDER
* Render node for use in edit
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
			buttons			: buttons
		})
		// common media classes
		wrapper.classList.add('media_wrapper')
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		// const datalist	= data.datalist || []

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
* @return HTMLElement content_value
*/
const get_content_value = function(i, value, self) {

	// short vars
		const datalist	= self.data.datalist || []
		const quality	= self.quality || self.context.features.quality

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value'
		})

	// media url from data.datalist based on selected context quality
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
		const url		= file_info
			? file_info.file_url
			: null

	// svg item
		if (url) {
			// image
			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image svg_element',
				src				: url + '?t' + (new Date()).getTime(),
				parent			: content_value
			})
			image.setAttribute('tabindex', 0)
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @return HTMLElement content_value
*/
const get_content_value_read = function(i, value, self) {

	// short vars
		const datalist	= self.data.datalist || []
		const quality	= self.quality || self.context.features.quality

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value read_only'
		})

	// media url from data.datalist based on selected context quality
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
		const url		= file_info
			? file_info.file_url
			: null

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

	const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// button_fullscreen
		const button_fullscreen = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button full_screen',
			parent			: fragment
		})
		button_fullscreen.addEventListener('click', function() {
			ui.enter_fullscreen(self.node)
		})

	// buttons tools
		if( self.show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

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
}//end get_buttons



// @license-end
