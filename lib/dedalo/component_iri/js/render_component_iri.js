// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {common} from '../../common/js/common.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_iri = function() {

	return true
}//end render_component_iri



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_iri.prototype.list = async function() {

	const self = this

	// Options vars 
		const context 	= self.context
		const data 		= self.data		
	
	// Value as string
		const value_length = data.value.length
		let ar_value_string = [];

		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (data.value[i].title) {
				ar_line.push(data.value[i].title)
			}
			if (data.value[i].iri) {
				ar_line.push(data.value[i].iri)
			}

			if (ar_line && ar_line.length) {			
				ar_value_string.push(ar_line.join(' | '))
			}

		}
			
		const value_string = (ar_value_string && ar_value_string.length) ? ar_value_string.join('<br>') : null;

	// Node create
		const node = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			inner_html 	: value_string
		})

	return node
}//end list


/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_iri.prototype.edit = async function() {

	const self 	= this
	//const value = self.data.value || []

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_edit(self, content_data)

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {

			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"][type="'+changed_data.type+'"]')
		    changed_node.value = (changed_data.type==='text') ? changed_data.value.title : changed_data.value.iri
			
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {

			// change the value of the current dom element
			const inputs_container 	= wrapper.querySelector('.inputs_container')
			input_element(changed_data.key, changed_data.value, inputs_container, self)
		}

	// remove element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('remove_element_'+self.id, remove_element)
		)
		async function remove_element(component) {
			// change all elements inside of content_data
			const new_content_data = await render_content_data(component)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[2].replaceWith(new_content_data)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			e.stopPropagation()

			const target_type = (e.target.matches('input[type="text"].input_value'))? 'text':((e.target.matches('input[type="url"].input_value'))? 'url':'')
			// input_value, type=text or url. The standard input for the value of the component
			if (target_type==='text' || target_type==='url' ) {
				//get the input node that has changed
				const input = e.target					
				//the dataset.key has the index of correspondence self.data.value index
				const i 	= input.dataset.key
				
				// set the selected node for change the css
				self.selected_node = wrapper
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value
				//const value = (input.value.length>0) ? input.value : null		
				const value = self.set_value(self.selected_node, i)
	
				// set the changed_data for update the component data and send it to the server for change when save
				const changed_data = {
					action	: 'update',
					key	  	: i,
					value 	: value,
					type    : target_type
				}

				// update the data in the instance previous to save
				self.update_data_value(changed_data)
				// set the change_data to the instance
				self.data.changed_data = changed_data
				// event for save the component
				self.save(changed_data).then(api_response =>{
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, changed_data)
				})
				
				return true
			}
		}, false)

	// click event [mousedown]
		wrapper.addEventListener("mousedown", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('.button.add')) {

				// update_data_value. changed_data key is the posistion in the data array, the value is the new value
				const changed_data = {
					action	: 'insert',
					key	  	: self.data.value.length || 0,
					value 	: ""
				}
				self.data.changed_data = changed_data
				// update the data in the instance previous to save
				self.update_data_value(changed_data)

				// rebuild_nodes. event to render the component again
				self.save(changed_data).then(api_response =>{
					// event to update the dom elements of the instance
					event_manager.publish('add_element_'+self.id, changed_data)
				})

				return true
			}

			if (e.target.matches('.button.remove')) {


				// update_data_value.
				const changed_data = {
					action	: 'remove',
					key	  	: e.target.dataset.key,
					value 	: null
				}
				self.data.changed_data = changed_data

				// update the data in the instance previous to save
				self.update_data_value(changed_data)

				// rebuild and save the component
				self.save(changed_data).then(api_response =>{
					event_manager.publish('remove_element_'+self.id, self)
				})
				//event_manager.publish('save_component_'+self.id, self)

				return true
			}

			if (e.target.matches('.button.go_link')) {

				self.open_iri(e.target)

				return true

			}
		})

	return wrapper
}//end edit


/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_iri.prototype.search = async function() {

	const self 	= this

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_edit(self, content_data)

	// id
		wrapper.id = self.id

	// Events

		// change event, for every change the value in the imputs of the component
			wrapper.addEventListener('change', (e) => {
				e.stopPropagation()

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
			})

	return wrapper
}//end search

/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = async function(self) {

	const value = self.data.value || []
	const mode 	= self.mode

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data","nowrap")

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

	// values (inputs)
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			input_element(i, inputs_value[i], inputs_container, self)
		}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})

	// button add input
		if(mode==='edit'){
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: buttons_container
			})
		}

	return content_data
}//end render_content_data



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	const mode = self.mode

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input title field
		const input_title = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
		    placeholder		: (mode==='edit') ? get_label["title"]: null,
			dataset 	 	: { key : i },
			value 		 	: current_value.title,
			parent 		 	: li
		})

	if(mode==='edit'){
		
	// input iri field
		const input_iri = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'url',
			class_name 		: 'input_value',
			placeholder		: 'http://',
			pattern			: '(https?)?:\/\/.*\..+',
			dataset 	 	: { key : i },
			value 		 	: current_value.iri,
			parent 		 	: li
		})

	// button remove
		
			const button_remove = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button remove display_none',
				dataset			: { key : i },
				parent 			: li
			})

			// button link
			const button_link = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button go_link display_none',
				dataset			: { key : i },
				parent 			: li
			})
		}

	return li
}//end input_element
