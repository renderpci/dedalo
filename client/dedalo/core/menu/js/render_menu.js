// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_menu} from './view_default_edit_menu.js'



/**
* RENDER_MENU
* Render controller for the Dédalo top navigation menu component.
*
* Acts as a thin prototype host used by menu.js to delegate view rendering.
* menu.js assigns render_menu.prototype.edit to menu.prototype.edit (and .list),
* so every menu instance calls into this module for its HTML construction.
*
* Exports:
*   - render_menu        : constructor / prototype host (prototype-assignment pattern)
*   - render_section_label : shared helper that builds the contextual section label element
*
* The actual per-view HTML is produced by view_default_edit_menu (desktop/edit mode).
*/
export const render_menu = function() {

	return true
}//end render_menu



/**
* EDIT
* Dispatch rendering to the appropriate view implementation.
*
* Called via menu.prototype.edit (and menu.prototype.list, which is aliased to the same
* function). Reads self.context.view to pick the view variant; falls through to 'default'
* when the view is unset or unrecognised, which covers the normal desktop edit mode.
*
* @param {Object} options - Render options forwarded verbatim to the view renderer
*   (e.g. { render_level: 'full' | 'content' })
* @returns {Promise<HTMLElement>} Resolves to the wrapper element produced by the view
*/
render_menu.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'


	switch(view) {

		case 'default':
		default:
			// full with wrapper, label, buttons and content_data
			return view_default_edit_menu.render(self, options)
	}
}//end edit



/**
* RENDER_SECTION_LABEL
* Build a bare section-label `<div>` used as a placeholder in the menu bar.
*
* Creates the element in its initial 'inactive' state (no click handler attached).
* Callers are responsible for activating it: removing the 'inactive' class and
* inserting the section title via insertAdjacentHTML (see menu.prototype.update_section_label).
*
* The element receives the CSS class 'top_item' so the flex menu bar positions it
* correctly alongside the other top-level controls.
*
* @param {Object} self - The menu instance (unused by this function; kept for
*   signature parity so the caller does not need a conditional reference)
* @returns {HTMLElement} A detached `<div class="section_label top_item inactive">`
*/
export const render_section_label = function(self) {

	const section_label = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'section_label top_item inactive',
		title			: get_label.seccion || 'Section'
	})

	return section_label
}//end render_section_label



// @license-end
