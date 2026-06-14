// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'



/**
* MODULE: render_edit_service_tmp_section
*
* Client-side edit renderer for service_tmp_section.  Iterates over the
* pre-built component instances stored in `self.ar_instances` (each created by
* service_tmp_section.build() with `is_temporal: true` so they write to
* matrix_temp_manager instead of the main data matrix) and renders them inside
* a shared wrapper div.
*
* This module is intentionally minimal: all component lifecycle concerns
* (build, data loading, persistence) are handled by service_tmp_section.js;
* this file only covers the DOM assembly for edit mode.
*
* Exported symbols:
*   render_edit_service_tmp_section — constructor / prototype host for the
*                                     `edit` method mixed into service_tmp_section.
*   get_content_data                — async; assembles the content_data container
*                                     from all temporary component instances.
*
* The `self` argument accepted by each helper is the service_tmp_section instance
* (see service_tmp_section.js).  Key property consumed:
*   self.ar_instances — {Array} built component instances; populated by
*                       service_tmp_section.prototype.build.
*   self.model        — {string} model name used as the CSS class on the wrapper div.
*/



/**
* RENDER_EDIT_SERVICE_TMP_SECTION
* Constructor / prototype host.  Exists solely so that service_tmp_section can
* inherit the `edit` render method via prototype assignment
* (see service_tmp_section.js → prototype assign block).
* No instance state is initialised here.
*
* @returns {boolean} true (required by the prototype-assign pattern).
*/
export const render_edit_service_tmp_section = function() {

	return true
}//end render_edit_service_tmp_section



/**
* EDIT
* Entry point called by common.prototype.render when mode is 'edit'.
* Builds and returns the outer wrapper div (CSS class == self.model) that
* contains all rendered temporary component instances.
*
* When render_level is 'content' the inner content_data element is returned
* directly, which lets common.prototype.render splice only the inner node
* during partial refreshes without rebuilding the wrapper.
*
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' returns the wrapper div
*   with content_data appended; 'content' returns only the content_data element.
* @returns {Promise<HTMLElement>} wrapper div ('full') or content_data div ('content').
*/
render_edit_service_tmp_section.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		// Root element styled by the .less rule for self.model (e.g. service_tmp_section).
		// wrapper.content_data exposes the inner node so common.prototype.render can
		// splice it during 'content'-level re-renders.
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: self.model
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Assembles the top-level content_data div by delegating to render_tmp_components,
* which iterates over all pre-built temporary component instances and renders each
* one into a DocumentFragment that is then appended here.
*
* Exported so that other renderers (e.g. tool import helpers) can embed the
* temporary-section UI without going through the full edit lifecycle.
*
* @param {Object} self - The service_tmp_section instance.
* @returns {Promise<HTMLElement>} The assembled content_data div.
*/
export const get_content_data = async function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data')

	// render template
		// Render all temporary component instances into a fragment and append.
		const tmp_components_node = await render_tmp_components(self)
		content_data.appendChild(tmp_components_node)


	return content_data
}//end get_content_data



/**
* RENDER_TMP_COMPONENTS
* Iterates over every component instance in self.ar_instances, forces
* show_interface.tools to true so that each component renders its tool-button
* row, then calls instance.render() and appends the result to a DocumentFragment.
*
* Each instance was initialised with `is_temporal: true` by
* service_tmp_section.prototype.build, meaning its data is stored in
* matrix_temp_manager (a per-session scratch table) rather than the main
* section matrix.  All instances are expected to be in 'edit' mode; a warning
* is emitted if any instance has a different mode.
*
* @param {Object} self - The service_tmp_section instance.
* @returns {Promise<DocumentFragment>} Fragment containing all rendered component nodes.
*/
const render_tmp_components = async function(self) {

	const fragment = new DocumentFragment();

	const ar_instances			= self.ar_instances
	const ar_instances_length	= ar_instances.length
	for (let i = 0; i < ar_instances_length; i++) {

		const current_instance = ar_instances[i]

		// mode check
		// All instances are built with mode 'edit' by service_tmp_section.build;
		// any other mode indicates a misconfigured ddo_map entry.
		if (current_instance.mode!=='edit') {
			console.warn('Warning. Expected mode is edit but instance mode is :', current_instance.mode);
		}

		// show_interface
		// Force tool buttons to be visible regardless of the component's own
		// context.properties.show_interface setting, so users can interact with
		// (e.g. clear or populate) each temporary field before committing the import.
		current_instance.show_interface.tools = true

		const instance_node = await current_instance.render()
		fragment.appendChild(instance_node)
	}


	return fragment
}//end render_tmp_components



// @license-end

