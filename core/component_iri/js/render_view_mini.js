/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEW_MINI
* Manage the components logic and appearance in client side
*/
export const render_view_mini = function() {

	return true
}//end render_view_mini



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_view_mini.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// DOM fragment
		const fragment = new DocumentFragment()

		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {
			// create the new URL of the IRI
			const url = (value[i].iri)
				? new URL(value[i].iri)
				: {};
			// create the link node
			const link_node = ui.create_dom_element({
				element_type	: url
					? 'a'
					: 'span',
				class_name 		: url
					? 'link_iri'
					: 'text_iri',
				href 			: value[i].iri || null,
				text_content	: value[i].title || url.hostname || '',
				title 			: value[i].iri,
				parent			: fragment
			})

			if(i < value_length-1){
				const value_separator_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value_separator',
					text_content	: self.value_separator,
					parent			: fragment
				})
			}
		}

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {})
		wrapper.appendChild(fragment)

	return wrapper
}//end mini
