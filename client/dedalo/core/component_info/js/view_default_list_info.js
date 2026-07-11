// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_LIST_INFO
* Default list-view renderer for component_info.
*
* component_info is a composite component that hosts one or more pluggable
* widgets (loaded dynamically from core/widgets). This module provides the
* 'default' list view — the read-only representation shown inside record
* grids, section list tables, and portal cells.
*
* Unlike simple scalar components, component_info does not render a plain
* text string. Instead it delegates rendering to the widgets themselves:
*   1. self.get_widgets() imports each widget module in parallel and
*      initialises widget instances against the current data entries.
*   2. get_content_data() (from render_edit_component_info.js) builds
*      a container node, then appends each widget's rendered output as a
*      child content_value <div> (with a fade-in transition applied after
*      an idle-callback deferral).
*   3. The content_data node is appended to the standard list wrapper
*      produced by ui.component.build_wrapper_list.
*
* This view is activated by render_list_component_info when
* context.view is 'default' (or absent). The 'mini' variant is handled
* by view_mini_info instead.
*
* Exported symbol: view_default_list_info
*   .render(self, options) → Promise<HTMLElement>
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	} from './render_edit_component_info.js'



/**
* VIEW_DEFAULT_LIST_INFO
* Namespace constructor — never instantiated directly.
* All public API is attached as static properties (e.g. view_default_list_info.render).
*/
export const view_default_list_info = function() {

	return true
}//end view_default_list_info



/**
* RENDER
* Build the list wrapper node for component_info in its default view.
*
* Orchestration steps:
*   1. Loads (or refreshes) all widget instances declared in
*      self.context.properties.widgets by calling self.get_widgets(). Each
*      widget is dynamically imported and initialised in parallel; instances
*      are stored in self.ar_instances. Already-loaded instances have their
*      value/datalist updated in place rather than being reimported.
*   2. Calls get_content_data(self), which builds a <div class="content_data">
*      element and, for every widget instance in self.ar_instances, appends a
*      child <div class="content_value widget_item_<name>"> that eventually
*      receives the widget's rendered output via dd_request_idle_callback (see
*      render_edit_component_info.js → get_content_value for the deferred
*      fade-in rendering detail).
*   3. Creates the standard list wrapper via ui.component.build_wrapper_list,
*      which attaches component/model/tipo/section_tipo CSS classes and the
*      mode='list', view='default' markers.
*   4. Appends content_data into the wrapper and returns it.
*
* Note: unlike view_default_edit_info, this list view does not attach a
* buttons container or click-to-edit handler. The list view is read-only at
* the wrapper level; editing happens through the edit view (mode='edit').
*
* @param {Object} self    - component_info instance providing context and data.
*     self.context.properties.widgets {Array<Object>} - widget descriptors
*         from the ontology, each with { widget_name, path, ipo }.
*     self.data.entries   {Array<Object>} - raw data entries keyed by widget.
*     self.data.datalist  {Array<Object>} - supporting datalist entries.
*     self.ar_instances   {Array<Object>} - populated/refreshed by get_widgets().
* @param {Object} options - Render options (currently unused by this view;
*     passed through for API consistency with other view renderers).
* @returns {Promise<HTMLElement>} The constructed list wrapper element
*     containing all widget content nodes.
*/
view_default_list_info.render = async function(self, options) {

	// widgets load
		await self.get_widgets()

	// content_data
		const content_data = await get_content_data(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// Set value
		wrapper.appendChild(content_data)


	return wrapper
}//end render



// @license-end
