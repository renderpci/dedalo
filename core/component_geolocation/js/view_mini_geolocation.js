// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_GEOLOCATION
* Read-only "mini" view for `component_geolocation` instances.
*
* The mini view is used in compact display contexts such as autocomplete suggestion
* rows, datalist dropdowns, and portal/relation thumbnails. It renders each stored
* geographic entry as a JSON string rather than attempting to display human-readable
* coordinates — coordinate objects are not directly renderable as plain text.
*
* Each entry in `self.data.entries` is a GeoJSON-like FeatureCollection object:
* ```json
* {
*   "type": "FeatureCollection",
*   "features": [{
*     "type": "Feature",
*     "properties": {},
*     "geometry": {
*       "type": "Point",
*       "coordinates": [longitude, latitude]
*     }
*   }]
* }
* ```
* All entries are JSON-stringified and joined with `self.context.fields_separator`
* (a server-defined delimiter, typically ', ') before being injected into the wrapper.
*
* Rendering pipeline (via `render`):
*   1. `self.data.entries` (array of GeoJSON objects) is read; defaults to [] when absent.
*   2. Each entry object is converted to a JSON string via `JSON.stringify`.
*   3. The strings are joined with `self.context.fields_separator`.
*   4. `ui.component.build_wrapper_mini` builds the container <span>.
*   5. The joined string is injected as inner HTML via `insertAdjacentHTML`.
*
* Unlike sibling mini views (`view_mini_date`, `view_mini_email`), this view does NOT
* call `attach_item_dataframe` — geolocation components do not support dataframe pairing.
*
* Invoked by:
*   - `render_list_component_geolocation.prototype.list` (when `context.view === 'mini'`)
*   - `render_edit_component_geolocation.prototype.edit` (when `context.view === 'mini'`)
*
* Exports only the constructor (used as a namespace) and `render`.
* No instance state is held on `view_mini_geolocation` itself; all data is read from `self`.
*
* @see render_list_component_geolocation.js  — list view dispatcher
* @see render_edit_component_geolocation.js  — edit view dispatcher
* @see ui.component.build_wrapper_mini       — mini <span> factory
* @see class.component_geolocation.php       — server-side data shape and GeoJSON format
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_GEOLOCATION
* Namespace constructor — not instantiated directly.
* All functionality is accessed via the static `render` method assigned below.
* @returns {boolean} Always true.
*/
export const view_mini_geolocation = function() {

	return true
}//end view_mini_geolocation



/**
* RENDER
* Builds the read-only mini wrapper node for a `component_geolocation` instance.
*
* Renders each GeoJSON entry as a raw JSON string because geolocation objects
* (FeatureCollection / Point coordinates) are not directly human-readable as plain
* text. Callers that need a map thumbnail or coordinate label should use
* `view_default_list_geolocation` instead.
*
* The wrapper is built first (before the value string) so that `build_wrapper_mini`
* can attach model/mode/view CSS classes to the element early. The value is then
* injected via `insertAdjacentHTML('afterbegin', …)`.
*
* (!) `self.data` is not guarded with `|| {}` here, unlike sibling views. If the
* component instance has no `data` property (e.g. during an aborted load), this
* will throw a TypeError. The caller is expected to ensure data is resolved before
* invoking `render`.
*
* @param {Object} self - The `component_geolocation` instance. Must expose:
*   - `self.data`                     {Object} — API response data object.
*   - `self.data.entries`             {Array}  — Array of GeoJSON FeatureCollection objects;
*                                                defaults to [] when absent.
*   - `self.context.fields_separator` {string} — Delimiter for joining multiple stringified
*                                                entries (server-configured, typically ', ').
* @param {Object} options - Reserved for future use; currently unused by this view.
* @returns {Promise<HTMLElement>} The mini <span> wrapper with stringified geo data
*   as inner HTML, ready to append to the DOM.
*/
view_mini_geolocation.render = async function(self, options) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// wrapper
		// Build the container <span> before value injection so CSS classes are applied early.
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		// GeoJSON objects are not human-readable as plain text, so each entry is
		// serialised to a JSON string. Multiple entries are joined with the
		// server-defined separator (e.g. ', ').
		const string_values = entries.map(el => {
			return JSON.stringify(el)
		})
		const value_string = string_values.join(self.context.fields_separator)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
