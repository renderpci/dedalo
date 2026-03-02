// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, L, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {when_in_viewport,dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_geolocation = function() {

	return true
}//end view_default_edit_geolocation



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
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
* @param object self
* @return HTMLElement content_data
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
* @param int i
* @param object current_value
* Sample:
* {
* 	alt: 16
* 	lat: 39.473844362398225
*	lib_data: [{…}, {…}]
*	lon: -0.26004109591099894
*	zoom: 12
* }
* @param object self
* @return HTMLElement content_value
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

	// unified change handler
		const fn_coord_change = (e) => {
			const node = e.target
			const name = node.dataset.name
			const val  = (node.value.length > 0) ? parseFloat(node.value) : null

			// ensure current_value[i] exists
			self.current_value[i] = self.current_value[i] || {}
			self.current_value[i][name] = val

			// mark as changed
			self.is_data_changed = true

			// map updates
			if (self.map) {
				const lat = self.current_value[i].lat
				const lon = self.current_value[i].lon
				const zoom = self.current_value[i].zoom

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
					// add resize content_value event to allow user to resize the map
					new ResizeObserver( function(){
						self.refresh_map(self.map)
					})
					.observe( content_value )
				})
			}
		);


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @param int i
* @param object current_value
* Sample:
* {
* 	alt: 16
* 	lat: 39.473844362398225
*	lib_data: [{…}, {…}]
*	lon: -0.26004109591099894
*	zoom: 12
* }
* @param object self
* @return HTMLElement content_value
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
					// add resize content_value event to allow user to resize the map
					new ResizeObserver( function(){
						self.refresh_map(self.map)
					})
					.observe( content_value )
				})
			}
		);


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement buttons_container
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

				// const changed_data = self.data.changed_data || []

				const key = 0; // fixed key (only one element is allowed)
				const changed_data_item = Object.freeze({
					action		: 'update',
					key			: key,
					value		: self.current_value[key]
				})

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
