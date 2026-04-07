// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {activate_edit_in_list} from '../../component_common/js/component_common.js'



/**
* VIEW_DEFAULT_LIST_IRI
* Manage the components logic and appearance in client side
*/
export const view_default_list_iri = function() {

	return true
}//end view_default_list_iri



/**
* RENDER
* Render node for use in this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_iri.render = async function(self, options) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// Value as string
		const ar_value_string	= [];
		const entries_length	= entries.length
		for (let i = 0; i < entries_length; i++) {

			const ar_line = []

			if (entries[i].title) {
				ar_line.push(entries[i].title)
			}
			if (entries[i].iri) {
				ar_line.push(entries[i].iri)
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
			value_string : value_string
		})

	// click handler for edit mode activation (modal)
		wrapper.addEventListener('click', (e) => {
			e.stopPropagation()
			activate_edit_in_list(self, e, { mode: 'modal', modal_width: '40rem' })
		})


	return wrapper
}//end render



// @license-end
