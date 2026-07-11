// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_info} from './view_default_list_info.js'
	import {view_mini_info} from './view_mini_info.js'



/**
* RENDER_LIST_COMPONENT_INFO
* View-router for component_info in list and time-machine (tm) rendering modes.
*
* component_info is a composite component that hosts one or more sub-widgets
* (declared in context.properties.widgets). This module is the client-side
* entry point for the read/list context: it inspects `self.context.view` and
* delegates actual DOM construction to the matching view module:
*
*   'default' → view_default_list_info  (full list cell: loads all widgets and
*               renders them inside the standard list wrapper via get_content_data)
*   'mini'    → view_mini_info          (compact single-string chip for autocomplete
*               / datalist; joins entries with context.fields_separator)
*
* component_info.js wires this module's prototype methods onto the host class:
*   component_info.prototype.list = render_list_component_info.prototype.list
*   component_info.prototype.tm   = render_list_component_info.prototype.list
*
* The constructor is a no-op placeholder; it exists solely as a prototype carrier
* following the standard Dédalo render-module pattern (export a function, attach
* real behaviour to its prototype).
*/
export const render_list_component_info = function() {

	return true
}//end render_list_component_info



/**
* LIST
* Entry point for rendering a component_info instance in list (or tm) mode.
*
* Reads `self.context.view` to select the appropriate view renderer, then
* delegates to it — passing the live component instance (`self`) and any
* caller-supplied `options` verbatim.
*
* Called by `common.prototype.render` via `component_info.prototype.list`
* (and `prototype.tm`). The returned wrapper element is appended by the
* caller to the enclosing section list row.
*
* Note: the `return null` statement after the switch is unreachable because
* every switch branch — including the `default` fall-through — returns.
* It is retained as a guard placeholder consistent with other render modules.
*
* @param {Object} options - Render options forwarded unchanged to the view module.
*   Most list-mode views ignore this parameter.
* @returns {Promise<HTMLElement>} Resolves to the DOM wrapper built by the chosen view.
*/
render_list_component_info.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			// Compact chip: joins self.data.entries with context.fields_separator.
			// Used by autocomplete popups and datalist overlays.
			return view_mini_info.render(self, options)

		case 'default':
		default:
			// Full list cell: calls self.get_widgets() to load all sub-widgets,
			// then builds the content_data container via get_content_data().
			return view_default_list_info.render(self, options)
	}

	return null
}//end list



// @license-end
