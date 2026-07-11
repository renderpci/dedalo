// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_FILTER
* Plain-text read-only list renderer for component_filter in 'text' view mode.
*
* Produces the lightest possible DOM representation of a filter component's
* selected project values: a bare <span> whose innerHTML is the resolved label
* strings joined by `context.fields_separator`. Unlike view_default_list_filter
* it attaches no click handler and does not delegate to
* ui.component.build_wrapper_list, making it suitable for read-only embedding
* contexts (e.g. portal autocomplete suggestions, formatted report cells) where
* the interactive and structural overhead of the default wrapper is undesirable.
*
* View routing:
*   render_list_component_filter.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default'  → view_default_list_filter  (click-to-edit, standard wrapper)
*     'mini'     → view_mini_list_filter     (compact span joined with ' | ')
*     'collapse' → view_collapse_list_filter (collapsible wrapper, sync-toggle)
*
* Exports:
*   view_text_list_filter        — constructor stub (no-op; all logic on the static render method)
*   view_text_list_filter.render — the async render function called by the list dispatcher
*/
export const view_text_list_filter = function() {

	return true
}//end view_text_list_filter



/**
* RENDER
* Build a plain <span> wrapper displaying the component_filter's selected
* project values as a single delimited string.
*
* Reads `self.data.entries` (an Array of pre-resolved human-readable label
* strings supplied by the server) and joins them using the separator defined
* in `self.context.fields_separator` (set from the ontology/section-map; e.g.
* ', ' or ' | '). The result is assigned as innerHTML rather than text content
* so that any HTML markup already present in the resolved labels (e.g. <mark>
* highlight tags from an active search query) is preserved.
*
* This view intentionally has no click handler. To allow in-place editing from
* a list cell, use view_default_list_filter instead.
*
* CSS classes applied to the wrapper <span>:
*   'wrapper_component' — standard Dédalo component wrapper marker
*   self.model          — component model identifier (e.g. 'component_filter')
*   self.mode           — current render mode (e.g. 'list')
*   'view_<self.view>'  — current view variant (e.g. 'view_text')
*
* Data contract (from self):
*   self.data.entries            {Array<string>} Pre-resolved display labels for the
*                                selected project values. Populated by the server before
*                                the API response is sent; the client does not re-resolve.
*                                Falls back to an empty array when absent or falsy.
*   self.context.fields_separator {string} Delimiter inserted between label strings,
*                                e.g. ', ' or ' | '. Sourced from the section-map
*                                `fields_separator` property for the host section type
*                                (see core/section/class.section_map.php ::get_fields_separator).
*                                (!) No fallback is applied here; if the property is absent
*                                from context, entries.join(undefined) produces the literal
*                                string 'undefined' between values. The section-map should
*                                always supply this value for sections that use the 'text' view.
*
* @param {Object} self    - component_filter instance. Must expose:
*                           `self.data`                {Object}        may be undefined (guarded with || {})
*                           `self.data.entries`        {Array<string>} resolved label strings
*                           `self.context.fields_separator` {string}   entry delimiter
*                           `self.model`               {string}        e.g. 'component_filter'
*                           `self.mode`                {string}        e.g. 'list'
*                           `self.view`                {string}        e.g. 'text'
* @param {Object} options - Forwarded from render_list_component_filter.list; not used
*                           by this view but accepted for interface parity with sibling views.
* @returns {Promise<HTMLElement>} The constructed <span> element ready for DOM insertion.
*/
view_text_list_filter.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// Join the pre-resolved label strings using the separator defined in the section-map
		// context. innerHTML is used (not textContent) so that embedded HTML tags in labels
		// (e.g. <mark> from search highlighting) are rendered rather than escaped.
		const value_string	= entries.join(self.context.fields_separator)

	// wrapper. Set as span
		// A bare <span> is used instead of ui.component.build_wrapper_list so that
		// this view remains click-handler-free and imposes minimal structural CSS.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
