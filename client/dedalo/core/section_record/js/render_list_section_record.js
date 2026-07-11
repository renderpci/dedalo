// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



/**
* RENDER_LIST_SECTION_RECORD
* View-dispatcher prototype module for section_record list rendering.
*
* This module's sole responsibility is to inspect `self.context.view` and
* forward the `list` call to the correct view implementation:
*
*   - 'default'  → view_default_list_section_record  (full-column grid layout)
*   - 'mini'     → view_mini_section_record           (compact inline layout)
*   - 'text'     → view_text_section_record           (plain text / separator layout)
*
* The `list` prototype method defined here is mixed into `section_record` as both
* `section_record.prototype.list` and `section_record.prototype.search`
* (see section_record.js prototype assigns). It is never called standalone.
*
* View modules receive the full `section_record` instance (`self`) so that they
* can access `self.context`, `self.columns_map`, `self.datum`, and
* `self.get_ar_columns_instances_list()`.
*/

// imports
	import {view_default_list_section_record} from './view_default_list_section_record.js'
	import {view_mini_section_record} from './view_mini_section_record.js'
	import {view_text_section_record} from './view_text_section_record.js'



/**
* RENDER_LIST_SECTION_RECORD
* Constructor stub — this function is never instantiated directly.
* It exists only as a prototype carrier so that `list` can be assigned
* to `section_record.prototype` via the standard Dédalo mixin pattern.
* @returns {boolean} Always true (stub return, no construction performed).
*/
export const render_list_section_record = function() {

	return true
}//end render_list_section_record



/**
* LIST
* Render the section_record node for use in list (and search) mode.
*
* Reads `self.context.view` to select the appropriate view renderer, then
* delegates entirely to that renderer's `render(self, options)` static method.
* The returned HTMLElement is the section_record's DOM node for the current row.
*
* The same method is mounted on `section_record.prototype.search` so both
* list and search modes share identical rendering logic — only the upstream
* data source (full search vs. quick filter) differs.
*
* View routing table:
*   'mini'     → view_mini_section_record.render    — compact, inline layout with
*                  fields_separator between instances; used in portals and relation pickers.
*   'text'     → view_text_section_record.render    — pure-text layout with configurable
*                  column separators; used in label generation and compact displays.
*   'default'  → view_default_list_section_record.render (fallback for any unknown view)
*                — full column-grid layout with row hilite and responsive column support.
*
* @param {Object} options - Options forwarded verbatim to the selected view renderer.
*   Recognized keys vary by view; `view_default_list_section_record` accepts
*   `options.add_hilite_row` (boolean, default true).
* @returns {Promise<HTMLElement>} The rendered wrapper element for this record row.
*/
render_list_section_record.prototype.list = async function(options={}) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	// Delegate to the view-specific renderer. Each renderer receives the full
	// section_record instance so it can access columns_map, datum, and context.
	switch(view) {

		case 'mini':
			return view_mini_section_record.render(self, options)

		case 'text':
			return view_text_section_record.render(self, options)

		case 'default':
		default:
			return view_default_list_section_record.render(self, options)
	}
}//end list



// @license-end
