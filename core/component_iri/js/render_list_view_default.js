/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_list_view_default
* Manage the components logic and appearance in client side
*/
export const render_list_view_default = function() {

	return true
}//end render_list_view_default



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_view_default.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		const ar_value_string	= [];
		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (value[i].title) {
				ar_line.push(value[i].title)
			}
			if (value[i].iri) {
				ar_line.push(value[i].iri)
			}

			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}

		const value_string = (ar_value_string && ar_value_string.length)
			? ar_value_string.join('<br>')
			: null

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: false,
			value_string	: value_string
		})


	return wrapper
}//end list
