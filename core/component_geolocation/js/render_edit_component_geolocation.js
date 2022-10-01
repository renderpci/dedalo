/*global get_label, page_globals, SHOW_DEBUG, iro, L */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_edit_COMPONENT_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_geolocation = function() {

	return true
}//end render_edit_component_geolocation



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_geolocation.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

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

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		// self.events_tokens.push(
		// )
		// function update_value (changed_data) {
		// 	console.log("-------------- - event update_value changed_data:", changed_data);
		// 	// change the value of the current dom element
		// 	const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
		// 	changed_node.value = changed_data.value
		// }

	// add element, subscription to the events
		// self.events_tokens.push(
		// 	event_manager.subscribe('add_element_'+self.id, add_element)
		// )
		// function add_element(changed_data) {
		// 	//console.log("-------------- + event add_element changed_data:", changed_data);
		// 	const inputs_container = wrapper.querySelector('.inputs_container')
		// 	// add new dom input element
		// 	get_input_element(changed_data.key, changed_data.value, inputs_container, self)
		// }


	return wrapper
}//end edit




/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = async function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// inputs - loop with the value array
		const inputs_value	= value //(value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// value
			const value_item = inputs_value[i] || {
				lat		: 39.462571,
				lon		: -0.376295,
				zoom	: 12,
				alt		: 16
			}

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
			// dataset		: { key : i },
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
		const is_inside_tool = self.is_inside_tool

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
		if (!is_inside_tool) {
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



/**
* RENDER_POPUP_TEXT
* @param array ar_text_obj
* @return DOM node text_container
*/
export const render_popup_text = function(ar_text_obj) {

	const text_container = ui.create_dom_element({
		element_type : 'div'
	})

	const text_len = ar_text_obj.length
	for (let i = 0; i < text_len; i++) {
		const current_obj	= ar_text_obj[i]
		const label			= current_obj.label || ''
		const messure		= current_obj.messure || ''
		const separator		= current_obj.separator === false
			? false
			: true

		// text_node
			ui.create_dom_element({
				element_type	: 'span',
				inner_html		: label + ' ' +messure,
				parent			: text_container
			})

		// separator_node (br)
			if(separator) {
				ui.create_dom_element({
					element_type	: 'br',
					parent			: text_container
				})
			}
	}


	return text_container
}//end render_popup_text



/**
* RENDER_COLOR_PICKER
* @return DOM node color_container
*/
export const render_color_picker = function(self, layer, layer_id) {

	const layer_color = layer.options.color || '#31df25'

	const color_container = ui.create_dom_element({
		element_type	: 'span'
	})

	// color_picker
	const button_color_picker = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button tool button_color_picker',
		parent			: color_container
	})
	button_color_picker.style.backgroundColor = layer_color

	const text_color = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		value 			: layer_color,
		class_name		: 'text_color',
		parent			: color_container
	})
	text_color.addEventListener('change', function() {
		button_color_picker.style.backgroundColor = text_color.value
		layer.setStyle({color: text_color.value});
		self.update_draw_data(layer_id)
	})

	const color_wheel_contaniner = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'hide color_wheel_contaniner',
		parent			: color_container
	})

	const color_picker = new iro.ColorPicker(
		color_wheel_contaniner,
		{
			// Set the size of the color picker
			width: 160,
			// Set the initial color to paper project color
			color: layer_color,
			// color wheel will not fade to black when the lightness decreases.
			wheelLightness: true,
			// transparency: true,
			layout: [
				{
					component: iro.ui.Wheel, //can be iro.ui.Box
					options: {
						sliderShape: 'circle'
					}
				},
				{
					component: iro.ui.Slider,
					options: {
						sliderType: 'value' // can also be 'saturation', 'value', 'alpha' or 'kelvin'
					}
				},
				// {
				// 	component: iro.ui.Slider,
				// 	options: {
				// 		sliderType: 'alpha'
				// 	}
				// },
			]
		}
	)//end new iro.ColorPicker
	button_color_picker.addEventListener('mouseup', () =>{
		color_wheel_contaniner.classList.toggle('hide')
	})
	// color:change event callback
	// color:change callbacks receive the current color and a changes object
	const color_selected = (color) =>{
		// if(this.path !== null){
		// 	this.path.fillColor = color.hex8String
		// }
		layer.setStyle({color: color.hex8String});
		button_color_picker.style.backgroundColor = color.hex8String
		text_color.value = color.hex8String
		// update the instance with the new layer information, prepared to save
		// (but is not saved directly, the user need click in the save button)
		self.update_draw_data(layer_id)
		// event_manager.publish('color_change_'+this.active_layer.data.layer_id, color.hex8String)
	}

	// listen to a color picker's color:change event
	color_picker.on(["color:change"], color_selected);


	return color_container
}//end render_color_picker
