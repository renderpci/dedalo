// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data,
		get_buttons
	} from './render_edit_component_publication.js'



/**
* VIEW_DEFAULT_EDIT_PUBLICATION
* Default edit view for component_publication.
*
* Acts as a static-method namespace for render(). The constructor itself is a
* no-op placeholder; all rendering logic lives on the function-object property
* view_default_edit_publication.render assigned below.
*
* Dispatched by render_edit_component_publication.prototype.edit when
* context.view is 'default', 'print', or absent. For the 'print' case the
* caller pre-sets self.permissions = 1 so that get_content_data (inside
* render_edit_component_publication) produces a read-only text node instead of
* an interactive toggle switcher.
*
* The component_publication stores a binary publication state as a locator
* object (e.g. {type:'dd151', section_id:'1', section_tipo:'dd64',
* from_component_tipo:'rsc20'}).  section_id 1 means "published", section_id 2
* means "unpublished". The data.datalist array maps those section_ids to human-
* readable labels and carries the full locator values the change handler uses
* when toggling.
*
* Main export: view_default_edit_publication; callers invoke .render(self, options).
*/
export const view_default_edit_publication = function() {

	return true
}//end view_default_edit_publication



/**
* RENDER
* Build and return the full component DOM node for the default-edit view.
*
* When options.render_level is 'content', only the inner content_data node is
* returned (no wrapper, no buttons). This allows callers such as
* component_common.prototype.refresh to replace only the content area without
* re-creating the outer wrapper, preserving existing wrapper-level event listeners
* and the self.node reference.
*
* Permissions guard: action buttons (tools panel) are only built for users with
* write access (self.permissions > 1). Read-only users (permission === 1) receive
* the full wrapper but without buttons; get_content_data will also render a static
* label element instead of the interactive checkbox-based toggle switcher.
*
* Side effects:
*  - Sets wrapper.content_data pointer so callers and tool code can reach the
*    inner content area via self.node.content_data after the render cycle.
*
* @param {Object} self - The component_publication instance.
*   Expected properties:
*     self.permissions    {number}  1 = read-only, >1 = editor.
*     self.data           {Object}  {entries: Array<Object>, datalist: Array<Object>}
*     self.context        {Object}  Component context from the server response.
*     self.show_interface {Object}  Flags controlling which chrome elements are shown
*                                  (e.g. show_interface.tools for the tools panel).
*     self.node           {HTMLElement|null}  Current DOM wrapper, if already rendered.
* @param {Object} options - Render configuration.
*   options.render_level {string}  'full' (default) | 'content' — 'content' skips
*   the outer wrapper and buttons, returning only the inner content_data element.
* @returns {Promise<HTMLElement>} The outer wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
view_default_edit_publication.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		// Builds the inner content area containing one toggle switcher per entry.
		// Returns immediately when the caller only needs the content area (e.g. refresh).
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// Only produce the buttons container for editors; read-only users get null
		// and ui.component.build_wrapper_edit will simply omit the buttons slot.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		// Expose content_data as a named property on the wrapper element so that
		// refresh() and external callers can locate the content node without
		// querying the DOM by selector/index.
		wrapper.content_data = content_data


	return wrapper
}//end render



// @license-end
