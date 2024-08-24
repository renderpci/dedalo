// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_mini_list_svg = function() {

	return true
}//end view_mini_list_svg



/**
* RENDER
* Render node to be used by this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_mini_list_svg.render = function(self, options) {

	// value
		const fragment = get_value_fragment(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.appendChild(fragment)


	return wrapper
}//end render



/**
* GET_VALUE_FRAGMENT
* @param instance self
* @return DocumentFragment
*/
export const get_value_fragment = function(self) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const external_source	= data.external_source
		const quality			= self.quality || self.context.features.quality

	const fragment = new DocumentFragment()

	// svg elements
		const inputs_value	= value
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			// // media url from data.datalist based on selected context quality
				const file_info	= files_info.find(el => el.quality===quality)
				const url		= file_info
					? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
					: page_globals.fallback_image

			const image	= ui.create_dom_element({
				element_type	: 'img',
				src				: url,
				parent			: fragment
			})
		}


	return fragment
}//end get_value_fragment



// @license-end
