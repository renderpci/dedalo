/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_mini_component_iri
* Manage the components logic and appearance in client side
*/
export const render_mini_component_iri_iri = function() {

	return true
};//end render_mini_component_iri_iri



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_iri_iri.prototype.mini = async function() {

	const self = this

	// short vars
		const data = self.data

	// Value as string
		const ar_value_string	= [];
		const value_length		= data.value.length
		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (data.value[i].title) {
				ar_line.push(data.value[i].title)
			}
			if (data.value[i].iri) {
				ar_line.push(data.value[i].iri)
			}

			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}
		const value_string = (ar_value_string && ar_value_string.length)
			? ar_value_string.join(' - ')
			: ''

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
};//end mini


