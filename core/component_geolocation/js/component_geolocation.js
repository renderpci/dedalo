// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB, L */
/*eslint no-undef: "error"*/



/**
* COMPONENT_GEOLOCATION
* Client-side controller for the geolocation component in Dédalo v7.
*
* Wraps a Leaflet map with one or more named FeatureGroups (layers). Each layer
* stores GeoJSON geometry (points, circles, polygons, polylines) that is
* serialised inside the component's `dato` under `entries[key].lib_data`.
*
* Key responsibilities:
* - Lazy-loading Leaflet, leaflet-geoman, turf.js, and iro.js via `load_libs`.
* - Creating the Leaflet map instance for every `data.entries` entry in `get_map`.
* - Keeping `current_value` in sync with the map view and geometry edits so the
*   save button always commits the most recent state.
* - Bridging with linked `component_text_area` instances through `event_manager`
*   events: inserting/removing geo-tags triggers `load_tag_into_geo_editor` /
*   `handle_click_no_tag`, while geometry edits publish `updated_layer_data_<id_base>`.
* - Responding to external portal selections (`map_update_coordinates`) so that
*   clicking a toponymy record re-centres the map to its own coordinates.
*
* Data shape stored in `data.entries[key]`:
* ```json
* {
*   "lat"      : 39.462571,
*   "lon"      : -0.376295,
*   "zoom"     : 16,
*   "alt"      : 0,
*   "lib_data" : [
*     {
*       "layer_id"        : 1,
*       "layer_data"      : { "type": "FeatureCollection", "features": [...] },
*       "user_layer_name" : "layer_1"
*     }
*   ]
* }
* ```
*
* Provider switch: controlled by `context.features.geo_provider` (OSM | GOOGLE |
* ARCGIS | NUMISDATA | VARIOUS). Only OSM has automatic light/dark tile swapping
* via a MutationObserver on `document.documentElement[data-theme]`.
*
* Main exports: `component_geolocation` constructor.
*/

// imports
	import {common} from '../../common/js/common.js'
	import {clone, get_json_langs, load_style, load_script} from '../../common/js/utils/index.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_geolocation, render_popup_text, render_color_picker} from '../../component_geolocation/js/render_edit_component_geolocation.js'
	import {render_list_component_geolocation} from '../../component_geolocation/js/render_list_component_geolocation.js'
	import {render_search_component_geolocation} from '../../component_geolocation/js/render_search_component_geolocation.js'



// OSM tile URLs per theme
// To switch to MapTiler dark tiles once you have an API key, replace TILE_URLS.dark with:
// 'https://api.maptiler.com/maps/streets-v4-dark/{z}/{x}/{y}.png?key=YOUR_KEY'

/** @type {Object} Leaflet tile URL templates indexed by UI theme name. */
const TILE_URLS = {
	light : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	dark  : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
}

/** @type {Object} Attribution HTML strings to display below the map per theme. */
const TILE_ATTR = {
	light : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	dark  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}

/**
* FN_IS_DARK
* Returns true when the page is currently rendered in dark mode.
* Detection relies on the `data-theme` attribute set by the Dédalo theme system
* on `document.documentElement`.
* @returns {boolean}
*/
const fn_is_dark   = () => document.documentElement.dataset.theme === 'dark'

/**
* FN_OSM_LAYER
* Builds a Leaflet tile layer pre-configured for the current light/dark theme.
* Automatically picks the correct TILE_URLS and TILE_ATTR entries.
* Called both at map creation time and again each time the MutationObserver
* detects a theme change (the old tile layer is removed before calling this).
* @param {Object} options - Extra Leaflet tileLayer options merged with defaults.
* @returns {Object} Leaflet TileLayer instance ready to be added to a map.
*/
const fn_osm_layer = (options = {}) => {
	const dark = fn_is_dark()
	return L.tileLayer(dark ? TILE_URLS.dark : TILE_URLS.light, {
		attribution : dark ? TILE_ATTR.dark : TILE_ATTR.light,
		maxZoom     : 19,
		...options
	})
}



/**
* COMPONENT_GEOLOCATION
* Constructor for the geolocation component client instance.
*
* All properties below are declared here for discoverability; most are
* populated by `component_common.prototype.init` and `init` in this file.
* The render views (edit/list/search) add further runtime properties
* (e.g. `node.content_data`) to the instance.
*/
export const component_geolocation = function(){

	/** @type {string} Unique instance identifier assigned by common.init. */
	this.id

	// element properties declare
	/** @type {string} Component model name, always 'component_geolocation'. */
	this.model
	/** @type {string} Structure tipo of this component (e.g. 'hierarchy31'). */
	this.tipo
	/** @type {string} Section tipo that owns this component. */
	this.section_tipo
	/** @type {number|string} Record identifier of the current section. */
	this.section_id
	/** @type {string} Render mode: 'edit' | 'list' | 'search' | 'tm'. */
	this.mode
	/** @type {string} Active data language code (e.g. 'lg-spa'). */
	this.lang
	/** @type {string} Language code used by the parent section. */
	this.section_lang

	/** @type {Object} Server-side context object (permissions, features, etc.). */
	this.context
	/** @type {Object} Server-side data object; `data.entries` holds coordinate records. */
	this.data

	/** @type {Object} Parent component or section instance. */
	this.parent
	/** @type {HTMLElement} Root DOM node for this component. */
	this.node

	/** @type {Array} Tool instances attached to this component. */
	this.tools

	/** @type {boolean} Whether duplicate entries are allowed (always false here). */
	this.duplicates = false
	/** @type {Array} Tokens returned by event_manager.subscribe calls, used for cleanup. */
	this.events_tokens
}//end component_geolocation



/**
* COMMON FUNCTIONS
* Extend component_geolocation with shared prototype methods from common and
* component_common modules.
*
* destroy is overridden locally to disconnect the MutationObserver that swaps
* OSM tile layers on theme changes before delegating to the base destroyer.
*/
// prototypes assign
	component_geolocation.prototype.build				= component_common.prototype.build
	component_geolocation.prototype.render				= common.prototype.render
	component_geolocation.prototype.destroy				= async function(delete_self=true, delete_dependencies=false, remove_dom=false) {
		const self = this
		// theme_observer watches document.documentElement[data-theme] to swap OSM tiles;
		// it must be disconnected here to prevent the callback referencing a torn-down map.
		if (self.theme_observer) {
			self.theme_observer.disconnect()
			self.theme_observer = null
		}
		// disconnect resize observers (created per content_value render)
		if (Array.isArray(self.resize_observers)) {
			self.resize_observers.forEach(observer => observer.disconnect())
			self.resize_observers = []
		}
		// release the Leaflet map: it holds tile layers, DOM and many self.map.on(...)
		// handlers that close over self. Without this the whole instance graph leaks.
		if (self.map) {
			try {
				self.map.off()
				self.map.remove()
			} catch (e) {
				console.warn('component_geolocation destroy: error removing map', e)
			}
			self.map = null
			self.tile_layer = null
			self.FeatureGroup = {}
		}
		return common.prototype.destroy.call(self, delete_self, delete_dependencies, remove_dom)
	}
	component_geolocation.prototype.refresh				= common.prototype.refresh
	component_geolocation.prototype.save				= component_common.prototype.save
	component_geolocation.prototype.load_data			= component_common.prototype.load_data
	component_geolocation.prototype.get_value			= component_common.prototype.get_value
	component_geolocation.prototype.set_value			= component_common.prototype.set_value
	component_geolocation.prototype.update_data_value	= component_common.prototype.update_data_value
	component_geolocation.prototype.update_datum		= component_common.prototype.update_datum
	component_geolocation.prototype.change_value		= component_common.prototype.change_value
	component_geolocation.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_geolocation.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_geolocation.prototype.list				= render_list_component_geolocation.prototype.list
	// (!) tm mode reuses the list render — no separate time-machine view for geolocation.
	component_geolocation.prototype.tm					= render_list_component_geolocation.prototype.list
	component_geolocation.prototype.edit				= render_edit_component_geolocation.prototype.edit
	component_geolocation.prototype.search				= render_search_component_geolocation.prototype.search

	component_geolocation.prototype.change_mode			= component_common.prototype.change_mode



/**
* INIT
* Initialises the geolocation component instance after the base component_common
* init has run. Sets all Leaflet-specific state properties to their defaults and
* establishes the geographic fallback position.
*
* Leaflet libraries are NOT loaded here; they are loaded lazily by `get_map` via
* `load_libs` to avoid blocking the page when the map is not yet in view.
*
* Event observations (e.g. `click_tag_geo` → `load_tag_into_geo_editor`) are wired
* up through the ontology properties config rather than explicitly here; see the
* in-code example below for the expected properties shape.
*
* @param {Object} options - Standard init options passed through from component_common.
* @returns {Promise<boolean>} Resolves to the result of component_common.prototype.init.
*/
component_geolocation.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await component_common.prototype.init.call(this, options);

	// Leaflet map state — all set to null/false/empty until get_map() creates the instance.
		self.ar_layer_loaded	= null  // Array<{layer_id, layer_data, user_layer_name}> cloned from data on get_map
		self.map				= null  // Leaflet Map instance
		self.tile_layer			= null  // active Leaflet TileLayer (OSM provider only)
		self.theme_observer		= null  // MutationObserver watching data-theme for dark mode tile swap
		self.layer_control		= false // Leaflet layer-control widget; false = not yet created

	// temporary data_value: component_geolocation does not save the values when the inputs change their value.
	// We need a temporary value for all current values of the inputs (lat, lon, zoom, alt)
	// to will be used for save it when the user clicks on the save button
		this.current_value = []

	// draw editor vars
		self.drawControl				= null   // unused placeholder; kept for future leaflet-draw migration
		self.draw_editor_is_initated	= false  // guards against double init_draw_editor calls
		self.FeatureGroup				= {}     // plain object keyed by layer_id → Leaflet FeatureGroup
		self.active_layer_id			= 1      // layer_id that receives new geometry from the toolbar

	// Data buffer will store the changes send by text area when the tags are removed or inserted
	// if the user undo the remove tag in the editor, restore for the data_buffer the layer data
	// this var will not save in DB, if the user delete the tag and do not undo in the same session or close the window the buffer will erase
		self.ar_data_buffer = []  // sparse array indexed by layer_id; allows undo of geo-tag removal

	// self default value when the component doesn't has any value, data = null
	// default value — Valencia city centre; used when data.entries is absent or empty
		self.default_value = {
			lat		: 39.462571,
			lon		: -0.376295,
			zoom	: 16,
			alt		: 0
		}

	// load dependencies js/css. Set the self specific libraries and variables not defined by the generic init
		// await self.load_libs()

	// event subscriptions
		// (!) Note that component properties could set observe events like (numisdata264, hierarchy31):
		// {
		//   "client": {
		//     "event": "click_tag_geo",
		//     "perform": {
		//       "function": "load_tag_into_geo_editor"
		//     }
		//   },
		//   "component_tipo": "numisdata19"
		// }


	return common_init
}//end init



/**
* LOAD_LIBS
* Lazy-loads all third-party scripts and stylesheets required by the map editor,
* in dependency order:
*  1. Leaflet CSS + JS  — must resolve before geoman attaches itself to L.
*  2. leaflet-geoman CSS + JS — drawing toolbar, geometry editing, and pm.* API.
*  3. json_langs — user-language lookup table used to set geoman's UI language.
*  4. turf.js — geometry calculations used by `get_popup_content` (area, distance).
*  5. iro.js — color-picker library used by `render_color_picker` in popups.
*
* CSS files are injected without awaiting because they do not block JS execution.
* Each JS `load_script` call is awaited so the dependent library is never reached
* before its dependency.
*
* (!) Leaflet exposes itself as the global `L` (listed in the `globals` pragma).
*     turf.js exposes `turf`; iro.js exposes `iro` — both used in this file.
*
* @returns {Promise<boolean>} Resolves true when all scripts have loaded.
*/
component_geolocation.prototype.load_libs = async function () {

	const self = this

	const license = null
			// `
			// /**
			//  *
			//  * @source: http://www.lduros.net/some-javascript-source.js
			//  *
			//  * @licstart  The following is the entire license notice for the
			//  *  JavaScript code in this page.
			//  *
			//  * Copyright (C) 2014  Loic J. Duros
			//  *
			//  *
			//  * The JavaScript code in this page is free software: you can
			//  * redistribute it and/or modify it under the terms of the GNU
			//  * General Public License (GNU GPL) as published by the Free Software
			//  * Foundation, either version 3 of the License, or (at your option)
			//  * any later version.  The code is distributed WITHOUT ANY WARRANTY;
			//  * without even the implied warranty of MERCHANTABILITY or FITNESS
			//  * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
			//  *
			//  * As additional permission under GNU GPL version 3 section 7, you
			//  * may distribute non-source (e.g., minimized or compacted) forms of
			//  * that code without the copy of the GNU GPL normally required by
			//  * section 4, provided you include this license notice and a URL
			//  * through which recipients can access the Corresponding Source.
			//  *
			//  * @licend  The above is the entire license notice
			//  * for the JavaScript code in this page.
			//  *
			//  */
			//  `

	// leaflet. (!) It's necessary to be fully loaded before 'geoman'
		load_style(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
		)
		await load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.js',
			license
		)

	// geoman
		load_style(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.css'
		)
		await load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet-geoman/leaflet-geoman.min.js',
			license
		)

	// load and set JSON langs file
		self.json_langs = self.json_langs || await get_json_langs()

	// turf
		await load_script(
			DEDALO_ROOT_WEB + '/lib/leaflet/dist/turf/turf.min.js',
			license
		)

	// iro
		await load_script(
			DEDALO_ROOT_WEB + '/lib/iro/dist/iro.min.js',
			license
		)


	return true
}//end load_libs



/**
* GET_MAP
* Creates and fully initialises a Leaflet map inside `map_container` for the
* entry at index `key` within `data.entries`. This is the main entry point
* called by the edit view for each entry row.
*
* Sequence:
*  1. Lazily loads Leaflet and companion libraries via `load_libs`.
*  2. Reads coordinate data from `data.entries[key]`; falls back to
*     `default_value` when entries is absent.
*  3. Clones the entry into `current_value[key]` and `ar_layer_loaded` so that
*     subsequent edits do not mutate the server-received data directly.
*  4. Constructs the Leaflet Map and tile layers according to
*     `context.features.geo_provider`. Provider-specific notes:
*     - OSM: single tile layer with automatic dark/light swap via MutationObserver.
*     - GOOGLE: uses the third-party `L.Google` plugin (must be loaded separately).
*     - ARCGIS: single satellite imagery tile layer.
*     - NUMISDATA: three base layers (dare, arcgis, osm) with a layer-selector control.
*     - VARIOUS: arcgis + osm base layers with a layer-selector control.
*  5. Attaches map-level event handlers (dragend, zoomend, click, overlayadd) that
*     keep `current_value[key]` and the coordinate input fields in sync.
*  6. On `whenReady`: initialises the geoman draw toolbar, sets the PM UI language
*     to match `page_globals.dedalo_data_lang`, and loads the first FeatureGroup.
*
* (!) Scroll-wheel zoom is intentionally disabled to avoid accidental zoom while
* scrolling the page. Enable it only if the map occupies the full viewport.
*
* @param {HTMLElement} map_container - The div that Leaflet will mount the map into.
* @param {number} key - Index into `data.entries` (and `current_value`) for this map.
* @returns {Promise<boolean>} Resolves true after map setup; does NOT wait for
*   `whenReady` to fire (that fires asynchronously after the DOM is painted).
*/
component_geolocation.prototype.get_map = async function(map_container, key) {

	const self = this

	// load libs
		await self.load_libs()

	// defaults — when data is absent use the component's geographic fallback position
		const entries = self.data.entries || [self.default_value]

	// get data
		const field_lat		= entries[key].lat
		const field_lon		= entries[key].lon
		const field_zoom	= entries[key].zoom
		const field_alt		= entries[key].alt

	// update the current_value with the data from DDBB
	// current_value will be update with different changes to create change_data to save
		self.current_value[key] = clone(entries[key])

	// load all layers — deep-clone so that geometry edits don't mutate data.entries
		self.ar_layer_loaded = typeof entries[key].lib_data!=='undefined'
			? clone(entries[key].lib_data)
			: []

	// map_data — normalise coordinates to x/y for L.LatLng construction
		const map_data = (typeof entries!=='undefined')
			? {
				x		: field_lat,
				y		: field_lon,
				zoom	: field_zoom,
				alt		: field_alt,
			  }
			: {
				x		: self.default_value.lat,
				y		: self.default_value.lon,
				zoom	: self.default_value.zoom,
				alt		: self.default_value.alt
			 }

	// new map vars
		let arcgis		= null
		let osm			= null
		let dare		= null
		let base_maps	= {}

	// Add layer to map — provider is configured per-section in context.features.geo_provider
		switch(self.context.features.geo_provider) {

			case 'OSM':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom})
				self.tile_layer = fn_osm_layer().addTo(self.map)

				// swap tile layer when the user toggles dark/light mode
				self.theme_observer = new MutationObserver(() => {
					self.map.removeLayer(self.tile_layer)
					self.tile_layer = fn_osm_layer().addTo(self.map)
				})
				self.theme_observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
				break;

			case 'GOOGLE':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				const googleLayer = new L.Google('ROADMAP');
				//map.addLayer(googleLayer);
				googleLayer.addTo(self.map);
				break;

			case 'ARCGIS':
				self.map = new L.Map(map_container, {center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});
				L.tileLayer('http://server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
				maxZoom: 18,
				attribution: 'Tiles &copy; Esri — '
					+ 'Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, '
					+ 'Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'}).addTo(self.map);
				break;

			case 'NUMISDATA':
				// LAYER
				// var dare = new L.TileLayer('http://dare.ht.lu.se/tiles/imperium/{z}/{x}/{y}.png');
				// dare = new L.tileLayer('http://pelagios.org/tilesets/imperium/{z}/{x}/{y}.png',{
				// 	maxZoom: 11
				// });
				// dare: Digital Atlas of the Roman Empire — ancient world tile overlay
				dare = new L.TileLayer('https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png',{
					maxZoom: 11
				});


				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

				osm = fn_osm_layer({ maxNativeZoom: 19 });

				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// LAYER SELECTOR — allows toggling among dare, arcgis, and osm base layers
				base_maps = {
					dare	: dare,
					arcgis	: arcgis,
					osm		: osm
				}
				if(self.layer_control===false) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}
				break;

			case 'VARIOUS':
				// LAYER
				arcgis = new L.tileLayer('//server.arcgisonline.com/ArcGIS/' + 'rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
				osm = fn_osm_layer();
				// MAP
				self.map = new L.map(map_container, {layers: [osm], center: new L.LatLng(map_data.x, map_data.y), zoom: map_data.zoom});

				// layer selector
				base_maps = {
					arcgis  : arcgis,
					osm 	: osm
				}
				if(self.layer_control===false) {
					self.layer_control = L.control.layers(base_maps).addTo(self.map);
				}
				break;
		}//end switch(self.context.features.geo_provider)

	// set active layer — when the user checks an overlay in the layer control, track it
		self.map.on('overlayadd', function(e) {
			self.active_layer_id = e.name
		})
		// self.map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })

	// disable zoom handlers — prevents unintentional zoom during page scroll
		self.map.scrollWheelZoom.disable();
		// disable tap handler, if present.
		// if (self.map.tap) self.map.tap.disable();

	// map move listeners — sync coordinate inputs and current_value after user interaction

		self.map.on('dragend', function(){

			// Update input values after the user pans the map
			self.update_input_values(
				key,
				{
					lat		: self.map.getCenter().lat,
					lon		: self.map.getCenter().lng,
					zoom	: self.map.getZoom()
				},
				map_container
			)
		});
		self.map.on('zoomend', function(){
			// Update input values after the user zooms the map
			self.update_input_values(
				key,
				{
					key		: key,
					lat		: self.map.getCenter().lat,
					lon		: self.map.getCenter().lng,
					zoom	: self.map.getZoom()
				},
				map_container
			)
		});
		self.map.on('click', function(e){
			// disable layers — clicking the map canvas (not a feature) exits geometry edit mode
			for (let feature in self.FeatureGroup) {
				const feature_group = self.FeatureGroup[feature]
				feature_group.eachLayer(function (layer){
					layer.pm.disable()
				});
			}
		})

	// map ready event — fires once Leaflet has painted its first frame
		self.map.whenReady(async function(){
			// init map editor — attaches geoman toolbar and pm:create/pm:cut/pm:remove events
				self.init_draw_editor()

			// set the lang of the tool — map geoman UI matches the user's Dédalo data language
				const json_langs = self.json_langs || await get_json_langs() || []
				if (json_langs.length<1) {
					console.error('Error. Expected array of json_langs but empty result is obtained:', json_langs);
				}
				const dedalo_lang	= page_globals.dedalo_data_lang
				const lang_obj		= json_langs.find(item => item.dd_lang===dedalo_lang)
				const lang			= lang_obj
					? lang_obj.tld2  // two-letter ISO 639-1 code consumed by geoman setLang
					: 'en'
				self.map.pm.setLang(lang);

			// check if the map has any layer loaded, if not create new one
				const check_layer_loaded = self.FeatureGroup[self.active_layer_id]
				if(!check_layer_loaded){
					// load_layer — create the default FeatureGroup for active_layer_id when none exists
					self.layers_loader({
						load 		: 'layer',
						layer_id	: self.active_layer_id
					})
				}
		});

	return true
}//end get_map



/**
* UPDATE_INPUT_VALUES
* Writes new coordinate values into both the visible `<input>` fields and the
* in-memory `current_value[key]` buffer. Called after every map drag, zoom, or
* external coordinate update so that the inputs always reflect the map state.
*
* The `alt` field is read back from the DOM rather than from `data` because
* altitude is entered manually by the user and not emitted by Leaflet map events.
*
* (!) This method intentionally does NOT call `set_changed_data`. Panning and
* zooming do not auto-save; only an explicit click of the save button commits the
* new position to the database. See the disabled block at the end of the method
* body for the original intent.
*
* @param {number} key - Index into `current_value` identifying the active entry.
* @param {Object} data - New coordinate values: `{lat, lon, zoom, [alt]}`.
* @param {HTMLElement} map_container - The map's root element; its `parentNode`
*   is expected to contain the `input[data-name=*]` coordinate fields.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.update_input_values = function(key, data, map_container) {

	const self = this

	const content_value = map_container.parentNode

	// inputs — found by data-name attribute within the same content_value wrapper
		const input_lat		= content_value.querySelector("input[data-name='lat']")
		const input_lon		= content_value.querySelector("input[data-name='lon']")
		const input_zoom	= content_value.querySelector("input[data-name='zoom']")
		const input_alt		= content_value.querySelector("input[data-name='alt']")

	// Set values to inputs — guard for inputs not present in the current view
		if (input_lat) input_lat.value	= data.lat
		if (input_lon) input_lon.value	= data.lon
		if (input_zoom) input_zoom.value = data.zoom

	// get the value from alt input — altitude is not provided by Leaflet events; read from the DOM
		if (input_alt) {
			data.alt = input_alt.value
				? parseFloat(input_alt.value)
				: null
		}

	// set the current value — keep in-memory buffer in sync for the next save
		self.current_value[key].lat		= data.lat
		self.current_value[key].lon		= data.lon
		self.current_value[key].zoom	= data.zoom
		// use != null so a valid altitude of 0 is stored and an explicit null clears it
		// (the previous truthiness check silently dropped both 0 and null).
		self.current_value[key].alt		= (data.alt != null) ? data.alt : null

	// track changes in self.data.changed_data
		// (!) DISABLED because, when changing the position of the map, it is not saved unintentionally.
		// If you want to save, always use the save button.
		/*
		// changed_data
			const changed_data_item = Object.freeze({
				action	: 'update',
				key		: key,
				value	: self.current_value[key]
			})
		// fix instance changed_data
			self.set_changed_data(changed_data_item)
		*/

	return true
}//end update_input_values



/**
* BUILD_CHANGED_DATA_ITEM
* Creates a frozen changed_data_item for the given key, using the contents of
* `current_value[key]` as the value to be persisted. Centralises the
* `{action, id, value}` shape that `set_changed_data` and `change_value` expect,
* so that every caller (update_draw_data, layer_data_change, map_update_coordinates)
* produces a consistent payload.
*
* The item is frozen via `Object.freeze` to prevent accidental mutation before
* it reaches the server request.
*
* @param {number} key - Index into `current_value` identifying the active entry.
* @returns {Object} Immutable changed_data_item: `{action:'update', id, value}`.
*/
component_geolocation.prototype.build_changed_data_item = function(key) {

	const self = this

	const changed_data_item = Object.freeze({
		action	: 'update',
		id		: self.current_value[key]?.id || null,
		value	: self.current_value[key]
	})

	return changed_data_item
}//end build_changed_data_item



/**
* HANDLE_COORD_CHANGE
* Unified handler for coordinate input changes (lat, lon, zoom, alt) fired when
* the user types directly into the lat/lon/zoom/alt input fields in the edit view.
*
* Updates `current_value[key][name]`, marks the component as dirty
* (`is_data_changed = true`), and immediately moves the Leaflet map to the new
* position. Map updates are guarded against NaN so that partial keyboard input
* (e.g. a leading minus sign) does not crash Leaflet's LatLng constructor.
*
* (!) altitude ('alt') changes do NOT update the map — Leaflet's 2-D map has no
* vertical dimension. The value is stored in current_value only, to be included
* in the next save payload.
*
* @param {number} key - Index into `current_value` for the active entry.
* @param {string} name - Field being changed: 'lat' | 'lon' | 'zoom' | 'alt'.
* @param {number|null} val - Parsed numeric value from the input field.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.handle_coord_change = function(key, name, val) {

	const self = this

	// ensure current_value[key] exists — may not yet be set if map hasn't loaded
	self.current_value[key] = self.current_value[key] || {}
	self.current_value[key][name] = val

	// mark as changed
	self.is_data_changed = true

	// map updates
	if (self.map) {
		const lat	= self.current_value[key].lat
		const lon	= self.current_value[key].lon
		const zoom	= self.current_value[key].zoom

		if (name === 'lat' || name === 'lon') {
			if (!isNaN(lat) && !isNaN(lon)) {
				self.map.panTo(new L.LatLng(lat, lon))
			}
		} else if (name === 'zoom') {
			if (!isNaN(zoom)) {
				self.map.setZoom(zoom)
			}
		}
	}

	if (SHOW_DEBUG === true) {
		console.log(`changed ${name} value to:`, val);
	}

	return true
}//end handle_coord_change



/**
* REFRESH_MAP
* Forces Leaflet to recalculate tile coverage and redraw after the map container
* has been resized (e.g. when a panel is expanded or a tab is shown).
*
* `invalidateSize` is the Leaflet-recommended approach; the older private API
* `_onResize` is left in a comment for historical reference but must not be used.
*
* @param {Object} map - A Leaflet Map instance.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.refresh_map = function(map) {

	//map._onResize();
	map.invalidateSize(); // Force refresh map

	return true
}//end refresh_map



/**
* LAYERS_LOADER
* Dispatcher that either loads a single named layer or reloads every layer in
* `ar_layer_loaded`, depending on `options.load`.
*
* Modes:
* - 'layer': Load (or create) the FeatureGroup for `options.layer_id`. If the id
*   does not yet exist in `ar_layer_loaded`, a new empty layer entry is appended
*   and then passed to `load_layer`. This is used when a geo-tag is inserted into
*   a linked `component_text_area`.
* - 'full': Iterates all entries in `ar_layer_loaded` and calls `load_layer` on
*   each. After loading, activates all overlay checkboxes in the layer control by
*   programmatically clicking unchecked ones. Used when the geo-tag selection is
*   cleared (no tag focused).
*
* (!) 'full' mode accesses the private `_layers` and `_layerControlInputs` arrays
* on the Leaflet layer-control widget. These are undocumented Leaflet internals and
* may break on Leaflet upgrades.
*
* @param {Object} options - Dispatch options.
* @param {string} [options.load='full'] - 'layer' to load one layer, 'full' for all.
* @param {number|null} [options.layer_id=null] - Required when load is 'layer'.
* @returns {boolean} True on success; false if ar_layer_loaded is absent in 'layer' mode.
*/
component_geolocation.prototype.layers_loader = function(options) {

	const self = this

	// options
		const load		= options.load || 'full' // layer|full
		const layer_id	= options.layer_id || null // optional on full load

	// load_layer
		switch(load) {

			case ('full'):
				const ar_layer		=  self.ar_layer_loaded
				if (ar_layer && Array.isArray(ar_layer)) {
					const ar_layer_len	= ar_layer.length
					for (let i = 0; i < ar_layer_len; i++) {
						const layer = ar_layer[i]
						self.load_layer(layer)
					}
				}
				// active all layer in control — simulate checkbox clicks for unchecked overlays
				if (self.layer_control && self.layer_control._layers) {
					const control_layers_len = self.layer_control._layers.length
					for (let i = 0; i < control_layers_len; i++) {
						const layer = self.layer_control._layers[i]
						if(layer.overlay){
							const input = self.layer_control._layerControlInputs[i]
							if(input && !input.checked){
								input.click()
							}
						}
					}
				}
				break;

			case ('layer'):
				if (!self.ar_layer_loaded) return false
				const loaded_layer = self.ar_layer_loaded.find((item) => item.layer_id === layer_id)
				// if the layer is not in the ar_layer_loaded, it will be new layer (ex:comes form new tag)
				// create new layer data with the new id and set to ar_layer_loaded
				const layer = typeof(loaded_layer)!=='undefined'
					? loaded_layer
					: (function(){
						const new_layer = {
							layer_id	: layer_id,
							layer_data	: []
						}
						self.ar_layer_loaded.push(new_layer)
						return new_layer
					  })()
				self.load_layer(layer)
				break;

			default:
				console.warn('Ignored invalid load mode:', load);
				break;
		}//end switch


	return true
}//end layers_loader



/**
* LOAD_LAYER
* Renders a single named layer (FeatureGroup) onto the Leaflet map. Called by
* `layers_loader` for both 'full' and 'layer' modes, and also directly from
* `layer_data_change` during tag insert/remove undo flows.
*
* Terminology:
* - A Dédalo *layer* (`{layer_id, layer_data, user_layer_name}`) maps 1-to-1 to a
*   Leaflet `FeatureGroup` stored in `self.FeatureGroup[layer_id]`.
* - A GeoJSON *feature* inside `layer_data.features` maps to a Leaflet geometry
*   (Marker, Circle, Polygon, Polyline).
*
* Behaviour when the FeatureGroup does NOT yet exist:
*  1. Creates a new `L.FeatureGroup` and registers it as the geoman layerGroup.
*  2. Adds it to the map and registers it in the layer control as an overlay.
*
* Behaviour when the FeatureGroup ALREADY exists (e.g. switching active tag):
*  1. Removes all currently visible FeatureGroups from the map.
*  2. Re-adds only the requested one and updates the geoman target.
*
* For each GeoJSON feature, `L.geoJson` is used with:
* - `pointToLayer`: converts circle-shaped points (stored as GeoJSON Point with
*   `properties.shape='circle'`) back to `L.Circle`; other points become `L.Marker`.
* - `onEachFeature`: delegates to `init_feature` to add click handlers, popups,
*   and colour styling.
*
* geoman events attached to the FeatureGroup:
* - `pm:update` / `pm:edit` — serialise geometry back to `ar_layer_loaded` and
*   refresh the popup.
* - `pm:markerdrag` — refreshes the popup with new coordinates during drag
*   (geometry data is NOT serialised until `pm:edit` fires on drag end).
*
* @param {Object} layer - Layer descriptor from `ar_layer_loaded`.
* @param {number} layer.layer_id - Numeric id used as the FeatureGroup key.
* @param {Object|Array|string} layer.layer_data - GeoJSON FeatureCollection, or
*   empty array/string indicating no existing geometry.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.load_layer = function(layer) {

	const self = this

	// set the layer data
		const layer_id				= layer.layer_id
		const layer_data			= layer.layer_data
		// const layer_name			= 'layer_' +layer_id
		// const user_layer_name	= typeof(layer.user_layer_name)!=='undefined'
		// 	? layer.user_layer_name
		// 	: layer_name

	// FEATUREGROUP BUILD : Verify if exist FeatureGroup, else create it. map is global var
	// if( self.map.hasLayer(self.FeatureGroup[layer_id])===false ) {
		if( typeof self.FeatureGroup[layer_id] === 'undefined'){

			// the FeatureGroup is not loaded and does not exist into the map
			// Create a new FeatureGroup
			self.FeatureGroup[layer_id] = new L.FeatureGroup();
			self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})


			// set the FeatureGroup to the map
			self.FeatureGroup[layer_id].addTo(self.map);
			// add to the layer control with checkbox and the name of the user
			self.layer_control.addOverlay(self.FeatureGroup[layer_id], layer_id);
		}else{
			// FeatureGroup exist and it's loaded
			// remove the checkbox for all FeatureGroup into the control panel (remove the visualization)
			for (let feature in self.FeatureGroup) {
				self.FeatureGroup[feature].remove()
			}

			// add to the layer control with checkbox and the name of the user
			self.FeatureGroup[layer_id].addTo(self.map);
			// self.FeatureGroup[layer_id].options.tag_id = layer_id
			self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})
		}

	// LAYERS : Load GeoJSON features from stored layer_data into the FeatureGroup
		if (typeof layer_data!=='undefined' && layer_data!=='undefined' && layer_data!=='') {
			// remove previous data into the layer — prevents duplicate features on repeated calls
			self.FeatureGroup[layer_id].clearLayers();

			// update the feature data — fires when geoman finishes moving a vertex
			self.FeatureGroup[layer_id].on('pm:update', (e) => {
				self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
			});

			// finish the editing feature data — fires when leaving edit mode
			self.FeatureGroup[layer_id].on('pm:edit', (e) => {
				self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
			});

			// when the user drag a handler update the popup data
			// (!) update_draw_data is intentionally NOT called here — serialisation
			// happens on pm:edit (drag end) to avoid excessive writes during drag
			self.FeatureGroup[layer_id].on('pm:markerdrag', (e) => {
				// self.update_draw_data(layer_id);
				// recalculate the popup
				const content = self.get_popup_content(e.layer, layer_id);
				if (content) {
					e.layer.bindPopup(content,{
						minWidth : 155
					});
				}
			});

			self.FeatureGroup[layer_id].options.tag_id = layer_id
			self.map.pm.setGlobalOptions({layerGroup: self.FeatureGroup[layer_id]})

			L.geoJson( layer_data, {
				pointToLayer: (feature, latlng) => {
					// circles are stored as GeoJSON Point with shape='circle'; restore the radius
					if (feature.properties.shape==='circle') {
						return new L.Circle(latlng, feature.properties.radius);
					} else {
						return new L.Marker(latlng);
					}
				},
				// For each Feature load all layer data of the tag
				onEachFeature: function (feature, data_layer) {
					init_feature({
						self		: self,
						data_layer	: data_layer,
						layer_id	: layer_id,
						feature		: feature
					})
				}//end onEachFeature
			})//end L.geoJson
		}//end if (typeof layer_data!=="undefined" && layer_data!=="undefined" && layer_data!=="")

	// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
		self.active_layer_id = layer_id;

	// enable Edit Mode
		// self.FeatureGroup[layer_id].pm.enable();

	return true
}//end load_geo_editor



/**
* LOAD_TAG_INTO_GEO_EDITOR
* Event handler invoked when the user clicks a geo-tag image inside a linked
* `component_text_area`. The tag carries the `tag_id` that identifies which
* FeatureGroup to activate in the map editor.
*
* (!) This method is wired up through the ontology `properties.observe` config
* (event: 'click_tag_geo', perform.function: 'load_tag_into_geo_editor') rather
* than a hard-coded event subscription.
*
* @param {Object} options - Event payload.
* @param {Object} options.caller - The `component_text_area` instance that fired the event.
* @param {Object} options.tag - Tag descriptor from the text editor.
* @param {string} options.tag.tag_id - Numeric string id of the geo-tag (parsed to int).
* @param {Object} options.text_editor - The CKEditor service instance managing the text.
* @returns {Promise<boolean>} Resolves true after the layer is loaded.
*/
component_geolocation.prototype.load_tag_into_geo_editor = async function(options) {

	const self = this

	// options
		const tag_obj = options.tag

	// layer_id
		const layer_id = parseInt(tag_obj.tag_id)

	// load_layer
		self.layers_loader({
			load		: 'layer',
			layer_id	: layer_id
		})

	return true
}//end load_tag_into_geo_editor



/**
* HANDLE_CLICK_NO_TAG
* Event handler invoked when the user clicks inside a linked `component_text_area`
* but NOT on a geo-tag image — i.e. a generic click with no tag target.
*
* Responds by loading all stored layers onto the map simultaneously ('full' mode),
* which gives the user a complete view of all geometry when no specific tag is focused.
*
* (!) Like `load_tag_into_geo_editor`, this is wired via ontology properties.observe
* rather than an explicit subscription. The event name on the text_area side is
* typically 'click_no_tag_geo'.
*
* @param {Object} options - Event payload.
* @param {Object} options.caller - The `component_text_area` instance that fired the event.
* @returns {Promise<boolean>} Resolves true after all layers are loaded.
*/
component_geolocation.prototype.handle_click_no_tag = async function(options) {

	const self = this

	// load_layer ('full' indicates load all layers)
		self.layers_loader({
			load		: 'full',
			layer_id	: null
		})

	return true
}//end handle_click_no_tag



/**
* GET_DATA_TAG
* Builds the `data_tag` descriptor that a linked `component_text_area` uses when
* inserting a new geo-tag into the rich-text editor. The tag references this
* component's current layers so the text-area can render the correct layer list
* in its tag dialogue.
*
* `last_layer_id + 1` pre-increments the next available id so the text_area can
* assign a unique id to the freshly inserted tag without querying the component.
*
* @returns {Object} data_tag descriptor:
*   `{type:'geo', tag_id:null, state:'n', label:'', data:'',
*     last_layer_id:<number>, layers:[{layer_id, user_layer_name}]}`
*/
component_geolocation.prototype.get_data_tag = function() {

	const self = this

	const lib_data 		= self.get_lib_data()
	const last_layer_id = self.get_last_layer_id()

	// layers — strip layer_data from the descriptor; text_area only needs identity fields
	const layers = lib_data.map((item) => {
		const layer = {
			layer_id		: item.layer_id,
			user_layer_name	: item.user_layer_name
		}
		return layer
	})

	const data_tag = {
		type			: 'geo',
		tag_id			: null,
		state			: 'n',
		label			: '',
		data			: '',
		last_layer_id	: last_layer_id+1,
		layers			: layers
	}

	return data_tag
}//end get_data_tag



/**
* GET_LIB_DATA
* Returns the `lib_data` array from the first data entry (`data.entries[0]`).
* `lib_data` is the Leaflet-specific geometry store: an array of layer descriptors,
* each with `{layer_id, layer_data (GeoJSON FeatureCollection), user_layer_name}`.
*
* Falls back to a single default layer (`layer_id:1`, empty geometry) when:
* - `data.entries` is absent or empty, or
* - `data.entries[0].lib_data` is not defined (component has no saved geometry).
*
* (!) Only entries[0] is read — the component currently supports a single
* coordinate entry per record. If multi-entry support is added later, this method
* will need to accept a `key` parameter.
*
* @returns {Array} Array of `{layer_id, layer_data, user_layer_name}` descriptors.
*/
component_geolocation.prototype.get_lib_data = function() {

	const self = this

	const lib_data = self.data.entries && typeof(self.data.entries[0])!=='undefined' && typeof(self.data.entries[0].lib_data)!=='undefined'
		? self.data.entries[0].lib_data
		: [{
				layer_id		: 1,
				layer_data		: [],
				user_layer_name	: 'layer_1'
		  }]


	return lib_data
}//end get_lib_data



/**
* GET_LAST_LAYER_ID
* Returns the highest numeric `layer_id` currently present in `lib_data`.
* Used by `get_data_tag` to compute the next available id (`last_layer_id + 1`)
* for a freshly inserted geo-tag.
*
* `Math.max(...ar_layer_id)` returns `-Infinity` when `ar_layer_id` is empty, but
* `get_lib_data` always returns at least one entry (`layer_id: 1`) so this is safe
* in practice.
*
* @returns {number} The maximum layer_id found in lib_data.
*/
component_geolocation.prototype.get_last_layer_id = function() {

	const self = this

	const lib_data		= self.get_lib_data()
	const ar_layer_id	= lib_data.map((item) => item.layer_id)
	const last_layer_id	= Math.max(...ar_layer_id)

	return last_layer_id
}//end get_last_layer_id



/**
* GET_POPUP_CONTENT
* Builds the DOM node displayed inside a Leaflet popup when the user clicks a
* geometry shape. Content varies by layer type:
* - `L.Marker` — returns a formatted lat/lng string directly (no colour picker).
* - `L.Circle` — centre lat/lng, radius, circumference area, and a colour picker.
* - `L.Polygon` (Rectangle included) — computed area via turf.js, and colour picker.
* - `L.Polyline` — total distance in metres via Leaflet's `distanceTo`, and colour picker.
*
* (!) `L.Polygon` is a subclass of `L.Polyline` in Leaflet, so the instanceof
* checks MUST test `L.Polygon` before `L.Polyline`.
*
* The `ar_mesures` array is assembled with `{label, messure?, separator?}` items
* and passed to `render_popup_text` which builds the HTML structure. The colour
* picker node is then appended to the text container.
*
* Returns null implicitly when the layer type is not recognised (none of the
* instanceof checks match), in which case callers should not call `bindPopup`.
*
* @param {Object} layer - A Leaflet layer instance (Marker, Circle, Polygon, or Polyline).
* @param {number} layer_id - The numeric id of the parent FeatureGroup.
* @returns {HTMLElement|string} DOM node for the popup, or a lat/lng string for Markers.
*/
component_geolocation.prototype.get_popup_content = function(layer, layer_id) {

	const self = this
	const ar_mesures = []
	// Marker - add lat/long
	if (layer instanceof L.Marker) {
		return this.str_lat_lng(layer.getLatLng());

	// Circle - lat/long, radius
	// (!) Check Circle before Polygon — L.Circle extends L.Path, not L.Polygon,
	// but it's listed first here for clarity. Order relative to Polygon is safe.
	} else if (layer instanceof L.Circle) {
		const center	= layer.getLatLng()
		const radius	= layer.getRadius()
		const area		= (2 * Math.PI * radius).toFixed(2);

		ar_mesures.push(
			{
				label: "Center: "+this.str_lat_lng(center)
			},{
				label: "Radius: "+this.round_coordinate(radius, 2),
				messure: 'm'
			},{
				label: "Area: "+ area,
				messure: 'm'
			},{
				label: "Color: ",
				separator: false
			}
		)

	// Rectangle/Polygon - area
	// (!) Must come before L.Polyline because L.Polygon extends L.Polyline
	} else if (layer instanceof L.Polygon) {

		// const latlngs	= layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		const geojson		= layer.toGeoJSON()
		// turf.area computes geodesic area in square metres from a GeoJSON feature
		const area			= turf.area(geojson)

		ar_mesures.push(
			{
				label: "Area: "+readable_area(area, true)
			},{
				label: "Color: ",
				separator: false
			}
		)

	// Polyline - distance
	} else if (layer instanceof L.Polyline) {
		const latlngs = layer._defaultShape ? layer._defaultShape() : layer.getLatLngs()
		let	distance = 0;
		if (latlngs.length < 2) {
			ar_mesures.push(
				{
					label: "Distance: N/A"
				},{
					label: "Color: ",
					separator: false
				}
			)
		} else {
			// sum segment distances in metres using Leaflet's WGS84 distanceTo
			for (let i = 0; i < latlngs.length-1; i++) {
				distance += latlngs[i].distanceTo(latlngs[i+1]);
			}
			ar_mesures.push(
				{
					label: "Distance: "+this.round_coordinate(distance, 2),
					messure: 'm'
				},{
					label: "Color: ",
					separator: false
				}
			)
		}
	}

	const text_node		= render_popup_text(ar_mesures)
	const color_node	= render_color_picker(self, layer, layer_id)
	text_node.appendChild(color_node)


	return text_node
}//end get_popup_content



/**
* STR_LAT_LNG
* Formats a Leaflet `LatLng` object as a human-readable coordinate string of the
* form `(lat, lng)` with six decimal places of precision.
*
* Used by `get_popup_content` for Marker and Circle popups.
*
* @param {Object} latlng - Leaflet LatLng object with `lat` and `lng` properties.
* @returns {string} Formatted string, e.g. `'(39.462571, -0.376295)'`.
*/
component_geolocation.prototype.str_lat_lng = function(latlng) {

	const self = this

	const lat_lng = '(' + self.round_coordinate(latlng.lat, 6) + ', ' + self.round_coordinate(latlng.lng, 6) + ')'

	return lat_lng
}//end str_lat_lng



/**
* ROUND_COORDINATE
* Rounds a number to `len` decimal places using integer arithmetic to avoid
* floating-point representation issues with `toFixed`.
*
* Used by `str_lat_lng`, `get_popup_content` (radius, distance display).
*
* @param {number} num - The value to round.
* @param {number} len - Number of decimal places to keep.
* @returns {number} The rounded value (still a number, not a string).
*/
component_geolocation.prototype.round_coordinate = function(num, len) {

	return Math.round(num*(Math.pow(10, len)))/(Math.pow(10, len));
}//end round_coordinate



/**
* INIT_DRAW_EDITOR
* Attaches the leaflet-geoman (pm) drawing toolbar to the map and wires up the
* map-level pm events that serialise geometry changes back to `ar_layer_loaded`.
*
* Called once from inside the `map.whenReady` callback in `get_map`.
* `draw_editor_is_initated` is set to true after the first call; callers should
* check this flag if they need to guard against double-initialisation.
*
* Toolbar options:
* - `drawCircleMarker: false` — removed from the toolbar; full circles are still
*   supported via the 'draw circle' tool.
* - `drawText: false` — text annotations are not used in the geolocation component.
* - Measurements are enabled globally in metric format.
*
* Map-level pm events registered:
* - `pm:create` — fires when the user finishes drawing a new shape. Adds the new
*   Leaflet layer to the active FeatureGroup, serialises geometry, and runs
*   `init_feature` to attach click/popup handlers.
* - `pm:cut` — fires when the user cuts (clips) a shape. Removes the original
*   layer, serialises, and re-binds the popup on the resulting clipped layer.
* - `pm:remove` — fires when the user deletes a shape. Serialises geometry to
*   `ar_layer_loaded` without refreshing the popup (layer is gone).
*
* @see https://github.com/Leaflet/Leaflet.draw/issues/66 (legacy reference; now
*   using leaflet-geoman, not leaflet-draw)
* @returns {boolean} Always true.
*/
component_geolocation.prototype.init_draw_editor = function() {

	const self = this
	const map  = self.map

		// add Leaflet-Geoman controls with some options to the map
		map.pm.addControls({
			position: 'topright',
			drawCircleMarker: false,
			drawText: false
		});

		map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } })
		// Listener on change the draw editor to "edited mode" for save the the current data of the editable_FeatureGroup
		// listen to when a layer is changed in Edit Mode
		map.on('pm:create', (e) => {
			// get layer active
			const layer = self.FeatureGroup[self.active_layer_id]
			// add the new feature to active layer
			e.layer.addTo(layer)
			// Update draw_data
			self.update_draw_data(self.active_layer_id);
			// init the feature — attach popup and click handlers to the newly created shape
			init_feature({
				self		: self,
				data_layer	: e.layer,
				layer_id	: self.active_layer_id
			})
		});

		// finish the editing feature data — pm:cut produces two layers: originalLayer (old) and layer (new clipped)
		map.on('pm:cut', (e) => {
			e.originalLayer.remove()
			e.originalLayer.removeFrom(map)
			self.update_draw_data(self.active_layer_id);
			// recalculate the popup
			const content = self.get_popup_content(e.layer, self.active_layer_id);
			if (content) {
				e.layer.bindPopup(content,{
					minWidth : 155
				});
			}//end if(content)
		});

		// Listener for delete the draw editor to "deleted mode" for save the current data of the editable_FeatureGroup
		map.on('pm:remove', () => {
			// Update draw_data — serialise the remaining geometry after removal
			self.update_draw_data(self.active_layer_id);
		});

	// DRAW_EDITOR_IS_INITATED : Set the a global variable to true (default is false) to avoid duplication
	self.draw_editor_is_initated = true;


	return true
}//end init_draw_editor



/**
* UPDATE_DRAW_DATA
* Serialises the current state of the Leaflet FeatureGroup for `layer_id` back
* into `ar_layer_loaded` and marks the component as dirty. This is the single
* point that reads live Leaflet layer state and writes it into the in-memory data
* model prior to saving.
*
* The save itself is NOT triggered here — that responsibility belongs to the save
* button handler in `render_edit_component_geolocation` / `view_default_edit_geolocation`.
*
* Serialisation logic:
* 1. Calls `FeatureGroup[layer_id].toGeoJSON()` to get a FeatureCollection skeleton.
* 2. Iterates each Leaflet layer via `eachLayer` to build augmented feature objects:
*    - Stamps `properties.layer_id` on every feature.
*    - Copies `options.color` into `properties.color` when a custom colour is set.
*    - For `L.Circle` layers, adds `properties.shape='circle'` and `properties.radius`
*      because GeoJSON does not natively represent circles (they are stored as Point).
* 3. Replaces the FeatureCollection's `features` array with the augmented list.
* 4. Resolves the active `key` from the map container's `dataset.key` attribute.
* 5. Publishes `updated_layer_data_<id_base>` via event_manager so that linked
*    `component_text_area` instances (e.g. hierarchy42 properties) can react.
* 6. Writes `ar_layer_loaded` into `current_value[key].lib_data` and calls
*    `set_changed_data` to enqueue the changed_data_item for the next save.
*
* @param {number} layer_id - Id of the FeatureGroup whose geometry has changed.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.update_draw_data = function(layer_id) {

	const self = this

	// set the data_changed to true to control that the data was changed
		self.is_data_changed = true

	// active_layer. get the active draw data of the active_layer
		const active_layer = self.FeatureGroup[layer_id];

	// current_layer. get the layer from the loaded data
		const current_layer = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)

	// layer_data. get the GeoJson of the active layer (from leaflet)
		current_layer.layer_data = active_layer.toGeoJSON()

		const features = []
		active_layer.eachLayer(function (layer){

			const json = layer.toGeoJSON();

			// add layer_id — stamp the feature so it can be reassigned to the correct layer on reload
			json.properties = json.properties
				? json.properties
				: {}
			json.properties.layer_id = layer_id
			const layer_color = layer.options.color

			if(layer_color){
				json.properties.color =  layer_color
			}

			// GeoJSON has no native circle type — persist shape + radius as properties
			// so pointToLayer in load_layer can reconstruct the L.Circle on next load
			if (layer instanceof L.Circle) {
				json.properties.shape	= 'circle';
				json.properties.radius	= layer.getRadius();
			}
			features.push(json)
		});
		current_layer.layer_data.features = features

	// value key — map container carries data-key to identify which entries index this map belongs to
		const key = parseInt(self.map.getContainer().dataset.key)

	// current_layer.user_layer_name 	= current_layer.data.user_layer_name

	// update the data in the instance previous to save
		// const entries = typeof (self.data.entries[0])!=='undefined'
		// 	? clone(self.data.entries[0])
		// 	: {}

	// publish the change to used by component_text_area from properties like 'hierarchy42'
		event_manager.publish(
			'updated_layer_data_'+ self.id_base,
			{
				layer: {
					type		: 'geo',
					layer_id	: layer_id
				},
				caller: self
			}
		)

		self.current_value[key].lib_data = self.ar_layer_loaded


	// track changes in self.data.changed_data — enqueue for the next save
		const changed_data_item = self.build_changed_data_item(key)
		self.set_changed_data(changed_data_item)


	return true
}//end update_draw_data



/**
* MAP_UPDATE_COORDINATES
* Re-centres this geolocation map to the coordinates stored in a record pointed to
* by another component (e.g. a portal/autocomplete for toponymy). When the user
* picks a location record in the linked component, this method reads the geolocation
* data from that record and copies it to this component's map and data value.
*
* This method is fired via the ontology `observe` event system (event: 'update_value'
* on the observed component). It is NOT called directly by this component.
*
* The self component (geolocation that is listening) should be configured in properties as:
*
*	"observe": [
*		{
*			"client": {
*				"event": "update_value",
*				"perform": {
*				"function": "map_update_coordinates"
*				}
*			},
*			"component_tipo": "tch245"
*		}
*	]
*
* the observable component (portal with the data) should specify the component_geolocation that has the coordinates to be used
* it need to be defined in request_config 'hide' property with the role of 'target_geolocation_tipo'
* in this way:
*
* "request_config": [{
*		"hide": {
*			"ddo_map": [
*				{
*					"info": "component_geolocation to be used as data of the observer geolocation (move the map to the value of this component), role property identify it by map_update_coordinates() funcion",
*					"role": "target_geolocation_tipo",
*					"tipo": "hierarchy31",
*					"parent": "self",
*					"section_tipo": "self"
*				}
*			]
*		}
*	}]
*
* If the observable doesn't has specified the component_geolocation will use the default thesaurus component_geolocation: hierarchy31
*
* Resolution logic:
*  1. Reads `target_geolocation_tipo` from `caller.request_config_object.hide.ddo_map`
*     (role='target_geolocation_tipo'), falling back to 'hierarchy31'.
*  2. Uses `caller.data.entries` to identify which record was last selected (the
*     portal's last entry's section_id).
*  3. Searches `caller.datum.data` for the geolocation component data at that
*     section_id and updates this component's map and data accordingly.
*
* (!) `caller.datum.data` is the raw datum array from the portal; if the portal's
* request_config does not include the target geolocation tipo in its ddo_map, the
* find call will return undefined and the map will not be moved.
*
* @param {Object} options - Event payload dispatched by the observed component.
* @param {Object} options.caller - The portal/autocomplete instance whose value changed.
* @returns {Promise<void>}
*/
component_geolocation.prototype.map_update_coordinates = async function(options) {

	const self = this

	const caller = options.caller

	// check if the caller has defined 'target_geolocation_tipo' component in hide of rqo
	const target_geolocation_tipo = caller.request_config_object.hide?.ddo_map?.find(
		el => el.role === 'target_geolocation_tipo')?.tipo
		|| 'hierarchy31' // Default geolocation map in thesarus

	const original_value = caller.data.entries
	// if the caller has not data, do not update the map
	if(!original_value){
		return
	}
	// get the last value of the caller portal
	// it will use to find the target_geolocation_tipo data
	const last_value = original_value[original_value.length-1]

	const target_geolocation_data = caller.datum.data.find( el =>
		el.tipo === target_geolocation_tipo
		&& parseInt(el.section_id) === parseInt(last_value.section_id)
	)

	// if target_geolocation_data, incorporate it to the current map and reload it
	if(target_geolocation_data){
		// geolocation doesn't has multiple maps and the key of the data array is always 0
		const key = 0
		self.current_value = target_geolocation_data.entries
		self.update_input_values(
			key,
			self.current_value[key],
			self.node.content_data[key].map_container
		)
		// move the map to the new point and zoom with the values
		self.map.panTo(new L.LatLng(self.current_value[key].lat, self.current_value[key].lon));
		self.map.setZoom(self.current_value[key].zoom);
		// modify his own data with the new values — change_value persists the borrowed coordinates
		const changed_data = [self.build_changed_data_item(key)]
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
	}

}//end map_update_coordinates



/**
* LAYER_DATA_CHANGE
* Reacts to geo-tag insertion and removal events from a linked `component_text_area`.
* Called when the user adds or deletes a geo-tag in the rich-text editor; synchronises
* the map's FeatureGroup state with the tag model.
*
* 'insert' action:
*   - Short-circuits if the layer is already loaded (idempotent).
*   - Recovers the layer from `ar_data_buffer` if available (supports undo after remove).
*   - Pushes the recovered or new empty layer into `ar_layer_loaded`, renders it on
*     the map, and persists the change via `change_value`.
*   - After save resolves, updates `db_data.value[key]` so the in-memory DB snapshot
*     stays consistent and avoids false dirty-state detection.
*
* 'remove' action:
*   - Saves the layer into `ar_data_buffer[layer_id]` to enable undo recovery.
*   - Removes the FeatureGroup from the map and the layer control.
*   - Splices the entry out of `ar_layer_loaded` and persists via `change_value`.
*   - After save resolves: resets to layer 1 if no layers remain, or activates
*     the first available layer.
*
* (!) `key` is hardcoded to 0 because geolocation only supports a single coordinate
* entry per component instance. Multi-entry support would require reading the key
* from the event payload.
*
* @param {Object} change - Tag change descriptor.
* @param {string} change.action - 'insert' or 'remove'.
* @param {number|string} change.tag_id - The numeric id of the affected tag (parsed to int).
* @param {string} change.type - Always 'geo' for this component.
* @returns {boolean} True on success; false when the layer to remove cannot be found.
*/
component_geolocation.prototype.layer_data_change = function(change) {

	const self = this

	// set the layer data
		const action		= change.action
		const layer_id		= parseInt(change.tag_id)
		const key			= 0; // fixed key (only one element is allowed)
		// const layer_name	= 'layer_' +layer_id

		switch(action) {

			case 'insert':
				const layer_loaded = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)
				if(layer_loaded){
					return true
				}
				// recover from buffer if the user previously removed this tag in the same session
				const recover_layer = self.ar_data_buffer[layer_id] ||
					{
						layer_id	: layer_id,
						layer_data	: []
					};

				self.ar_layer_loaded.push(recover_layer)
				self.load_layer(recover_layer)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const recover_changed_data = [self.build_changed_data_item(key)]
				self.change_value({
					changed_data	: recover_changed_data,
					refresh			: false
				})
				.then(()=>{
					// sync the DB snapshot after save so dirty-check sees a clean state
					self.db_data.value[key] = clone(self.current_value[key])
				})
				break;

			case 'remove':
				// get the layer from the loaded data
				const layer = self.ar_layer_loaded.find((item) => item.layer_id===layer_id)
				if(!layer){
					return false
				}
				// store the layer into the data_buffer for possible undo recovery
				self.ar_data_buffer[layer_id] = layer;
				// remove the data of the FeatureGroup
				if(!self.FeatureGroup[layer_id]){
					return false
				}
				self.FeatureGroup[layer_id].remove();
				self.FeatureGroup[layer_id].clearLayers();
				self.layer_control.removeLayer(self.FeatureGroup[layer_id]);
				delete self.FeatureGroup[layer_id];

				// remove the layer
				const index = self.ar_layer_loaded.findIndex((item) => item.layer_id===layer_id)
				self.ar_layer_loaded.splice(index,1)

				self.current_value[key].lib_data = self.ar_layer_loaded

				const changed_data = [self.build_changed_data_item(key)]
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				.then(()=>{
					// sync the DB snapshot after save
					self.db_data.value[key] = clone(self.current_value[key])
					// when the ar_layer_loaded is empty, the user has delete all tags and is necessary reset the load_layer

					if(self.ar_layer_loaded.length === 0){
						// reset the load_layer to 1 — ensures a valid empty FeatureGroup exists
						self.layers_loader({
							load 		: 'layer',
							layer_id	: 1
						})
					}else{
						// if the tag removed is not the last one, load the next layer that can be used
						const next_layer = self.ar_layer_loaded[0]
						self.load_layer(next_layer)
					}
				})
				break;
		}

	return true
}//end layer_data_change



/**
* CREATE_POINT
* Programmatically places a new Leaflet Marker at the given coordinates and adds
* it to the currently active FeatureGroup. Useful when an external component (e.g.
* a search result or autocomplete) provides coordinates to plot.
*
* After adding the marker, `update_draw_data` is called to serialise the updated
* FeatureGroup into `ar_layer_loaded` and mark the component as changed.
*
* @param {Object} point - Coordinate pair accepted by `L.marker`.
* @param {number} point.lat - WGS84 latitude in decimal degrees.
* @param {number} point.lng - WGS84 longitude in decimal degrees.
* @returns {boolean} Always true.
*/
component_geolocation.prototype.create_point = function(point) {

	const self = this

	// create new point in the coordinates
	const new_point = L.marker(point).addTo(self.map);

	// add new point to the active layer
	self.FeatureGroup[self.active_layer_id].addLayer(new_point)

	// update the layer data with the new point
	self.update_draw_data(self.active_layer_id)


	return true
}//end create_point



/**
* INIT_FEATURE
* Private module function (not on the prototype). Initialises a single Leaflet
* layer (geometry feature) by:
* 1. Applying a stored custom colour via `setStyle`, when `feature.properties.color`
*    is set (only applicable to non-Marker shapes).
* 2. Building and binding a measurement popup via `get_popup_content`.
* 3. Attaching a 'click' event listener that:
*    - Sets `active_layer_id` to this feature's `layer_id`.
*    - Enables geoman editing (`pm.enable`) on all features in the clicked layer's
*      FeatureGroup.
*    - Disables geoman editing on all features in all OTHER FeatureGroups.
* 4. Adding the Leaflet layer to its parent `FeatureGroup[layer_id]`.
*
* Called from `load_layer` (via `L.geoJson` `onEachFeature`) for restored geometry,
* and from `init_draw_editor`'s `pm:create` handler for newly drawn features.
*
* The colour-coded active/inactive styling blocks inside the click handler are
* intentionally commented out — the visual design uses geoman's own handles rather
* than custom stroke colours.
*
* @param {Object} options - Initialisation context.
* @param {Object} options.self - The `component_geolocation` instance.
* @param {Object} options.data_layer - Leaflet layer (Marker/Circle/Polygon/Polyline).
* @param {number} options.layer_id - Id of the parent FeatureGroup.
* @param {Object|null} [options.feature=null] - GeoJSON feature object; may be null
*   when called from `pm:create` (no feature properties available yet).
* @returns {void}
*/
const init_feature = function(options) {

	const self			= options.self
	const data_layer	= options.data_layer
	const layer_id		= options.layer_id
	const feature		= options.feature || null

	// check if the feature has data else do nothing
	if(data_layer){

		// color — restore the persisted stroke colour from GeoJSON properties
			const color = feature && feature.properties && feature.properties.color
				? feature.properties.color
				: null
			if(color){
				data_layer.setStyle({color: color})
			}
		// PopupContent. get the popup information
			const content = self.get_popup_content(data_layer, layer_id);
			if (content) {
				data_layer.bindPopup(content,{
					minWidth : 155
				});
			}//end if(content)
		// Click. Listener for each layer, when the user click into one layer, activate it and your feature, deactivate rest of the features and layers
			data_layer.on('click', function() {
				// ACTIVE_LAYER_ID : Set the current active layer id will be editable with the actual FeatureGroup
					self.active_layer_id = layer_id;

				// change all features and layers for activate or deactivate the edit mode.
					for (let feature in self.FeatureGroup) {

						if(feature){
							if(self.FeatureGroup[feature]===self.FeatureGroup[layer_id]){
								// enable editing on all features in the clicked layer
								self.FeatureGroup[layer_id].eachLayer(function (layer){
									// layer.editing.disable();
									layer.pm.enable()
									// if(!(layer instanceof L.Marker)){
									// 	layer.setStyle({color: '#31df25'});
									// }
								});
							}else{

								// disable editing on all features in other layers
								self.FeatureGroup[feature].eachLayer(function(layer) {
									// layer.editing.disable();
									layer.pm.disable()
									// if(!(layer instanceof L.Marker)){
									// 	layer.setStyle({color: '#3388ff'});
									// }
								});
							}
						}
					}
				// current layer activate and change to pink color
				//e.target.editing.enable();
				// if(!(e.target instanceof L.Marker)){
				// 	e.target.setStyle({color: '#97009C'});
				// }else{
				// 	console.log("Not e.target instanceof L.Marker ",);
				// }

			 });
		// addLayer — register the Leaflet layer into its parent FeatureGroup
			self.FeatureGroup[layer_id].addLayer(data_layer)
	}//end if (data_layer)
}//end init_feature



/**
* READABLE_AREA
* Private module function. Converts a raw area value in square metres to a
* human-readable string with an appropriate unit suffix, chosen by magnitude.
*
* Metric thresholds:
* - >= 1,000,000 m² → km²  (precision: 2 decimal places)
* - >= 10,000 m²    → ha   (precision: 2 decimal places)
* - < 10,000 m²     → m²   (no decimal places)
*
* Imperial thresholds:
* - >= 2,589,986.9952 m² → mi²   (1 square mile)
* - >= 4,046.8564224 m²  → acres (1 acre)
* - < 4,046.8564224 m²   → yd²
*
* Unit conversion uses `turf.convertArea`; rounding uses `turf.round`.
*
* (!) In metric mode, the `else` branch (area < 10,000) contains `area + ' m²'`
* without assigning the result to `area_string`. This is a pre-existing bug:
* the expression is computed but discarded, so `area_string` remains `undefined`
* for small polygons in metric mode. Do not fix here — document only.
*
* @param {number} area - Area in square metres as returned by `turf.area`.
* @param {boolean} [metric=true] - Use metric units when true, imperial otherwise.
* @returns {string|undefined} Formatted area string; undefined for metric areas < 10,000 m²
*   due to the pre-existing bug noted above.
*/
const readable_area = function (area, metric=true) {

	const precision = {
		km	: 2,
		ha	: 2,
		m	: 0,
		mi	: 2,
		ac	: 2,
		yd	: 0,
		ft	: 0,
		nm	: 2
	}

	let area_string

	if (metric) {

		if (area >= 1000000) {
			area_string = turf.round(turf.convertArea(area, 'meters', 'kilometers'), precision['km']) + ' km²';
		} else if (area >= 10000 ) {
			area_string = turf.round(turf.convertArea(area, 'meters', 'hectares'), precision['ha']) + ' ha';
		} else {
			area_string = area + ' m²';
		}
	} else {
		if (area >= 2589986.9952) { //2589986,9952 square meters are 1 square mile
			area_string = turf.round(turf.convertArea(area, 'meters', 'miles'), precision['mi']) + ' mi²';
		} else if (area >= 4046.8564224) { //4046.8564224 square meters are 1 acres
			area_string = turf.round(turf.convertArea(area, 'meters', 'acres'), precision['ac']) + ' acres';
		} else {
			area_string = turf.round(turf.convertArea(area, 'meters', 'yards'), precision['yd']) + ' yd²';
		}
	}

	return area_string
}//end readable_area



// @license-end
