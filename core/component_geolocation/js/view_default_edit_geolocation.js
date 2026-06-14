// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, L, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {when_in_viewport,dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_GEOLOCATION
* Default edit view for component_geolocation.
*
* Builds the interactive editing shell for a single geolocation entry: a set of
* coordinate text inputs (lat, lon, zoom, alt) wired to a Leaflet map.  Map
* initialisation is deferred via when_in_viewport so the Leaflet instance is only
* created when the container scrolls into view, avoiding hidden-element sizing bugs.
*
* Entry point: view_default_edit_geolocation.render() — called by
* render_edit_component_geolocation when view is 'default', 'line', or 'print'.
*
* Coordinate value shape stored in self.current_value[0]:
* {
*   lat      : {number}  - latitude   (WGS-84 decimal degrees)
*   lon      : {number}  - longitude  (WGS-84 decimal degrees)
*   zoom     : {number}  - Leaflet zoom level (integer 0–19)
*   alt      : {number}  - altitude in metres
*   lib_data : {Array}   - Leaflet layer array managed by component_geolocation
* }
*
* Public exports: view_default_edit_geolocation (namespace), get_content_data,
* get_content_value, get_content_value_read.
*/
export const view_default_edit_geolocation = function() {

	return true
}//end view_default_edit_geolocation



/**
* RENDER
* Build and return the full component wrapper for edit mode.
*
* Switches between a content-only fragment (render_level 'content') and a complete
* wrapper element that includes optional buttons.  When view is 'line' the label
* node is suppressed so the component fits inline.
*
* @param {Object} self    - component_geolocation instance
* @param {Object} options - render options
*   @param {string} [options.render_level='full'] - 'full' returns the wrapper; 'content' returns only content_data
* @returns {Promise<HTMLElement>} wrapper element (or content_data when render_level is 'content')
*/
view_default_edit_geolocation.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to crate label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Build the content_data container and populate it with the single geolocation input
* element (read-only or editable depending on self.permissions).
*
* Geolocation is always a single-entry component (only one map per instance).
* Initialises self.current_value[0] with a shallow copy of the stored entry so the
* value is immediately available for save operations without waiting for the map to
* load.
*
* Side effect: sets self.current_value[0] to a shallow clone of the current entry.
*
* @param {Object} self - component_geolocation instance
* @returns {HTMLElement} content_data container with the input element attached as content_data[0]
*/
export const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || [self.default_value]

	// content_data
		const content_data = ui.component.build_content_data(self)

	// inputs - Expected only one value in geolocation
		const i 			= 0
		const value_item 	= entries[i] || self.default_value

		// Initialize current_value with the initial value to ensure it's available as soon as rendered
		self.current_value[i] = (value_item && typeof value_item === 'object') ? Object.assign({}, value_item) : value_item

		const input_element_node = (self.permissions===1)
			? get_content_value_read(i, value_item, self)
			: get_content_value(i, value_item, self)

		content_data.appendChild(input_element_node)

		// set the pointer
		content_data[i] = input_element_node


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Build the full editable geolocation input: four coordinate text inputs plus a
* Leaflet map container wired with pan/zoom synchronisation.
*
* Layout (inside content_value):
*   .map_inputs  — labels + inputs for lat, lon, zoom, alt; refresh button; add-point button
*   .leaflet_map — Leaflet map container (initialised lazily via when_in_viewport)
*
* Coordinate change flow:
*   user types in an input → 'change' event → fn_coord_change → self.handle_coord_change
*   self.handle_coord_change updates self.current_value[i] and pans/zooms the map.
*
* Map drag/zoom events update the inputs via self.update_input_values but do NOT
* trigger an auto-save (intentional — use the save button).
*
* A ResizeObserver calls self.refresh_map whenever the content_value element is resized
* so Leaflet recalculates tile positions after CSS-driven layout changes.
*
* @param {number} i             - entry index (always 0 for geolocation)
* @param {Object} current_value - initial coordinate object
*   { lat: {number}, lon: {number}, zoom: {number}, alt: {number}, lib_data: {Array} }
* @param {Object} self          - component_geolocation instance
* @returns {HTMLElement} content_value element containing inputs and map container
*/
export const get_content_value = (i, current_value, self) =>{

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'map_inputs',
			parent			: content_value
		})

	// unified change handler - delegates to component method
		const fn_coord_change = (e) => {
			const node = e.target
			const name = node.dataset.name
			const val  = (node.value.length > 0) ? parseFloat(node.value) : null

			self.handle_coord_change(i, name, val)
		}

		// latitude
			// label field latitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.latitude || 'Latitude',
					parent			: inputs_container
				})

			// input field latitude
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input lat',
					dataset			: { name : 'lat' },
					value			: current_value.lat,
					parent			: inputs_container
				})
				.addEventListener('change', fn_coord_change)

		// longitude
			// label field longitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.longitude || 'Longitude',
					parent			: inputs_container
				})

			// input field longitude
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input lon',
					dataset			: { name : 'lon'},
					value			: current_value.lon,
					parent			: inputs_container
				})
				.addEventListener('change', fn_coord_change)

		// zoom
			// label field zoom
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.zoom || 'Zoom',
					parent			: inputs_container
				})

			// input field zoom
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input zoom',
					dataset			: { name : 'zoom' },
					value			: current_value.zoom,
					parent			: inputs_container
				})
				.addEventListener('change', fn_coord_change)

		// altitude
			// label field altitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.altitude || 'Alt',
					parent			: inputs_container
				})

			// input field altitude
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'altitude',
					dataset			: { name : 'alt' },
					value			: current_value.alt,
					parent			: inputs_container
				})
				.addEventListener('change', fn_coord_change)

		// refresh
			// Clicking the refresh button discards unsaved in-memory changes and restores the last
			// persisted values from self.data.entries[i].  It also resets is_data_changed so the
			// "unsaved changes" indicator disappears and triggers a full layer reload.
			const refresh_node = ui.create_dom_element({
				element_type	: 'span',
				parent			: inputs_container,
				class_name		: 'map_reload'
			})
			refresh_node.addEventListener('click', fn_refresh)
			function fn_refresh(e) {
				e.stopPropagation()

				const entry = self.data.entries[i] || self.default_value

				const lat	= entry.lat
				const lon	= entry.lon
				const zoom	= entry.zoom
				const alt	= entry.alt

				if (self.map) {
					self.map.panTo([lat, lon],{animate:false,duration:0});
					self.map.setZoom(zoom)
				}

				// Update input values
					self.update_input_values(
						i,
						{
							lat		: lat,
							lon		: lon,
							zoom	: zoom,
							alt		: alt
						},
						map_container
					)

				// Update current_value
					self.current_value[i] = (entry && typeof entry === 'object') ? Object.assign({}, entry) : entry

				// Reset changed flag
					self.is_data_changed = false

				// load all layers
					self.layers_loader({load:'full'})
			}//end fn_refresh

		// create point
			// Reads lat/lon from the text inputs and calls self.create_point to add a Leaflet
			// marker at those coordinates, then persists it via update_draw_data.
			// (!) Uses .lng (Leaflet LatLng property) in the point object, not .lon.
			const add_point_node = ui.create_dom_element({
				element_type	: 'span',
				parent			: inputs_container,
				class_name		: 'map_point'
			})
			add_point_node.addEventListener('click', fn_click_add_point)
			function fn_click_add_point(e) {
				e.stopPropagation()

				const lat_node = inputs_container.querySelector('.lat')
				const lon_node = inputs_container.querySelector('.lon')

				const point = {
					lat : parseFloat(lat_node.value),
					lng : parseFloat(lon_node.value)
				}

				// create the point in the coordinates
					self.create_point(point)
			}//end fn_click_add_point

	// map container
		// data-key attribute stores the entry index so component methods (update_draw_data,
		// update_input_values) can resolve map_container → parent content_value reliably.
		const map_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'leaflet_map',
			dataset			: { key : i },
			parent			: content_value
		})
		// set pointers
		content_value.map_container = map_container

	// init the map with the wrapper when container node is in viewport
		// Deferring map init until the element is visible avoids a known Leaflet issue where
		// tiles are mis-sized when initialised inside a hidden/zero-height container.
		when_in_viewport(
			map_container,
			() => {
				self.get_map(map_container, i)
				.then(()=>{
					self.layers_loader({
						load: 'full'
					})
					// add resize content_value event to allow user to resize the map.
					// store the observer so destroy() can disconnect it (otherwise it
					// outlives the component and keeps the map graph alive).
					self.resize_observers = self.resize_observers || []
					const resize_observer = new ResizeObserver( function(){
						self.refresh_map(self.map)
					})
					resize_observer.observe( content_value )
					self.resize_observers.push(resize_observer)
				})
			}
		);


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Build a read-only geolocation display: a Leaflet map container with no coordinate
* inputs or editing controls.
*
* Used when self.permissions === 1 (read-only) or when the component is rendered in
* 'print' view (render_edit_component_geolocation forces permissions to 1 for print).
* The map is still interactive (panning, zooming) — it is just not editable.
*
* Map initialisation is deferred via when_in_viewport for the same sizing reasons as
* the editable variant (see get_content_value).
*
* @param {number} i             - entry index (always 0 for geolocation)
* @param {Object} current_value - coordinate object (used only to satisfy caller contract;
*                                 actual map centre comes from self.data via get_map)
*   { lat: {number}, lon: {number}, zoom: {number}, alt: {number}, lib_data: {Array} }
* @param {Object} self          - component_geolocation instance
* @returns {HTMLElement} content_value element containing only the map container
*/
export const get_content_value_read = (i, current_value, self) =>{

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// map container
		const map_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'leaflet_map',
			dataset			: { key : i },
			parent			: content_value
		})
		// set pointers
		content_value.map_container = map_container

	// init the map with the wrapper when container node is in viewport
		when_in_viewport(
			map_container,
			() => {
				self.get_map(map_container, i)
				.then(()=>{
					self.layers_loader({
						load: 'full'
					})
					// add resize content_value event to allow user to resize the map.
					// store the observer so destroy() can disconnect it (otherwise it
					// outlives the component and keeps the map graph alive).
					self.resize_observers = self.resize_observers || []
					const resize_observer = new ResizeObserver( function(){
						self.refresh_map(self.map)
					})
					resize_observer.observe( content_value )
					self.resize_observers.push(resize_observer)
				})
			}
		);


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* Build the button bar for the edit wrapper.
*
* Only called when self.permissions > 1 (see render).  Which buttons are rendered is
* governed by self.show_interface, which is populated from ontology/properties config.
*
* Supported slots (all conditional):
*   - tools            — standard toolbar via ui.add_tools
*   - button_fullscreen — enters browser fullscreen on self.node; invalidates Leaflet
*                         tile sizes afterwards so the map fills the new viewport
*   - button_save      — calls self.build_changed_data_item(0) then self.change_value,
*                         resets self.is_data_changed on success
*
* Buttons are wrapped in a .buttons_fold div (enables sticky positioning on tall
* components) inside the standard buttons_container built by ui.component.
*
* (!) Save uses hard-coded key 0 because geolocation only ever has one entry.
*
* @param {Object} self - component_geolocation instance
* @returns {HTMLElement} buttons_container element with all enabled buttons appended
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

	// button_fullscreen
		if(show_interface.button_fullscreen === true){
			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
				if (self.map) {
					self.map.invalidateSize()
				}
			})
		}

	// save
		if(show_interface.button_save === true){
			const save = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button tool save',
				title			: get_label.save || 'Save',
				parent			: fragment
			})
			save.addEventListener('click', fn_save)
			function fn_save(e) {
				e.stopPropagation()

				const changed_data_item = self.build_changed_data_item(0)

				self.change_value({
					changed_data	: [changed_data_item],
					refresh			: false
				})
				.then(()=>{
					// set the data_changed to false to control that the data was changed
						self.is_data_changed = false
				})
			}//end fn_save
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
