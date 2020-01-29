/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_COMPONENT_GEOLOCATION
* Manages the component's logic and apperance in client side
*/
export const render_component_geolocation = function() {

	return true
}//end render_component_geolocation



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_geolocation.prototype.list = async function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data
		const value 	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(' | ')

	// Set value
		wrapper.textContent = value_string


	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_geolocation.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	//init the map with the wrapper
		self.init_map(wrapper)

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			//console.log("-------------- - event update_value changed_data:", changed_data);
			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			//console.log("-------------- + event add_element changed_data:", changed_data);
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			get_input_element(changed_data.key, changed_data.value, inputs_container, self)
		}

	// remove element, subscription to the events
		//self.events_tokens.push(
		//	event_manager.subscribe('remove_element_'+self.id, remove_element)
		//)
		//async function remove_element(component) {
		//	// change all elements inside of content_data
		//	const new_content_data = await content_data_edit(component)
		//	// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
		//	wrapper.childNodes[2].replaceWith(new_content_data)
		//}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			// e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {
				//console.log("++update e.target:",JSON.parse(JSON.stringify(e.target.dataset.key)));
				//console.log("++update e.target value:",JSON.parse(JSON.stringify(e.target.value)));

				// // is_unique check
				// if (self.context.properties.unique) {
				// 	// const result = await check_duplicates(self, e.target.value, false)
				// 	if (self.duplicates) {
				// 		e.target.classList.add("duplicated")

				// 		const message = ui.build_message("Warning. Duplicated value " + self.duplicates.section_id)
				// 		wrapper.appedChild(message)

				// 		return false
				// 	}
				// }

				const changed_data = Object.freeze({
					action	: 'update',
					key		: JSON.parse(e.target.dataset.key),
					value	: (e.target.value.length>0) ? e.target.value : null,
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

		}, false)

	// click event [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// insert
				if (e.target.matches('.button.add')) {

					const changed_data = Object.freeze({
						action	: 'insert',
						key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
						value	: null
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('add_element_'+self.id, changed_data)
					})

					return true
				}

			// remove
				if (e.target.matches('.button.remove')) {

					// force possible input change before remove
					document.activeElement.blur()

					const changed_data = Object.freeze({
						action	: 'remove',
						key		: e.target.dataset.key,
						value	: null,
						refresh : true
					})
					self.change_value({
						changed_data : changed_data,
						label 		 : e.target.previousElementSibling.value,
						refresh 	 : true
					})
					.then(()=>{
					})

					return true
				}

			// change_mode
				if (e.target.matches('.button.close')) {

					//change mode
					self.change_mode('list', false)

					return true
				}

		})

	// click event [keyup]
		wrapper.addEventListener("keyup", async (e) => {
			// e.stopPropagation()

			if (self.context.properties.unique && e.target.value!=='') {
				const unique = await self.is_unique(e.target.value)
				if (typeof unique!=="undefined") {
					ui.component.show_message(wrapper,
						`Warning. Duplicated value '${e.target.value}' in id: ` + unique.section_id)
				}
			}
		})


	return wrapper
}//end edit



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_geolocation.prototype.search = async function() {

	const self 	= this

	const content_data = await content_data_edit(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// Events

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
			}, false)



	return wrapper
}//end search



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment = new DocumentFragment()

	// inputs
		get_input_element(value, fragment, self)


	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button close
		if(mode==='edit_in_list' && !ui.inside_tool(self)){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: buttons_container
			})
		}

	// tools
		if (!ui.inside_tool(self)) {
			const tools = self.tools
			const tools_length = tools.length

			for (let i = 0; i < tools_length; i++) {
				if(tools[i].show_in_component){
					buttons_container.appendChild( ui.tool.build_tool_button(tools[i], self) );
				}
			}
		}

	// map container
		const map_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'leaflet_map',
			parent 			: fragment
		})


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")
			  content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (value, content_data, self) => {

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

	// latitude
		// li_lat
			const li_lat = ui.create_dom_element({
				element_type : 'li',
				parent 		 : inputs_container
			})

		// label field latitude
			ui.create_dom_element({
				element_type 	: 'label',
				text_content 	: get_label['latitud'],
				parent 		 	: li_lat
			})

		// input field latitude
			ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				class_name 		: 'geo_active_input lat',
				dataset 	 	: { name : 'lat' },
				value 		 	: value.lat,
				parent 		 	: li_lat
			})

	// longitude
		// li_lon
			const li_lon = ui.create_dom_element({
				element_type : 'li',
				parent 		 : inputs_container
			})

		// label field longitude
			ui.create_dom_element({
				element_type 	: 'label',
				text_content 	: get_label['longitud'],
				parent 		 	: li_lon
			})

		// input field longitude
			ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				class_name 		: 'geo_active_input lon',
				dataset 	 	: { name : 'lon' },
				value 		 	: value.lon,
				parent 		 	: li_lon
			})

	// zoom
		// li_zoom
			const li_zoom = ui.create_dom_element({
				element_type : 'li',
				parent 		 : inputs_container
			})

		// label field zoom
			ui.create_dom_element({
				element_type 	: 'label',
				text_content 	: get_label['mapa_zoom'],
				parent 		 	: li_zoom
			})

		// input field zoom
			ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				class_name 		: 'geo_active_input zoom',
				dataset 	 	: { name : 'zoom' },
				value 		 	: value.zoom,
				parent 		 	: li_zoom
			})

	// altitude
		// li_alt
			const li_alt = ui.create_dom_element({
				element_type : 'li',
				parent 		 : inputs_container
			})

		// label field altitude
			ui.create_dom_element({
				element_type 	: 'label',
				text_content 	: get_label['altitude'],
				parent 		 	: li_alt
			})

		// input field altitude
			ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				class_name 		: 'altitude',
				dataset 	 	: { name : 'alt' },
				value 		 	: value.alt,
				parent 		 	: li_alt
			})


	return inputs_container
}//end get_input_element


