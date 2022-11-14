/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
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




/**
* RENDER_LINKS_LIST
* Render component value as links list like:
* <a href="http://en.wikipedia.org" class="link_iri" title="http://en.wikipedia.org/">Wiki</a>
* @param array|null value
* @return DocumentFragment fragment
*/
export const render_links_list = function(value) {

	// DOM fragment
		const fragment = new DocumentFragment()
		if (!value) {
			return fragment
		}

	// values
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {

			// url. Create a new URL from the IRI value
				const url = (value[i].iri)
					? new URL(value[i].iri)
					: {};

			// link_node. Could be a|span
				const link_node = ui.create_dom_element({
					element_type	: url ? 'a' : 'span',
					class_name 		: url ? 'link_iri' : 'text_iri',
					text_content	: value[i].title || url.hostname || '',
					title 			: value[i].iri,
					parent			: fragment
				})
				if (url) {
					link_node.href		= value[i].iri || null,
					link_node.target	= '_blank'
					link_node.rel		= 'noreferrer'
				}

			// fields_separator_node. Add when more tan one URI exists
				if(i < value_length-1){
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'fields_separator',
						text_content	: self.context.fields_separator,
						parent			: fragment
					})
				}
		}


	return fragment
}//render render_links_list
