/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, L */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_edit_COMPONENT_GEOLOCATION
* Manages the component's logic and apperance in client side
*/
export const render_edit_component_geolocation = function() {

	return true
};//end render_edit_component_geolocation



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_geolocation.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level

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

	// events
		add_events(wrapper, self)

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		// self.events_tokens.push(
		// 	event_manager.subscribe('update_value_'+self.id, update_value)
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
};//end edit



/**
* ADD_EVENTS
* @return bool true
*/
const add_events = function(wrapper, self) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			// e.stopPropagation()

			// update lat
				if (e.target.matches('input[type="text"][data-name="lat"]')) {
					const key	= JSON.parse(e.target.dataset.key)
					self.current_value[key].lat = (e.target.value.length>0) ? JSON.parse(e.target.value) : null
					//move the map to current value
					self.map.panTo(new L.LatLng(self.current_value[key].lat, self.current_value[key].lon));
				}

			// update lon
				if (e.target.matches('input[type="text"][data-name="lon"]')) {
					const key	= JSON.parse(e.target.dataset.key)
					self.current_value[key].lon = (e.target.value.length>0) ? JSON.parse(e.target.value) : null
					//move the map to current value
					self.map.panTo(new L.LatLng(self.current_value[key].lat, self.current_value[key].lon));
				}

			// update zoom
				if (e.target.matches('input[type="text"][data-name="zoom"]')) {
					const key	= JSON.parse(e.target.dataset.key)
					self.current_value[key].zoom = (e.target.value.length>0) ? JSON.parse(e.target.value) : null
					//zoom the map to current value
					self.map.setZoom(self.current_value[key].zoom);
				}

			// update alt
				if (e.target.matches('input[type="text"][data-name="alt"]')) {
					const key	= JSON.parse(e.target.dataset.key)
					self.current_value[key].alt = (e.target.value.length>0) ? JSON.parse(e.target.value) : null
				}
		})//end wrapper.addEventListener('change'

	// click event [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// save
				if (e.target.matches('.save')) {

					// const key = JSON.parse(e.target.dataset.key)
					const key = 0;

					const changed_data = Object.freeze({
						action		: 'update',
						key			: key,
						value		: self.current_value[key],
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, changed_data)
					})

					return true
				}

			// map_reload
				if (e.target.matches('.map_reload')) {

					const key = JSON.parse(e.target.dataset.key)
					const li = e.target.parentNode.parentNode
					const map_container = li.querySelector(".leaflet_map")

					const lat	= self.data.value[key].lat
					const lon	= self.data.value[key].lon
					const zoom	= self.data.value[key].zoom

					self.map.panTo([lat, lon],{animate:false,duration:0});
			 		self.map.setZoom(zoom)

					// Update input values
						self.update_input_values({
							lat		: lat,
							lon		: lon,
							zoom	: zoom,
							alt		: self.data.value[key].alt,
						},map_container)
				}
		})//end wrapper.addEventListener("click"

	return true
};//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = async function(self) {

	const value				= self.data.value
	// const is_inside_tool	= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// inputs - loop with the value array
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element_edit(i, inputs_value[i], self)
			inputs_container.appendChild(input_element_node)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM element li
*/
export const get_input_element_edit = (i, current_value, self) =>{

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			parent			: li,
			class_name		: 'map_inputs'
		})

	// latitude
		// label field latitude
			ui.create_dom_element({
				element_type 	: 'label',
				inner_html 	: get_label['latitud'],
				parent 		 	: inputs_container
			})

		// input field latitude
			ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				class_name 		: 'geo_active_input lat',
				dataset 	 	: { name : 'lat' , key : i },
				value 		 	: current_value.lat,
				parent 		 	: inputs_container
			})

	// longitude
		// label field longitude
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.longitud,
				parent			: inputs_container
			})

		// input field longitude
			ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'geo_active_input lon',
				dataset			: { name : 'lon' , key : i },
				value			: current_value.lon,
				parent			: inputs_container
			})

	// zoom
		// label field zoom
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.mapa_zoom,
				parent			: inputs_container
			})

		// input field zoom
			ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'geo_active_input zoom',
				dataset			: { name : 'zoom' , key : i },
				value			: current_value.zoom,
				parent			: inputs_container
			})

	// altitude
		// label field altitude
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.altitude,
				parent			: inputs_container
			})

		// input field altitude
			ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'altitude',
				dataset			: { name : 'alt' , key : i },
				value			: current_value.alt,
				parent			: inputs_container
			})

	// refresh
		ui.create_dom_element({
			element_type	: 'span',
			dataset			: { key : i },
			parent			: inputs_container,
			class_name		: 'map_reload'
		})

	// map container
		const map_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'leaflet_map',
			dataset			: { key : i },
			parent			: li
		})

	// init the map with the wrapper when container node is in DOM
		// event_manager.when_in_dom(map_container, draw_map)
		// function draw_map() {
		// 	self.get_map(map_container, current_value)
		// }
		if (map_container) {
			const observer = new IntersectionObserver(function(entries) {
				// if(entries[0].isIntersecting === true) {}
				const entry = entries[1] || entries[0]
				if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
					observer.disconnect();
					self.get_map(map_container, current_value)
					// observer.unobserve(entry.target);
				}
			}, { threshold: [0] });

			observer.observe(map_container);
		}


	return li
};//end get_input_element_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		button_full_screen.addEventListener("mouseup", () =>{
			self.node[0].classList.toggle('fullscreen')
			const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
			self.map.invalidateSize()
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// save
		const save = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button tool save',
			parent 			: fragment
		})

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
};//end get_buttons


