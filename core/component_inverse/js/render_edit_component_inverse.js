// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_inverse} from './view_default_edit_inverse.js'
	import {view_mini_inverse} from './view_mini_inverse.js'



/**
* RENDER_EDIT_COMPONENT_INVERSE
* Edit-mode render mixin for component_inverse.
*
* component_inverse is a read-only, computed component: it shows which sections
* reference the current record via portal or relationship fields (backlinks).
* No data is written by this component — the server computes inverse locators
* on the fly via section->get_inverse_references().
*
* This module follows the standard Dédalo prototype-assignment pattern:
* the constructor is a no-op placeholder; its prototype is the carrier for
* the edit() method that component_inverse.prototype.edit is wired to
* (see component_inverse.js).  The 'search' mode alias also points here
* (component_inverse.prototype.search = render_edit_component_inverse.prototype.edit).
*
* Exports:
*   render_edit_component_inverse — constructor / prototype carrier
*
* View routing handled by edit():
*   'mini'    — compact span; used in datalist/autocomplete dropdowns
*   'print'   — forces read-only (permissions=1) then falls through to 'default'
*   'default' — full wrapper with label, buttons (when permissions > 1), and content_data
*               showing one content_value per inverse locator entry
*
* Consumed context properties:
*   self.context.view {string} — selects the render variant; defaults to 'default'
*
* Data shape expected on self.data (from server):
*   entries {Array<{from_section_id: number, from_section_tipo: string,
*                   from_component_tipo: string}>}
*     Each entry is one inverse locator — a record in another section that
*     references the current record through a portal or relation component.
*
* Global references (declared in host pages):
*   get_label, page_globals, SHOW_DEBUG, flatpickr
*   (!) flatpickr is listed in the global directive but is NOT used in this file.
*       It is likely inherited from the shared directive template.
*/
export const render_edit_component_inverse = function() {

	return true
}//end render_edit_component_inverse



/**
* EDIT
* Render node for use in edit (and search) modes.
*
* Dispatches to the appropriate view renderer based on self.context.view.
* Because component_inverse never writes data, all views are effectively
* read-only presentations of computed inverse-locator entries.
*
* View routing:
*   'mini'    — compact inline span built by view_mini_inverse; used by
*               service_autocomplete and datalist dropdowns
*   'print'   — forces self.permissions to 1 (read-only), then falls through
*               to 'default' so view_default_edit_inverse renders without
*               interactive buttons.  The wrapper receives an extra CSS class
*               'view_print disabled_component' via ui.component.build_wrapper_edit.
*               Example wrapper class:
*               "wrapper_component component_inverse oh14 oh1_oh14 edit view_print disabled_component"
*   'default' — full wrapper with label row, optional buttons (permissions > 1),
*               and one content_value <div> per inverse locator showing the
*               from_section_id of each referencing record.
*
* (!) The 'print' case intentionally falls through to 'default' (no break/return).
*     It mutates self.permissions to 1 before the fall-through so that
*     view_default_edit_inverse suppresses edit controls.  This is a side effect
*     on the component instance that persists for the lifetime of the render call.
*
* @param {Object} options - Render options forwarded verbatim to the selected view renderer
* @returns {Promise<HTMLElement>} Resolved component wrapper node
*/
render_edit_component_inverse.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_inverse.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_inverse.render(self, options)
	}
}//end edit



// @license-end
