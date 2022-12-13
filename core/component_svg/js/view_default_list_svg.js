/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {view_mini_list_svg} from './view_mini_list_svg.js'



/**
* VIEW_DEFAULT_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_default_list_svg = function() {

	return true
}//end view_default_list_svg



/**
* RENDER
* Render node for use in list
* @return DOM node
*/
view_default_list_svg.render = function(self, options) {

	// value
		const fragment = get_value_fragment(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {

		})

		wrapper.appendChild(fragment)


	return wrapper
}//end render



/**
* GET_VALUE_FRAGMENT
* @param instance self
* @return DOM DocumentFragment
*/
export const get_value_fragment = function(self) {

	// value
		const data	= self.data || {}
		const value	= data.value || []

	// short vars
		const datalist	= self.data.datalist || []
		const quality	= self.quality || self.context.features.quality

	const fragment = new DocumentFragment()

	// svg elements
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// // media url from data.datalist based on selected context quality
				const file_info	= datalist.find(el => el.quality===quality)
				const url		= file_info.file_url
					? file_info.file_url
					: null

			const image	= ui.create_dom_element({
				element_type	: 'img',
				src				: url,
				parent			: fragment
			})
		}

	return fragment
}//end get_value_fragment
