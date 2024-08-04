// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, L */
/*eslint no-undef: "error"*/



// imports
	import {when_in_viewport} from '../../common/js/events.js'
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
		const data	= self.data || {}
		const value = data.value || self.default_value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// inputs - loop with the value array (expected only one value)
		const inputs_value	= value //(value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// used setTimeout to force new separate task
			setTimeout(function(){

				// value
				const value_item = inputs_value[i] || self.default_value[0]

				const input_element_node = (self.permissions===1)
					? get_content_value_read(i, value_item, self)
					: get_content_value(i, value_item, self)
				content_data.appendChild(input_element_node)
				// set the pointer
				content_data[i] = input_element_node

			}, 0)
		}

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

		// latitude
			// label field latitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.latitude || 'Latitude',
					parent			: inputs_container
				})

			// input field latitude
				const lat_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input lat',
					dataset			: { name : 'lat' },
					value			: current_value.lat,
					parent			: inputs_container
				})
				lat_node.addEventListener('change', fn_lat_change)
				function fn_lat_change() {
					// format and set value
					self.current_value[i].lat = (lat_node.value.length>0)
						? JSON.parse(lat_node.value)
						: null
					// move the map to current value
					self.map.panTo(new L.LatLng(
						self.current_value[i].lat,
						self.current_value[i].lon)
					);
					if(SHOW_DEBUG===true) {
						console.log('changed latitude value to:', self.current_value[i].lat);
					}
				}//end fn_lat_change

		// longitude
			// label field longitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.Longitude || 'Longitude',
					parent			: inputs_container
				})

			// input field longitude
				const lon_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input lon',
					dataset			: { name : 'lon'},
					value			: current_value.lon,
					parent			: inputs_container
				})
				lon_node.addEventListener('change', fn_lon_change)
				function fn_lon_change() {
					// format and set value
					self.current_value[i].lon = (lon_node.value.length>0)
						? JSON.parse(lon_node.value)
						: null
					// move the map to current value
					self.map.panTo(
						new L.LatLng(self.current_value[i].lat,
						self.current_value[i].lon)
					);
					if(SHOW_DEBUG===true) {
						console.log('changed longitude value to:', self.current_value[i].lon);
					}
				}//end fn_lon_change

		// zoom
			// label field zoom
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.zoom || 'Zoom',
					parent			: inputs_container
				})

			// input field zoom
				const zoom_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'geo_active_input zoom',
					dataset			: { name : 'zoom' },
					value			: current_value.zoom,
					parent			: inputs_container
				})
				zoom_node.addEventListener('change', fn_zoom_change)
				function fn_zoom_change() {
					// format and set value
					self.current_value[i].zoom = (zoom_node.value.length>0)
						? JSON.parse(zoom_node.value)
						: null
					// zoom the map to current value
					self.map.setZoom(self.current_value[i].zoom);
					if(SHOW_DEBUG===true) {
						console.log('changed zoom value to:', self.current_value[i].zoom);
					}
				}//end fn_zoom_change

		// altitude
			// label field altitude
				ui.create_dom_element({
					element_type	: 'label',
					inner_html		: get_label.altitude || 'Alt',
					parent			: inputs_container
				})

			// input field altitude
				const alt_node = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'altitude',
					dataset			: { name : 'alt' },
					value			: current_value.alt,
					parent			: inputs_container
				})
				alt_node.addEventListener('change', fn_altitude_change)
				function fn_altitude_change() {
					// format and set value
					self.current_value[i].alt = (alt_node.value.length>0)
						? JSON.parse(alt_node.value)
						: null
					if(SHOW_DEBUG===true) {
						console.log('changed altitude value to:', self.current_value[i].alt);
					}
				}

		// refresh
			const refresh_node = ui.create_dom_element({
				element_type	: 'span',
				parent			: inputs_container,
				class_name		: 'map_reload'
			})
			refresh_node.addEventListener('click', fn_refresh)
			function fn_refresh(e) {
				e.stopPropagation()

				const lat	= self.data.value[i].lat
				const lon	= self.data.value[i].lon
				const zoom	= self.data.value[i].zoom

				self.map.panTo([lat, lon],{animate:false,duration:0});
		 		self.map.setZoom(zoom)

				// Update input values
					self.update_input_values(
						i,
						{
							lat		: lat,
							lon		: lon,
							zoom	: zoom,
							alt		: self.data.value[i].alt
						},
						map_container
					)

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
		if (map_container) {
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
							setTimeout(function(){
								self.refresh_map(self.map)
							}, 5)
						})
						.observe( content_value )
					})
				}
			)
		}

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
		if (map_container) {
			when_in_viewport(
				map_container,
				() => {
					self.get_map(map_container, i)
					.then(()=>{
						self.layers_loader({
							load: 'full'
						})
					})
				}
			)
		}

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
				self.map.invalidateSize()
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
