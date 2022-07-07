/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_SVG
* Manage the components logic and appearance in client side
*/
export const render_list_component_svg = function() {

	return true
}//end render_list_component_svg



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_svg.prototype.list = function() {

	const self = this

	// value
		const fragment = get_value_fragment(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})
		wrapper.appendChild(fragment)

	return wrapper
}//end list



/**
* GET_VALUE_FRAGMENT
* @param instance self
* @return DOM DocumentFragment
*/
export const get_value_fragment = function(self) {

	// value
	const data	= self.data || {}
	const value	= data.value || []

	const fragment = new DocumentFragment()

	// svg elements
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {

			const item_value = value[i]

			// check value
				// if (!item_value) {
				// 	console.warn("Ignored invalid item value:", item_value, self.data.value)
				// 	continue
				// }

			const url	= item_value.url
			const image	= ui.create_dom_element({
				element_type	: 'img',
				src				: url,
				parent			: fragment
			})
			fragment.appendChild(image)
		}

	return fragment
}//end get_value_fragment
