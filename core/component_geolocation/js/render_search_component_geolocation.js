// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/


// UNDER CONSTRUCTION. (!) NOTE THAT CURRENTLY, THIS COMPONENT IS NOT SHOWED IN SEARCH LIST


// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	}
	from './view_default_edit_geolocation.js'



/**
* RENDER_SEARCH_COMPONENT_GEOLOCATION
* Client-side search renderer for `component_geolocation`.
*
* Provides the entry point for rendering a `component_geolocation` instance when
* `mode === 'search'`. It is mixed into the component via prototype assignment in
* `component_geolocation.js`:
*   `component_geolocation.prototype.search = render_search_component_geolocation.prototype.search`
*
* Current status — UNDER CONSTRUCTION:
*   This component is not yet displayed in the search list. The `search` method
*   reuses `get_content_data` from `view_default_edit_geolocation.js`, which builds
*   the Leaflet map with coordinate inputs (lat, lon, zoom, alt). A future iteration
*   is expected to provide a dedicated search UI (e.g. bounding-box or proximity
*   filter) instead of the full edit map.
*
* Responsibilities:
* - Delegates content construction to `get_content_data` (shared with the edit view).
* - Wraps the result in a standard `wrapper_component` via
*   `ui.component.build_wrapper_search`, or returns only the inner `content_data`
*   element when a partial (content-only) render is requested.
*
* Data shape expected on `self.data`:
*   {
*     entries: [                  // zero or one geolocation entry (multi-entry not used)
*       {
*         lat: number,            // WGS-84 latitude
*         lon: number,            // WGS-84 longitude
*         zoom: number,           // Leaflet zoom level (integer)
*         alt: number,            // altitude in metres
*         lib_data: Array         // Leaflet FeatureGroup layer data (GeoJSON wrappers)
*       }
*     ]
*   }
*
* Exports:
*   `render_search_component_geolocation` — constructor (prototype carrier only)
*
* @see component_geolocation.js              Prototype assignment and component contract.
* @see view_default_edit_geolocation.js      Source of `get_content_data` shared with edit mode.
* @see ui.component.build_wrapper_search     Wrapper DOM factory for search-mode components.
*/



/**
* RENDER_SEARCH_COMPONENT_GEOLOCATION
* Constructor function (no-op body; all behaviour lives on the prototype).
* Mixed into `component_geolocation` via prototype assignment in `component_geolocation.js`;
* never called with `new` in normal use — it exists only to carry the `search` prototype method.
* @returns {boolean} true — satisfies the call-as-constructor identity contract.
*/
export const render_search_component_geolocation = function() {

	return true
}//end render_search_component_geolocation



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by `common.prototype.render` when `this.mode === 'search'`. Reuses
* `get_content_data` from `view_default_edit_geolocation.js` (the same function
* that builds the full edit map with coordinate inputs and Leaflet canvas). A
* dedicated search-specific content builder is not yet implemented.
*
* Two-level render contract (mirrored by all Dédalo search renderers):
*   - `render_level === 'content'`: return only the `content_data` HTMLElement.
*     Used by partial-refresh paths that need to replace just the map area without
*     rebuilding the outer wrapper and its event listeners.
*   - any other value (default `'full'`): return the complete `wrapper_component`
*     div built by `ui.component.build_wrapper_search`. The lifecycle layer places
*     this node into the section's search row and stores it in `self.node`.
*
* (!) `get_content_data` is async-compatible but returns synchronously in its current
* form; this method awaits it for forward-compatibility with any future async refactor.
*
* Side effects:
*   - `wrapper.content_data` is set to the `content_data` element so callers can
*     reach the inner DOM without a querySelector.
*   - Because `get_content_data` calls `when_in_viewport` to lazily initialise the
*     Leaflet map, the Leaflet library and its plugins are not loaded until the
*     map container scrolls into the viewport.
*
* @param {Object} options - Render options forwarded from the lifecycle layer.
* @param {string} [options.render_level='full'] - `'content'` returns only the
*   inner `content_data` div; any other value returns the full `wrapper_component`.
* @returns {Promise<HTMLElement>} The `wrapper_component` div (full render) or the
*   bare `content_data` div (content-only render).
*/
render_search_component_geolocation.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



// @license-end
