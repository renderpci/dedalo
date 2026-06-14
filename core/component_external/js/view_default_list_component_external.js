// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_LIST_COMPONENT_EXTERNAL
*
* Read-only list-mode view for component_external when no specialised view
* ('mini' or 'text') is requested.  This is the default branch dispatched by
* `render_list_component_external.prototype.list` when `context.view` is
* `'default'` or undefined.
*
* Responsibility:
*   - Join all resolved remote entries into a single human-readable string.
*   - Wrap that string in the standard Dédalo list wrapper produced by
*     `ui.component.build_wrapper_list`, which sets the correct CSS class names
*     (`wrapper_component`, model, tipo, section_tipo_tipo, `list`,
*     `view_default`) and applies any ontology-level custom CSS.
*   - Attach a click listener that switches the component from list view into
*     edit mode ('line' view) so that the user can trigger a fresh API lookup.
*
* Data contract (read from `self.data`):
*   `{ entries: string[] }` — zero or more resolved string values from the
*   remote external API, already formatted server-side according to the
*   `fields_map.format` configuration in the component's ontology properties.
*   When `entries` is empty the wrapper is rendered with an empty string.
*
* The entries are joined with the separator ' | ' to match the rendering
* convention used across all list views in component_external (see also
* `view_text_list_component_external` and `view_mini_list_external`).
*
* Exports:
*   `view_default_list_component_external` — constructor (no-op; used only as a
*   namespace for the static `render` method).
*
* @module view_default_list_component_external
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_COMPONENT_EXTERNAL
* Namespace constructor.  This function is never instantiated; it acts purely
* as a static namespace holder for the `render` method below.
* @returns {boolean} Always returns true (no-op).
*/
export const view_default_list_component_external = function() {

	return true
}//end view_default_list_component_external



/**
* RENDER
* Builds and returns the read-only list-mode DOM node for component_external.
*
* Steps:
*  1. Reads `self.data.entries` (string[]) and joins them with ' | '.
*  2. Delegates wrapper construction to `ui.component.build_wrapper_list`,
*     which creates a `<div>` with the standardised CSS classes, inserts the
*     joined value as a `<span>` child, and optionally wires Alt+click debug
*     logging when `SHOW_DEBUG` is active.
*  3. Attaches a `click` listener that calls `self.change_mode({ mode: 'edit',
*     view: 'line' })`, transitioning the component to edit mode so the user
*     can reload data from the remote API. `stopPropagation` prevents the click
*     from bubbling to parent section row handlers.
*
* @param {Object} self - The component_external instance. Must expose:
*   `self.data`          {Object}   — component data; `entries` array read here.
*   `self.model`         {string}   — ontology model name, e.g. 'component_external'.
*   `self.tipo`          {string}   — ontology tipo key.
*   `self.section_tipo`  {string}   — containing section's tipo key.
*   `self.context`       {Object}   — context object with `view`, `mode`, `css`.
*   `self.change_mode`   {Function} — component_common lifecycle method.
* @param {Object} options - Reserved for future use; currently ignored.
* @returns {Promise<HTMLElement>} The populated list wrapper element, ready to
*   be inserted into the DOM.
*/
view_default_list_component_external.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// Join multiple remote values with a visible separator.
		// Empty entries array produces an empty string, leaving the wrapper blank.
		const value_string	= entries.join(' | ')

	// wrapper
		// build_wrapper_list creates the outer <div> with standardised CSS classes
		// ('wrapper_component', model, tipo, section_tipo_tipo, 'list', 'view_default'),
		// injects a <span> containing value_string, and applies any ontology CSS rules.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		// Clicking the list view switches the component into edit mode ('line' view),
		// which triggers a new request to the configured remote API endpoint.
		// stopPropagation prevents the event from reaching parent row/section handlers.
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()

			self.change_mode({
				mode : 'edit',
				view : 'line'
			})
		})


	return wrapper
}//end render



// @license-end
