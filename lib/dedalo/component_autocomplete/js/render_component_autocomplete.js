// imports
	import event_manager from '../../page/js/page.js'
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
render_component_autocomplete.prototype.edit = async function(ar_section_record) {

	const self = this

	//const list_name = self.id + "_" + new Date().getUTCMilliseconds()

	// content_data
		const content_data = await render_content_data(ar_section_record)
		self.autocomplete_active = false

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_edit(self, content_data)

	// add paginator
		const paginator = wrapper.querySelector(".paginator")
		self.paginator.render().then(paginator_wrapper =>{
			paginator.appendChild(paginator_wrapper)
		})

	// add element, subscription to the events
	// show the add_value in the instance
	/*
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		async function add_element(current_section_record) {

			//change the autocomplete service to false and desactive it.
			if(self.autocomplete_active ===true){
				self.autocomplete.destroy()
				self.autocomplete_active = false
				self.autocomplete = null
			}

			//self.refresh();
			// inset the new section_record into the ar_section_record and build the node of the new locator
			//ar_section_record.push(current_section_record)
			//const inputs_container 	= wrapper.querySelector('.inputs_container')
			//input_element(current_section_record, inputs_container)
		}
		*/

	// remove element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('remove_element_'+self.id, remove_element)
		)
		async function remove_element(removed_key) {
			self.paginator.render()
			// refresh
				self.refresh()
				// const paginated_key = ar_section_record.find((item, index) => {
				// 											if(item.paginated_key===removed_key){
				// 												return index
				// 											}
				// 											})
				// ar_section_record.splice(paginated_key,1)
				 // change all elements inside of content_data
				// const new_content_data = await render_content_data(ar_section_record)
				 // replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
				// wrapper.childNodes[1].replaceWith(new_content_data)
		}


	// events
		wrapper.addEventListener("click", function(e){
			e.stopPropagation()

			// activate. Enable the service_autocomplete when the user do click
				if(self.autocomplete_active===false){

					self.autocomplete = new service_autocomplete()
					self.autocomplete.init({
						caller	: self,
						wrapper : wrapper
					})

					self.autocomplete_active = true
				}

			// remove
				if (e.target.matches('.button.remove')) {

					// update_data_value.
					const changed_data = {
						action	: 'remove',
						key		: e.target.dataset.key,
						value	: null
					}

					// update the data in the instance previous to save
					self.update_data_value(changed_data)
					self.data.changed_data = changed_data

					// rebuild and save the component
					self.save(changed_data).then(api_response =>{
						event_manager.publish('remove_element_'+self.id, e.target.dataset.key)
					})

					return true
				}

			// change_mode
				if (e.target.matches('.button.change_mode')) {

					self.change_mode()

					return true
				}

		})

	// subscribe to 'update_dom': if the dom was changed by other dom elements the value will be changed
		self.events_tokens.push(
			event_manager.subscribe('update_dom_'+self.id, (value) => {
				// change the value of the current dom element
					console.log("aqui:",value);
			})
		)


	return wrapper
}//end edit



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_component_autocomplete.prototype.list = async function(ar_section_record) {

	const self = this

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: self.model + '_list ' + self.tipo + ' breakdown'
		})


	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			//const child_item = await ar_section_record[i].node
			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}


	return content_data
}//end list



/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = async function(ar_section_record) {

	//const value = self.data.value

		console.log("ar_section_record:",ar_section_record);

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data","nowrap")

	// inputs contaniner
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

	//const dato_key = self.offset
	// build values (add all nodes from the rendered_section_record)
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			input_element(ar_section_record[i], inputs_container)
			//const section_record_node = await ar_section_record[i].render()
		}


	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})

		// // button add input
		// 	const button_add_input = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button add',
		// 		parent 			: buttons_container
		// 	})

	// button chamnge mode
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button change_mode',
			parent 			: buttons_container
		})



	return content_data
}//end render_content_data



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


