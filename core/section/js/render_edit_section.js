// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_section} from './view_default_edit_section.js'



/**
* RENDER_EDIT_SECTION
* Static namespace that provides client-side rendering logic for sections in
* 'edit' mode.
*
* The module follows a two-level dispatch strategy:
*   1. `render_edit_section` itself is a namespace constructor (returns true).
*      Its methods are copied onto `section.prototype` in section.js, so when
*      a section instance calls `this.edit(options)` the function executes with
*      `this` bound to the section instance.
*   2. `render_edit_section.edit` inspects `this.context.view` to choose which
*      view module to delegate to.  An optional `render_views` array on the
*      section instance allows runtime plug-in of custom view modules without
*      touching this file (tools add entries to that array during `init`).
*
* The primary (and currently only) view is 'default', which delegates to
* `view_default_edit_section` for full DOM construction.
*/
export const render_edit_section = function() {

	return true
}//end render_edit_section



/**
* EDIT
* Entry point for rendering a section in edit mode.
* Assigned to `section.prototype.edit` in section.js, so `this` is the live
* section instance when called.
*
* Dispatch order for view resolution:
*   1. Check `this.render_views` (array populated by section.init and, optionally,
*      by external tools/plugins) for a descriptor whose `view` and `mode` match
*      the current instance.  If found, dynamically `import()` the module at the
*      given `path` (or auto-derive it from the `render` field) and delegate to
*      its named `.render(self, options)` export.
*   2. Fall through to the static `view_default_edit_section` import.
*
* Each view descriptor in `render_views` has the shape:
*   { view: string, mode: string, render: string, path?: string }
* where `render` is both the export name and (without `path`) the file stem.
*
* @param {Object} options - Rendering options forwarded to the chosen view module.
*   Recognised keys include `render_level` ('full' | 'content').
* @returns {Promise<HTMLElement>} The root wrapper element produced by the selected
*   view renderer, ready to be inserted into the DOM.
*/
render_edit_section.edit = async function(options) {

	const self = this

	// view
		// Resolved from context so that individual section configurations can
		// override the renderer without changing mode.
		const view	= self.context?.view || 'default'

	// wrapper
	switch(view) {

		case 'default':
		default: {
			// dynamic try
				// Check for a plugin-supplied or tool-supplied render_views override
				// before falling back to the bundled static import.  This allows
				// e.g. view_graph_edit_section to be loaded on demand without
				// importing every possible view module upfront.
				const render_view = (self.render_views || []).find(el => el.view === view && el.mode === self.mode)
				if (render_view) {
					const path			= render_view.path || ('./' + render_view.render +'.js')
					const render_method	= await import (path)
					return render_method[render_view.render].render(self, options)
				}

			return view_default_edit_section.render(self, options);
		}
	}
}//end edit



// @license-end
