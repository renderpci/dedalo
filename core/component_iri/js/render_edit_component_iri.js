/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {view_default_edit_iri} from './view_default_edit_iri.js'
	import {view_text_iri} from './view_text_iri.js'
	import {view_mini_iri} from './view_mini_iri.js'



/**
* RENDER_EDIT_COMPONENT_IRI
* Manage the components logic and appearance in client side
*/
export const render_edit_component_iri = function() {

	return true
}//end render_edit_component_iri



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node
*/
render_edit_component_iri.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_iri.render(self, options)

		case 'text':
			return view_text_iri.render(self, options)

		case 'default':
		default:
			return view_default_edit_iri.render(self, options)
	}

	return null
}//end edit

