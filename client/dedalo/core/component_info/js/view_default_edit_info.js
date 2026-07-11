// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_content_value
	} from './render_edit_component_info.js'



/**
* VIEW_DEFAULT_EDIT_INFO
* Constructor placeholder for the default full edit view of component_info.
*
* component_info is a container component whose content is driven entirely by
* pluggable widgets defined in context.properties.widgets. Each widget is a
* separately-imported ES module resolved at runtime in component_info.get_widgets().
*
* This view is selected by render_edit_component_info.prototype.edit when
* options.view is 'default', unrecognised, or when the 'print' view has
* already lowered permissions to 1 before delegating here.
*
* All rendering logic lives on the static .render() method. The function itself
* is never invoked as a constructor; it exists only as a named namespace that
* other modules can import and call via view_default_edit_info.render().
*/
export const view_default_edit_info = function() {

	return true
}//end view_default_edit_info



/**
* RENDER
* Build and return the full component DOM node for the default edit view.
*
* Orchestration steps:
*   1. Resolve and (lazily) import all widget modules defined in
*      self.context.properties.widgets via self.get_widgets(). Already-loaded
*      widgets are updated in place rather than re-imported.
*   2. Build the content_data area, which renders each widget asynchronously
*      inside its own content_value slot (via get_content_data / get_content_value
*      from render_edit_component_info.js).
*   3. When options.render_level is 'content', return content_data directly
*      (used by the refresh path to replace only the inner area without
*      disturbing the outer wrapper or its event listeners).
*   4. Build the action-button toolbar (only for writers in edit mode), then
*      assemble the full wrapper via ui.component.build_wrapper_edit.
*
* Side effects:
*   - wrapper.content_data is set as a direct DOM property so callers can
*     reach individual widget slots (wrapper.content_data[i]).
*
* @param {Object} self - The component_info instance.
*   Expected properties: self.permissions {number}, self.mode {string},
*   self.show_interface {Object}, self.context {Object},
*   self.get_widgets {Function}.
* @param {Object} options - Render configuration.
*   @param {string} [options.render_level='full'] - 'full' returns the outer
*   wrapper; 'content' returns only the inner content_data element.
* @returns {Promise<HTMLElement>} The wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
view_default_edit_info.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// widgets load
	// (!) Must complete before get_content_data so that self.ar_instances is
	//     fully populated; get_content_data iterates self.ar_instances directly.
		await self.get_widgets()

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
	// Only rendered for users with write access (permissions > 1) in edit mode.
	// In search mode this block is skipped; build_wrapper_edit still receives
	// buttons:null, which causes it to omit the toolbar entirely.
		const buttons = (self.permissions > 1 && self.mode==='edit')
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		// Expose content_data on the wrapper so refresh/external callers can
		// target individual widget slots via wrapper.content_data[i].
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_BUTTONS
* Build and return the toolbar element for the component's action buttons.
*
* Only invoked when the caller has write access (permissions > 1) and the
* current mode is 'edit'. Buttons are driven exclusively by show_interface
* flags from context/request_config — no hardcoded checks:
*
*   show_interface.tools — when true, the standard per-instance tool buttons
*     (e.g. copy-from-language, delete-all) are appended via ui.add_tools.
*
* For component_info the 'add' button is intentionally absent: widget slots
* are defined in ontology properties, not added interactively by the user.
*
* @param {Object} self - The component_info instance.
*   Expected: self.show_interface {Object} (boolean flag map, derived from
*   context.properties.show_interface or request_config.show_interface).
* @returns {HTMLElement} buttons_container - The populated toolbar element,
*   built by ui.component.build_buttons_container.
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
