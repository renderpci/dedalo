/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	}
	from '../../component_geolocation/js/render_edit_component_geolocation.js'


/**
* render_search_component_geolocation
* Manages the component's logic and apperance in client side
*/
export const render_search_component_geolocation = function() {

	return true
}//end render_search_component_geolocation



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_geolocation.prototype.search = async function() {

	const self 	= this

	const content_data = await get_content_data_edit(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// events
		add_events(wrapper, self)


	return wrapper
}//end search



/**
* ADD_EVENTS
* @return bool true
*/
const add_events = function(wrapper, self) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"].input_value')) {
				//get the input node that has changed
				const input = e.target
				//the dataset.key has the index of correspondence self.data.value index
				const i 	= input.dataset.key
				// set the selected node for change the css
				self.selected_node = wrapper
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value
				const value = (input.value.length>0) ? input.value : null
				// set the changed_data for update the component data and send it to the server for change when save
				const changed_data = {
					action	: 'update',
					key	  	: i,
					value 	: value
				}
				// update the data in the instance previous to save
				self.update_data_value(changed_data)
				// set the change_data to the instance
				self.data.changed_data = changed_data
				// event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				return true
			}

			// q_operator. get the input value of the q_operator
			// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
			// like; radio_button, check_box, date, autocomplete, etc
			if (e.target.matches('input[type="text"].q_operator')) {
				//get the input node that has changed
				const input = e.target
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value
				const value = (input.value.length>0) ? input.value : null
				// update the data in the instance previous to save
				self.data.q_operator = value
				// event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				return true
			}
		})


	return true
}//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
	// const get_content_data_edit = async function(self) {

	// 	const value				= self.data.value
	// 	const is_inside_tool	= self.is_inside_tool

	// 	const fragment = new DocumentFragment()

	// 	// inputs container
	// 		const inputs_container = ui.create_dom_element({
	// 			element_type	: 'ul',
	// 			class_name		: 'inputs_container',
	// 			parent			: fragment
	// 		})

	// 	// inputs - loop with the value array
	// 		const inputs_value = value//(value.length<1) ? [''] : value
	// 		const value_length = inputs_value.length
	// 		for (let i = 0; i < value_length; i++) {
	// 			get_input_element_edit(i, inputs_value[i], inputs_container, self, is_inside_tool)
	// 		}

	// 	// content_data
	// 		const content_data = ui.component.build_content_data(self)
	// 			  content_data.appendChild(fragment)


	// 	return content_data
	// }//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @return dom element li
*/
	// const get_input_element_edit = (i, current_value, ul_container, self, is_inside_tool) =>{

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type : 'li',
	// 			parent 		 : ul_container
	// 		})

	// 	// inputs container
	// 		const inputs_container = ui.create_dom_element({
	// 			element_type 	: 'div',
	// 			parent			: li,
	// 			class_name		: 'map_inputs'
	// 		})

	// 	// latitude
	// 		// label field latitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'label',
	// 				text_content 	: get_label['latitud'],
	// 				parent 		 	: inputs_container
	// 			})

	// 		// input field latitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'input',
	// 				type 		 	: 'text',
	// 				class_name 		: 'geo_active_input lat',
	// 				dataset 	 	: { name : 'lat' , key : i },
	// 				value 		 	: current_value.lat,
	// 				parent 		 	: inputs_container
	// 			})

	// 	// longitude
	// 		// label field longitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'label',
	// 				text_content 	: get_label['longitud'],
	// 				parent 		 	: inputs_container
	// 			})

	// 		// input field longitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'input',
	// 				type 		 	: 'text',
	// 				class_name 		: 'geo_active_input lon',
	// 				dataset 	 	: { name : 'lon' , key : i },
	// 				value 		 	: current_value.lon,
	// 				parent 		 	: inputs_container
	// 			})

	// 	// zoom
	// 		// label field zoom
	// 			ui.create_dom_element({
	// 				element_type 	: 'label',
	// 				text_content 	: get_label['mapa_zoom'],
	// 				parent 		 	: inputs_container
	// 			})

	// 		// input field zoom
	// 			ui.create_dom_element({
	// 				element_type 	: 'input',
	// 				type 		 	: 'text',
	// 				class_name 		: 'geo_active_input zoom',
	// 				dataset 	 	: { name : 'zoom' , key : i },
	// 				value 		 	: current_value.zoom,
	// 				parent 		 	: inputs_container
	// 			})

	// 	// altitude
	// 		// label field altitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'label',
	// 				text_content 	: get_label['altitude'],
	// 				parent 		 	: inputs_container
	// 			})

	// 		// input field altitude
	// 			ui.create_dom_element({
	// 				element_type 	: 'input',
	// 				type 		 	: 'text',
	// 				class_name 		: 'altitude',
	// 				dataset 	 	: { name : 'alt' , key : i },
	// 				value 		 	: current_value.alt,
	// 				parent 		 	: inputs_container
	// 			})

	// 	// refresh
	// 		ui.create_dom_element({
	// 			element_type 	: 'span',
	// 			dataset 	 	: { key : i },
	// 			parent 		 	: inputs_container,
	// 			class_name 		: 'map_reload',
	// 		})

	// 	// map container
	// 		const map_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'leaflet_map',
	// 			dataset 	 	: { key : i },
	// 			parent 			: li
	// 		})

	// 	// init the map with the wrapper when container node is in DOM
	// 		// event_manager.when_in_dom(map_container, draw_map)
	// 		// function draw_map() {
	// 		// 	self.get_map(map_container, current_value)
	// 		// }
	// 		if (map_container) {
	// 			const observer = new IntersectionObserver(function(entries) {
	// 				// if(entries[0].isIntersecting === true) {}
	// 				const entry = entries[1] || entries[0]
	// 				if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
	// 					observer.disconnect();
	// 					self.get_map(map_container, current_value)
	// 					// observer.unobserve(entry.target);
	// 				}
	// 			}, { threshold: [0] });

	// 			observer.observe(map_container);
	// 		}


	// 	return li
	// }//end get_input_element_edit


