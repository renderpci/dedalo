/*global get_label, page_globals, SHOW_DEBUG, iro, L */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
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
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
view_default_edit_geolocation.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		// self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = async function(self) {

	// short vars
		const data	= self.data || {}
		const value = data.value || self.default_value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// inputs - loop with the value array
		const inputs_value	= value //(value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// value
			const value_item = inputs_value[i] || self.default_value[0]

			const input_element_node = get_input_element_edit(i, value_item, self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}

	return content_data
}//end get_content_data_edit


/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM element content_value
*/
export const get_input_element_edit = (i, current_value, self) =>{

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			parent			: content_value,
			class_name		: 'map_inputs'
		})

	// latitude
		// label field latitude
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label['latitud'],
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
			lat_node.addEventListener('change', function() {
				// format and set value
				self.current_value[i].lat = (lat_node.value.length>0)
					? JSON.parse(lat_node.value)
					: null
				// move the map to current value
				self.map.panTo(new L.LatLng(self.current_value[i].lat, self.current_value[i].lon));
			})

	// longitude
		// label field longitude
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.longitud,
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
			lon_node.addEventListener('change', function() {
				// format and set value
				self.current_value[i].lon = (lon_node.value.length>0)
					? JSON.parse(lon_node.value)
					: null
				// move the map to current value
				self.map.panTo(new L.LatLng(self.current_value[i].lat, self.current_value[i].lon));
			})

	// zoom
		// label field zoom
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.mapa_zoom,
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
			zoom_node.addEventListener('change', function() {
				// format and set value
				self.current_value[i].zoom = (zoom_node.value.length>0)
					? JSON.parse(zoom_node.value)
					: null
				// zoom the map to current value
				self.map.setZoom(self.current_value[i].zoom);
			})

	// altitude
		// label field altitude
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.altitude,
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
			alt_node.addEventListener('change', function() {
				// format and set value
				self.current_value[i].alt = (alt_node.value.length>0)
					? JSON.parse(alt_node.value)
					: null
			})

	// refresh
		const refresh_node = ui.create_dom_element({
			element_type	: 'span',
			parent			: inputs_container,
			class_name		: 'map_reload'
		})
		refresh_node.addEventListener('click', function() {

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
		})

	// create point
		const add_point_node = ui.create_dom_element({
			element_type	: 'span',
			parent			: inputs_container,
			class_name		: 'map_point'
		})
		add_point_node.addEventListener('click', function() {

			const point = {
				lat : parseFloat(lat_node.value),
				lng : parseFloat(lon_node.value)
			}

			// create the point in the coordinates
				self.create_point(point)
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
}//end get_input_element_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// DOM fragment
		const fragment = new DocumentFragment()

	// button_fullscreen
		const button_fullscreen = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button full_screen',
			parent			: fragment
		})
		// button_fullscreen.addEventListener('mouseup', () =>{
		// 	self.node.classList.toggle('fullscreen')
		// 	const fullscreen_state = self.node.classList.contains('fullscreen') ? true : false
		// 	event_manager.publish('full_screen_'+self.id, fullscreen_state)
		// 	self.map.invalidateSize()
		// })
		button_fullscreen.addEventListener('click', function() {
			ui.enter_fullscreen(self.node)
			self.map.invalidateSize()
		})

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// save
		const save = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button tool save',
			parent			: fragment
		})
		save.addEventListener('click', function() {

			const key = 0; // fixed key (only one element is allowed)

			const changed_data = [Object.freeze({
				action		: 'update',
				key			: key,
				value		: self.current_value[key]
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
			.then(()=>{
				// set the data_changed to false to control that the data was changed
					self.is_data_changed = false
			})

		})

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
