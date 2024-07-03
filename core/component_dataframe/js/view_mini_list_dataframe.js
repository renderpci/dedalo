// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_DATAFRAME
* Manage the components logic and appearance in client side
*/
export const view_mini_list_dataframe = function() {

	return true
}//end view_mini_list_dataframe



/**
* RENDER
* Manages the component's logic and appearance in client side
* @param object self
* @param object options
* @return promise
* 	DOM node wrapper
*/
view_mini_list_dataframe.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'content_data'
		})

	// content_value. render content_value node
		const content_value = render_content_value({
			self : self
		})
		content_data.appendChild(content_value)


	return content_data
}//end get_content_data



/**
* RENDER_CONTENT_VALUE
* @param object options
* {
* 	self : object instance
* }
* @return HTMLElement content_value
*/
const render_content_value = function(options) {

	// options
		const self	= options.self

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'content_value'
		})

	// button_activate
		const button_activate = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button activate',
			text_content 	:  self.properties.label || '?',
			parent			: content_value
		})

		if(value.length >= 1) {

			const rating_data = self.get_rating()
			if(rating_data && rating_data.value){

				const rating_value = rating_data.value[0]
				const rating = (rating_value)
					? rating_data.datalist.find(el => el.section_id === rating_value.section_id )
					: {
						hide:[{
							literal: '#eeeeee' // gray when the datalist is empty (the rating is not set)
						}]
					}

				// update background color
					const bg_color = rating.hide[0].literal || '#f78a1c'
					button_activate.style.backgroundColor = bg_color

				// update text color based on background
					const text_color = ui.get_text_color(bg_color)
					button_activate.style.color = text_color
			}
		}

	return content_value
}//end render_content_value



// @license-end
