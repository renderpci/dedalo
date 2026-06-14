// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_section_record} from './view_default_edit_section_record.js'
	import {view_text_section_record} from './view_text_section_record.js'
	import {view_mini_section_record} from './view_mini_section_record.js'



/**
* RENDER_EDIT_SECTION_RECORD
* View-dispatcher for section_record in edit mode.
*
* This constructor is assigned as a prototype method on section_record via:
*   section_record.prototype.edit = render_edit_section_record.prototype.edit
*
* It does not instantiate objects directly. Its sole role is to hold the
* `edit` prototype method that routes rendering to the correct view module
* based on `self.context.view`:
*   - 'default' (or absent) → view_default_edit_section_record
*   - 'mini'                → view_mini_section_record
*   - 'text'                → view_text_section_record
*/
export const render_edit_section_record = function() {

	return true
}//end render_edit_section_record



/**
* EDIT
* Render the section_record node in edit mode, delegating to the view module
* that matches `self.context.view`.
*
* Called by common.prototype.render when the section_record mode is 'edit'.
* `self` is the section_record instance (bound via prototype assignment in
* section_record.js, not by instantiating render_edit_section_record).
*
* View routing:
*   'default' — full edit layout via view_default_edit_section_record.render()
*   'mini'    — compact row used in sub-lists via view_mini_section_record.render()
*   'text'    — plain text representation via view_text_section_record.render()
*
* @param {Object} options - Render options passed through to the view module.
*   Supported keys vary by view; all views recognise:
*   - {string} [options.render_level='full'] — 'full' builds the outer wrapper;
*     'content' returns only the inner content_data node (used by partial re-renders).
* @returns {Promise<HTMLElement>} The rendered wrapper (or content_data node when
*   render_level === 'content').
*/
render_edit_section_record.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_section_record.render(self, options)

		case 'text':
			return view_text_section_record.render(self, options)

		case 'default':
		default:
			return view_default_edit_section_record.render(self, options)
	}
}//end edit



// @license-end
