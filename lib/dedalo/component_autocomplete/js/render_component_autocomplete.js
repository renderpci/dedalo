/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'



/**
* RENDER_COMPONENT_AUTOCOMPLETE
* Manages the component's logic and apperance in client side
*/
export const render_component_autocomplete = function() {

	return true
}//end render_component_autocomplete



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_autocomplete.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// reset service state autocomplete_active
		self.autocomplete_active = false

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add element, subscription to the events
	// show the add_value in the instance
		//self.events_tokens.push(
		//	event_manager.subscribe('add_element_'+self.id, add_element)
		//)
		//async function add_element(key) {
		//	self.refresh()
		//	// change the autocomplete service to false and desactive it.
		//
		//	//if(self.autocomplete_active===true){
		//	//	self.autocomplete.destroy()
		//	//	self.autocomplete_active = false
		//	//	self.autocomplete 		 = null
		//	//}
		//
		//	//self.refresh();
		//
		//	// inset the new section_record into the ar_section_record and build the node of the new locator
		//	//ar_section_record.push(current_section_record)
		//	//const inputs_container 	= wrapper.querySelector('.inputs_container')
		//	//input_element(current_section_record, inputs_container)
		//}

	// remove element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('remove_element_'+self.id, remove_element)
		)
		async function remove_element(key) {
			//// Solucionar el paginado al borrar (!) :
			//const paginated_key = ar_section_record.find((item, index) => {
			//											if(item.paginated_key===removed_key){
			//												return index
			//											}
			//											})
			//ar_section_record.splice(paginated_key,1)
			//
			//// change all elements inside of content_data
			//const new_content_data = await render_content_data(ar_section_record)
			//// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			//wrapper.childNodes[1].replaceWith(new_content_data)
		}

	// events
		// click
			wrapper.addEventListener("click", function(e){
				e.stopPropagation()

				// ignore click on paginator
					//if (e.target.closest('.paginator')) {
					//	return false
					//}

				// remove
					if (e.target.matches('.button.remove')) {

						const changed_data = Object.freeze({
							action	: 'remove',
							key		: JSON.parse(e.target.dataset.key),
							value	: null
						})
						self.change_value({
							changed_data : changed_data,
							label 		 : e.target.previousElementSibling.textContent,
							refresh 	 : false
						})
						.then(async (api_response)=>{

							// service destroy. change the autocomplete service to false and desactive it.
								if(self.autocomplete_active===true){
									const destroyed = self.autocomplete.destroy()
									self.autocomplete_active = false
									self.autocomplete 		 = null
								}

							// update pagination offset
								self.update_pagination_values()

							// refresh
								self.refresh()

							// event to update the dom elements of the instance
								event_manager.publish('remove_element_'+self.id, e.target.dataset.key)
						})

						return true
					}


				// activate service. Enable the service_autocomplete when the user do click
					if(self.autocomplete_active===false){

						self.autocomplete = new service_autocomplete()
						self.autocomplete.init({
							caller	: self,
							wrapper : wrapper
						})
						self.autocomplete_active = true
						self.autocomplete.search_input.focus()

						return true
					}

			})//end click event

	// subscribe to 'update_dom': if the dom was changed by other dom elements the value will be changed
		//self.events_tokens.push(
		//	event_manager.subscribe('update_dom_'+self.id, (value) => {
		//		// change the value of the current dom element
		//	})
		//)


	return wrapper
}//end edit



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_component_autocomplete.prototype.list = async function() {

	const self = this

	const ar_section_record = await self.get_ar_instances()

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: self.model + '_list ' + self.tipo + ' breakdown'
		})


	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			//const child_item = await ar_section_record[i].node
			const child_item = await ar_section_record[i].render()

			wrapper.appendChild(child_item)
		}

	// events
		// dblclick
			wrapper.addEventListener("dblclick", function(e){
				e.stopPropagation()

				// change mode
				self.change_mode('edit_in_list', true)
			})


	return wrapper
}//end list



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const ar_section_record = await self.get_ar_instances()


	const fragment = new DocumentFragment()


	// inputs contaniner
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container'
		})

	// build values (add all nodes from the rendered_section_record)
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			const current_section_record =  ar_section_record[i]
			if (!current_section_record) {
				console.log("current_section_record:",current_section_record);
			}
			await input_element(current_section_record, inputs_container)
			//const section_record_node = await ar_section_record[i].render()
		}
		fragment.appendChild(inputs_container)

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")


	return content_data
}//end content_data_edit



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = async function(current_section_record, inputs_container){

	const key = current_section_record.paginated_key

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			dataset 	 : { key : key },
			parent 		 : inputs_container
		})

	// input field
		const section_record_node = await current_section_record.render()
		li.appendChild(section_record_node)

	// button remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button remove',
			dataset			: { key : key },
			parent 			: li
		})


	return li
}//end input_element


