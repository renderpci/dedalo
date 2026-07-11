// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_LIST_COMPONENT_TEXT_AREA
* View-dispatch layer for component_text_area in list and time-machine (tm) modes.
*
* This module exports a single constructor whose prototype.list method is mixed into
* component_text_area via:
*
*   component_text_area.prototype.list = render_list_component_text_area.prototype.list
*   component_text_area.prototype.tm   = render_list_component_text_area.prototype.list
*
* When `component.render()` is called in list or tm mode it eventually calls
* `self.list(options)`, which arrives here. The method reads `self.context.view`
* (set from the ontology configuration) and delegates to the appropriate view module:
*
*   'mini'    → view_mini_text_area    — compact single-line representation used in
*                                        autocomplete drop-downs and datalists.
*   'note'    → view_note_text_area    — time-machine note button; clicking it opens a
*                                        modal with a nested edit-mode component_text_area
*                                        linked to the history record.
*   'text'    → view_text_list_text_area — plain inline <span> with the raw HTML value,
*                                          useful when the text is embedded inside another
*                                          component's rendered output (e.g. portals).
*   'default' → view_default_list_text_area — full list-mode block with a click-to-edit
*                                             handler that activates a modal edit overlay.
*
* Exports: {render_list_component_text_area}
*/

// imports
	import {view_default_list_text_area} from './view_default_list_text_area.js'
	import {view_mini_text_area} from './view_mini_text_area.js'
	import {view_note_text_area} from './view_note_text_area.js'
	import {view_text_list_text_area} from './view_text_list_text_area.js'



/**
* RENDER_LIST_COMPONENT_TEXT_AREA
* Constructor function. Acts as the prototype carrier for the list render method.
* No instance state is set here; all state lives on the component_text_area instance
* (self) that is passed into each view's render function.
* @returns {boolean} Always true (constructor no-op pattern used across Dédalo renderers)
*/
export const render_list_component_text_area = function() {

	return true
}//end render_list_component_text_area



/**
* LIST
* Resolves the active view name from the component context and delegates rendering to
* the matching view module. The returned HTMLElement is ready to be inserted into the
* DOM by the caller (component_common.prototype.render).
*
* Called as both `prototype.list` (list mode) and `prototype.tm` (time-machine mode)
* on component_text_area instances — the distinction is handled by the context, not
* by this method.
*
* View routing (self.context.view):
*   'mini'    → view_mini_text_area.render    — autocomplete / datalist thumbnail
*   'note'    → view_note_text_area.render    — TM note icon + modal edit overlay
*   'text'    → view_text_list_text_area.render — raw inline <span> with HTML content
*   'default' → view_default_list_text_area.render — standard list block with click-to-edit
*
* @param {Object} options - Render options forwarded verbatim to the chosen view module
* @returns {Promise<HTMLElement>} Resolves to the wrapper element built by the view
*/
render_list_component_text_area.prototype.list = async function(options) {

	const self = this

	// view
		// Read the view name from the component ontology context; fall back to 'default'
		// when the property is absent (most common case in normal list grids).
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			// Compact representation: plain text, no click-to-edit handler.
			// Used in autocomplete drop-downs, datalists, and portal thumbnails.
			return view_mini_text_area.render(self, options)

		case 'note':
			// Time-machine note button. Renders a small icon; clicking it lazily
			// creates or opens a linked history-note record inside a modal.
			return view_note_text_area.render(self, options)

		case 'text':
			// Inline <span> with the raw HTML value. Used when this component's
			// output is embedded inside another component's rendered HTML (e.g.
			// a portal that concatenates several field values into one string).
			return view_text_list_text_area.render(self, options)

		case 'default':
		default:
			// Full list-mode block. Attaches a click handler that activates a
			// 90%-wide modal containing the edit-mode renderer.
			return view_default_list_text_area.render(self, options)
	}
}//end list



// @license-end
