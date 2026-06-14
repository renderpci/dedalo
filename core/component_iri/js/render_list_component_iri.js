// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_list_iri} from './view_default_list_iri.js'
	import {view_mini_iri} from './view_mini_iri.js'
	import {view_text_list_iri} from './view_text_list_iri.js'



/**
* RENDER_LIST_COMPONENT_IRI
* Prototype-style render module that provides the list-mode render entry point
* for component_iri instances.
*
* component_iri assigns render_list_component_iri.prototype.list as both its
* `list` and `tm` (thesaurus-mini) render methods (see component_iri.js).
*
* Responsibilities:
* - Dispatch to the correct view implementation (default / mini / text) based on
*   the value of self.context.view supplied by the server context layer.
* - Export the shared render_links_list helper consumed by view_mini_iri and any
*   other view that needs IRI values rendered as live anchor links.
*
* Data shape assumed by list / render_links_list:
*   self.data = {
*     entries: [
*       { iri: string|null, title: string|null, id: string|number },
*       …
*     ],
*     fields_separator: string   // optional; defaults to ', '
*   }
*
* @exports {Function} render_list_component_iri - constructor (prototype host)
* @exports {Function} render_links_list         - standalone DOM-fragment builder
*/
export const render_list_component_iri = function() {

	return true
}//end render_list_component_iri



/**
* LIST
* Dispatches to the correct view implementation for list/tm render mode.
*
* Reads self.context.view (provided by the server context layer) and routes to:
*   - 'mini'    → view_mini_iri    (used by autocomplete / datalist service)
*   - 'text'    → view_text_list_iri (plain-text output, no anchor elements)
*   - 'default' → view_default_list_iri (standard list row with click-to-edit)
*
* 'default' is also the fallback for any unknown view string so that the
* component degrades gracefully when a new view is configured server-side but
* not yet handled here.
*
* @param {Object} options - render options forwarded verbatim to each view renderer
* @returns {Promise<HTMLElement|null>} the rendered wrapper node, or null on error
*/
render_list_component_iri.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_iri.render(self, options)

		case 'text':
			return view_text_list_iri.render(self, options)

		case 'default':
		default:
			return view_default_list_iri.render(self, options)
	}
}//end list



/**
* RENDER_LINKS_LIST
* Builds a DocumentFragment containing one anchor (or span) element per IRI
* entry, separated by configurable field-separator spans.
*
* Each entry is rendered as:
*   <a href="{iri}" class="link_iri" target="_blank" rel="noreferrer">{title|hostname}</a>
* or, when no IRI is present:
*   <span class="text_iri">{title}</span>
*
* The link text prefers entry.title; falls back to the URL hostname extracted via
* the URL constructor; falls back to an empty string if both are absent.
*
* A URL object is constructed inside an IIFE to contain the try/catch without
* polluting the outer scope. If URL construction fails (malformed IRI), the
* error is logged to the console and the entry is still rendered — as a span
* rather than an anchor — so the record remains visible even with invalid data.
*
* Note: The href/target/rel assignments on link_node use the comma operator
* (multiple assignments in a single statement separated by commas). This is
* valid JS but unconventional; the behaviour is identical to separate assignment
* statements. (!) Do not "clean up" this pattern without verifying the output.
*
* @param {Object} data - descriptor object
* @param {Array}  data.entries          - array of IRI entry objects
* @param {string} [data.fields_separator=', '] - separator text inserted between entries
* @returns {DocumentFragment} fragment containing rendered link/span nodes
*/
export const render_links_list = function(data) {

	// DOM fragment
		const fragment	= new DocumentFragment()
		const entries	= data.entries
		if (!entries) {
			return fragment
		}

		const fields_separator = data.fields_separator || ', '

	// values
		const entries_length = entries.length
		for (let i = 0; i < entries_length; i++) {

			// url. Create a new URL from the IRI value
			// An IIFE wraps the try/catch so that `url_object` is always defined
			// (either a URL instance or null) before the variable is used below.
				const url_object = entries[i].iri
					? (()=>{
						try {
							return new URL(entries[i].iri)
						} catch (error) {
							// console.error(error)
							// (!) Malformed IRI: logged but execution continues;
							// the entry is still rendered as a plain span.
							console.error('Unable to create a URL object from entries[i]:', entries[i]);
						}
						return null
					  })()
					: null

			const hostname = url_object ? url_object.hostname : null

			// link_node. Could be a|span
			// Entries with a valid IRI become anchor elements; entries without
			// an IRI (e.g. a title-only annotation) become text spans.
				const link_node = ui.create_dom_element({
					element_type	: entries[i].iri ? 'a' : 'span',
					class_name 		: entries[i].iri ? 'link_iri' : 'text_iri',
					text_content	: entries[i].title || hostname || '',
					title 			: entries[i].iri,
					parent			: fragment
				})
				if (entries[i].iri) {
					link_node.href		= entries[i].iri,
					link_node.target	= '_blank',
					link_node.rel		= 'noreferrer'
				}

			// fields_separator_node. Add when more tan one URI exists
				if(i < entries_length-1) {
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'fields_separator',
						text_content	: fields_separator,
						parent			: fragment
					})
				}
		}


	return fragment
}//end render_links_list



// @license-end
