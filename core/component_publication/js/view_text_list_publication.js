// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_PUBLICATION
* Inline plain-text renderer for component_publication in list mode with view 'text'.
*
* This view is selected when `self.context.view === 'text'` by the
* `render_list_component_publication` router.  It produces a bare `<span>`
* element — no interactive controls, no click handler — making it suitable for
* embedding a publication-state label inside rich-text contexts or other
* read-only containers where a full list row would be over-structured.
*
* Contrast with the two sibling views:
*   - 'default' → `view_default_list_publication`: full list row with click-to-edit.
*   - 'mini'    → `view_mini_list_publication`: compact pill used in datalist dropdowns.
*   - 'text'    → this module: raw `<span>` with joined entry labels (no interaction).
*
* Data contract (`self.data`):
*   `entries` — array of resolved label strings for the selected publication state,
*   e.g. `["Published"]`.  In practice at most one entry is present because
*   component_publication is a single-select relation.  An empty array produces an
*   empty span without error.
*
* Context contract (`self.context`):
*   `fields_separator` — string used to join multiple entries, e.g. `', '`.
*   Provided by the server-side context; callers must not assume a default value.
*
* @module view_text_list_publication
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PUBLICATION
* Namespace constructor — never instantiated directly.
* All behaviour is attached to static methods on this function object,
* following the Dédalo view-module pattern where the exported symbol is a
* no-op function used purely as a namespace carrier.
*/
export const view_text_list_publication = function() {

	return true
}//end view_text_list_publication



/**
* RENDER
* Builds and returns the DOM node for component_publication when rendered in
* list mode with view 'text'.
*
* The output is a `<span>` whose `innerHTML` contains the resolved label of the
* current publication state (e.g. "Published"), joined by the context
* `fields_separator` when multiple entries are present (rare for this component).
*
* The element carries the standard Dédalo wrapper CSS classes so that
* shared styles targeting `.wrapper_component` apply without additional rules:
*   `wrapper_component <model> <mode> view_<view>`
*
* No event listeners are attached; the node is intentionally non-interactive.
* If interaction is needed, use `view_default_list_publication` instead.
*
* @param {Object} self - Live component_publication instance.
*   Expected properties:
*     `self.data`                  {Object}  — server response payload.
*     `self.data.entries`          {Array}   — array of resolved label strings.
*     `self.context`               {Object}  — component context from the server.
*     `self.context.fields_separator` {string} — delimiter for joining multiple entries.
*     `self.model`                 {string}  — component model identifier (CSS class).
*     `self.mode`                  {string}  — current render mode, e.g. 'list'.
*     `self.view`                  {string}  — current view, expected 'text' here.
* @param {Object} options - Caller options forwarded from the render router.
*   Not used by this view; accepted for interface parity with other view renderers.
* @returns {Promise<HTMLElement>} Resolves to the `<span>` wrapper element.
*/
view_text_list_publication.render = async function(self, options) {

	/// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// Join all entry labels with the context-defined separator.
		// For component_publication this array normally has 0 or 1 items,
		// so the join acts as a safe stringify for the common single-value case.
		const value_string	= entries.join(self.context.fields_separator)

	// wrapper. Set as span
		// A plain <span> is intentional: 'text' view must be safe to inline inside
		// block-level rich-text nodes without introducing layout side effects.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
