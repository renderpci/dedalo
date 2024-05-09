// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_IRI
* Manage the components logic and appearance in client side
*/
export const view_text_list_iri = function() {

	return true
}//end view_text_list_iri



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_iri.render = async function(self, options) {

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
			? ar_value_string.join(', ')
			: ''

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
