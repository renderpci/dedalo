// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_GEOLOCATION
* Plain-text read-only list renderer for component_geolocation in 'text' view mode.
*
* Produces the lightest possible representation of a geolocation component's stored
* data: a bare <span> element whose innerHTML is the join of each entry serialised to
* a JSON string. Because geolocation entries are complex objects (lat/lon/zoom/alt plus
* an optional lib_data array of Leaflet GeoJSON layers), JSON.stringify is used instead
* of a human-readable format — the intent is machine-readable text suitable for copy,
* export, or embedding inside a report cell rather than end-user display.
*
* View routing:
*   render_list_component_geolocation.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default' → view_default_list_geolocation  (standard ui.component wrapper)
*     'mini'    → view_mini_geolocation          (compact span via ui.component.build_wrapper_mini)
*
* Exports:
*   view_text_list_geolocation        — constructor stub (no-op; all logic on the static render method)
*   view_text_list_geolocation.render — the async render function called by the list dispatcher
*/
export const view_text_list_geolocation = function() {

	return true
}//end view_text_list_geolocation



/**
* RENDER
* Build a plain <span> wrapper displaying each geolocation entry as a JSON string,
* separated by self.context.fields_separator.
*
* Each entry in self.data.entries is a full geolocation object of the shape:
*   {
*     id      : {number}            — database row id
*     lat     : {number}            — WGS-84 latitude  (decimal degrees)
*     lon     : {number}            — WGS-84 longitude (decimal degrees)
*     zoom    : {number}            — Leaflet map zoom level
*     alt     : {number}            — altitude in metres (may be 0 or null)
*     lib_data: {Array<Object>}     — optional Leaflet layer array; each element is
*                                     { layer_id: number, layer_data: GeoJSON FeatureCollection }
*   }
* JSON.stringify is applied to each entry so that all fields, including nested lib_data
* geometry, are preserved in the rendered text without lossy summarisation.
*
* Note: unlike view_text_list_check_box this renderer does NOT provide a fallback for
* self.context.fields_separator. If the context property is absent the join produces the
* string "undefined" as a separator. This is an existing behaviour — do not change code here.
*
* CSS classes applied to the wrapper:
*   'wrapper_component' — standard Dédalo component wrapper marker
*   self.model          — component model identifier ('component_geolocation')
*   self.mode           — current render mode (e.g. 'list', 'tm')
*   'view_<self.view>'  — current view variant (e.g. 'view_text')
*
* The dispatcher (render_list_component_geolocation.list) calls this as render(self, options),
* but the options argument is accepted in the signature and silently ignored — the 'text'
* view has no need for it, and JS does not error on surplus arguments.
*
* @param {Object} self - The component_geolocation instance.
*   Must expose:
*     self.data                       {Object}         Component data envelope.
*     self.data.entries               {Array<Object>}  Array of geolocation entry objects (may be empty).
*     self.context.fields_separator   {string}         Delimiter inserted between serialised entries.
*     self.model                      {string}         Component model name.
*     self.mode                       {string}         Current render mode.
*     self.view                       {string}         Current view variant.
* @param {Object} [options] - Render options forwarded by the dispatcher. Not used by this view.
* @returns {Promise<HTMLElement>} The constructed <span> element ready for DOM insertion.
*/
view_text_list_geolocation.render = async function(self, options) {

	// value fallback
		const data			= self.data || {}
		const entries		= data.entries || []
		// Serialise each entry object to a JSON string; preserves all nested geometry
		const string_values	= entries.map(el => {
			return JSON.stringify(el)
		})
		// Join using the context-configured separator (e.g. ' | ')
		const value_string	= string_values.join(self.context.fields_separator)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
