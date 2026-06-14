// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_email} from './view_default_list_email.js'
	import {view_mini_email} from './view_mini_email.js'
	import {view_text_list_email} from './view_text_list_email.js'



/**
* RENDER_LIST_COMPONENT_EMAIL
* View-dispatch layer for component_email in list (read-only) and tm modes.
*
* This module is a thin router: it reads `self.context.view` and delegates
* rendering to the appropriate view module.  It is assigned to the
* component_email prototype via:
*   component_email.prototype.list = render_list_component_email.prototype.list
*   component_email.prototype.tm   = render_list_component_email.prototype.list
*
* Supported views:
*   'mini'    → view_mini_email     (compact inline display; no edit-in-list)
*   'text'    → view_text_list_email (plain-text span, no interactive widgets)
*   'default' → view_default_list_email (full list cell with click-to-edit modal)
*
* When no view is specified in context, 'default' is used as the fallback.
*/
export const render_list_component_email = function() {

	return true
}//end render_list_component_email



/**
* LIST
* View-dispatch method for list and tm rendering modes of component_email.
*
* Reads `self.context.view` to select the appropriate view renderer and
* delegates all DOM construction to that renderer.  Falls through to 'default'
* for any unrecognised view value, matching the behaviour of sibling
* render_list_* modules across the codebase.
*
* This method is also assigned to `component_email.prototype.tm` so that
* the time-machine (tm) mode reuses the same list rendering pipeline.
*
* @param {Object} options - Options forwarded verbatim to the selected view renderer
* @returns {Promise<HTMLElement>} Resolves to the rendered wrapper element
*/
render_list_component_email.prototype.list = async function(options) {

	const self = this

	// view
	// Resolve the display variant from context; fall back to 'default' when absent.
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_email.render(self, options)

		case 'text':
			return view_text_list_email.render(self, options)

		case 'default':
		default:
			return view_default_list_email.render(self, options)
	}
}//end list



// @license-end
