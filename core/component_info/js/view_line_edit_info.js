// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_LINE_EDIT_INFO
* Compact single-line edit view for component_info.
*
* This view is selected when `context.view === 'line'` inside
* render_edit_component_info.prototype.edit.  It differs from
* view_default_edit_info in two ways:
*   - The component label is suppressed (label: null) so the wrapper
*     renders without a visible label column, keeping the row compact.
*   - No toolbar buttons are added; the view is intentionally read-only
*     in appearance regardless of the component's permission level.
*
* Exports:
*   view_line_edit_info  – namespace object; its static .render() method
*                          is the sole public entry point.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_content_value
	} from './render_edit_component_info.js'



/**
* VIEW_LINE_EDIT_INFO
* Namespace constructor for the line-edit view of component_info.
* Instantiation returns true immediately; all behaviour lives on the
* static method VIEW_LINE_EDIT_INFO.render.
*/
export const view_line_edit_info = function() {

	return true
}//end view_line_edit_info



/**
* RENDER
* Build and return the DOM subtree for the 'line' edit view of
* component_info.
*
* Behaviour by render_level:
*   'content' – resolves and returns only the content_data element
*               (the inner widget container), skipping the outer wrapper.
*               Useful when the caller embeds the component inside a
*               larger composite layout that supplies its own wrapper.
*   'full'    – default; returns the complete wrapper element produced
*               by ui.component.build_wrapper_edit, with content_data
*               appended and exposed as wrapper.content_data.
*
* The label is explicitly suppressed (label: null) to keep the line
* view compact.  No toolbar buttons are injected in this view.
*
* Side effects:
*   Calls self.get_widgets(), which dynamically imports and initialises
*   all widget modules listed in self.context.properties.widgets, storing
*   instances in self.ar_instances.
*
* @param {Object} self    - component_info instance providing context,
*                           data, and the get_widgets() method.
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'content' to return
*                           only the inner content_data node; 'full' (or
*                           omitted) to return the complete wrapper.
* @returns {Promise<HTMLElement>} Resolves to the wrapper element (full)
*                                 or the content_data element (content).
*/
view_line_edit_info.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// widgets load
		await self.get_widgets()

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null  // label suppressed to keep line view compact
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
