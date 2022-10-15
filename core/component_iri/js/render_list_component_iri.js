/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_iri} from './view_default_list_iri.js'
	import {view_mini_iri} from './view_mini_iri.js'
	import {view_text_iri} from './view_text_iri.js'



/**
* render_list_component_iri
* Manage the components logic and appearance in client side
*/
export const render_list_component_iri = function() {

	return true
}//end render_list_component_iri



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_iri.prototype.list = async function(options) {

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
			return view_default_list_iri.render(self, options)
	}

	return null
}//end list
