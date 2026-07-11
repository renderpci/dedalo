// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_number.js'



/**
* VIEW_DEFAULT_EDIT_NUMBER
* Default edit view for component_number.
*
* Acts as a namespace for the static render() method below. The constructor
* itself is a no-op placeholder; all rendering logic lives on the static
* method assigned directly to this function object.
*
* Selected by render_edit_component_number.prototype.edit when context.view
* is 'default', 'print', or absent. For 'print' the caller sets
* self.permissions = 1 before dispatching here so that get_content_data
* produces read-only text nodes instead of interactive number inputs.
*
* Main export: view_default_edit_number; callers invoke .render(self, options).
*/
export const view_default_edit_number = function() {

	return true
}//end view_default_edit_number



/**
* RENDER
* Build and return the full component DOM node for the default-edit view.
*
* When options.render_level is 'content', only the inner content_data node is
* returned (no wrapper, no buttons). This allows callers such as
* component_common.prototype.refresh to replace only the content area without
* re-creating the outer wrapper, preserving existing wrapper-level event listeners.
*
* Permissions guard: action buttons (add entry, tools) are only built for users
* with write access (self.permissions > 1). Read-only users (permissions === 1)
* still receive the full wrapper but with no buttons, and get_content_data will
* render static text nodes instead of interactive number inputs.
*
* Side effects:
*  - Sets wrapper.content_data pointer so callers and tool code can reach individual
*    entry nodes via self.node.content_data[i] after the render cycle.
*
* @param {Object} self - The component instance (component_number).
*   Expected properties: self.permissions, self.data, self.context,
*   self.show_interface, self.node.
* @param {Object} options - Render configuration.
*   options.render_level {string} 'full' (default) | 'content' — controls
*   whether to build the outer wrapper and buttons or only the content area.
* @returns {Promise<HTMLElement>} The wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
view_default_edit_number.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		// early return: content-only refreshes skip wrapper/button reconstruction
		if (render_level==='content') {
			return content_data
		}

	// buttons: only rendered for editors (permissions > 1); read-only users get none
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})
		// set pointers: expose content_data as a property on the wrapper node so
		// that refresh() and external callers can locate individual number entry nodes
		// via self.node.content_data[i] without querying the DOM by index.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
