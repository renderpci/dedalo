// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_GEOLOCATION
* Namespace constructor for the default list view of component_geolocation.
* All view logic is attached as static properties (e.g. render) rather than
* prototype methods, following the Dédalo view-module convention.
* Used by render_list_component_geolocation when context.view is 'default'.
*/
export const view_default_list_geolocation = function() {

	return true
}//end view_default_list_geolocation



/**
* RENDER
* Builds the read-only list wrapper for a geolocation component.
* Each entry in data.entries is serialized to JSON and concatenated with
* context.fields_separator, producing a human-readable coordinate string
* suitable for grid and table display.
*
* Data shape for each entry (from component_geolocation):
*   { lat: number, lon: number, zoom: number, alt: number, lib_data?: Array }
*
* The click-to-edit handler is intentionally disabled (see commented-out block
* below the wrapper) — geolocation list cells are display-only; editing is
* triggered from the full edit view instead.
*
* @param {Object} self - The component_geolocation instance.
* @param {Object} options - Render options forwarded from render_list_component_geolocation.
* @returns {HTMLElement} wrapper - The list wrapper <div> containing the serialized coordinate string.
*/
view_default_list_geolocation.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// const value_string	= entries.join(' | ')

		// Serialize each geo entry to JSON; entries typically contain lat/lon/zoom/alt
		// and optionally a lib_data array of Leaflet layer payloads.
		const string_values = entries.map(el => {
			return JSON.stringify(el)
		})
		// Join multiple entries (rare for geolocation, which usually has one) with the
		// ontology-configured separator (context.fields_separator, e.g. ' | ').
		const value_string = string_values.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		// wrapper.addEventListener('click', function(e){
		// 	e.stopPropagation()

		// 	self.change_mode({
		// 		mode : 'edit',
		// 		view : 'line'
		// 	})
		// })


	return wrapper
}//end render



// @license-end
