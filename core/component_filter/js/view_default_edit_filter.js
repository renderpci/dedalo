// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_filter.js'



/**
* VIEW_DEFAULT_EDIT_FILTER
* The default (full-panel) edit view for component_filter.
*
* component_filter displays a hierarchical checkbox tree that lets the user
* select one or more "projects" (or other filterable section entries).
* render_edit_component_filter.prototype.edit dispatches to one of several
* view strategies depending on context.view:
*   - 'default' / 'print' → this module (view_default_edit_filter)
*   - 'line'              → view_line_edit_filter
*
* This module exposes a single static method — render() — that assembles the
* full component wrapper (content area + optional toolbar buttons) and returns
* the root HTMLElement ready to be inserted into the DOM.
*
* Exports: view_default_edit_filter (constructor stub + static render)
*/
export const view_default_edit_filter = function() {

	return true
}//end view_default_edit_filter



/**
* RENDER
* Build and return the full component wrapper for the default edit view.
*
* Delegates content construction to get_content_data() (which builds the
* hierarchical checkbox tree from self.data.datalist) and button construction
* to get_buttons() (toolbar: list-navigation, reset, tools, fullscreen).
*
* Render levels:
*   - 'content' — return the bare content_data element without a wrapper or
*                 buttons. Used when only the inner tree needs refreshing (e.g.
*                 partial re-render after a data change).
*   - 'full' (default) — return the complete component wrapper that includes
*                 the content area and, when the user has write permissions,
*                 the buttons toolbar.
*
* Buttons are suppressed when self.permissions <= 1 (read-only mode). The
* 'print' view case in render_edit_component_filter forces permissions to 1
* before calling this function, so no special branching is needed here.
*
* The returned wrapper receives a `content_data` property pointer so callers
* (e.g. refresh routines) can reach the inner content node without re-querying
* the DOM.
*
* @param {Object} self - component_filter instance (provides .data, .context,
*   .permissions, .tipo, .node, .show_interface, and lifecycle methods)
* @param {Object} options - render options passed down from the edit dispatcher
* @param {string} [options.render_level='full'] - 'full' | 'content'
* @returns {Promise<HTMLElement>} wrapper element (render_level 'full') or the
*   content_data element (render_level 'content')
*/
view_default_edit_filter.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// content_data
	// Build the hierarchical checkbox tree. Early-return it unwrapped when the
	// caller only needs to refresh the inner content area (render_level 'content').
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
	// Only users with write access (permissions > 1) see the toolbar.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// ui build_edit returns component wrapper
	// Assembles the full <div class="wrapper_component …"> shell around
	// content_data and the optional buttons toolbar.
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		// Attach content_data directly to wrapper so refresh/re-render routines
		// can reference self.node.content_data without a DOM query.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
