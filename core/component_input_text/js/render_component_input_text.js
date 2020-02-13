/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function() {

	return true
}//end render_component_input_text



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_input_text.prototype.list = async function() {

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
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string


	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_input_text.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	const multi_line 	= (self.context.properties && self.context.properties.hasOwnProperty(multi_line)) ? self.context.properties.multi_line : 'false'
	const element_type 	= (multi_line === true) ? 'textarea' :'input[type="text"]'

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
			get_input_element_edit(changed_data.key, changed_data.value, inputs_container, self)
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
			//e.stopPropagation()

			// update
			if (e.target.matches(element_type + '.input_value')) {
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

				const all_buttons_remove =wrapper.querySelectorAll('.remove')
					for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
						all_buttons_remove[i].classList.add("display_none")
					}


				if (e.target.matches(element_type)) {
					// set the button_remove associated to the input selected to visible
						const button_remove = e.target.parentNode.querySelector('.remove')
						button_remove.classList.remove("display_none")
				}


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

	// keyup event
		wrapper.addEventListener("keyup", async (e) => {
			e.stopPropagation()

			if (self.context.properties.unique && e.target.value!=='') {
				const unique = await self.is_unique(e.target.value)
				if (typeof unique!=="undefined") {
					ui.show_message(
						wrapper,
						`Warning. Duplicated value '${e.target.value}' in id: ` + unique.section_id,
						'warning'
					)
				}
			}
		})

	// dblclick event
		//wrapper.addEventListener("dblclick", function(e){
		//	e.stopPropagation()
		//	e.preventDefault()
		//
		//	if (self.mode==='edit_in_list') {
		//		// change mode (from 'edit_in_list' to 'list')
		//		self.change_mode('list', false)
		//	}
		//})

	// // focus event [focusin]
	// 	wrapper.addEventListener("focusin", e => {
	// 		// selected_node. fix selected node
	// 		//self.selected_node = wrapper

	// 		if (e.target.matches('input[type="text"]')) {
	// 			// set the button_remove associated to the input selected to visible
	// 		 	const button_remove = e.target.parentNode.querySelector('.remove')
	// 		 	button_remove.classList.remove("display_none")
	// 		 	//event_manager.publish('active_component', self)
	// 		}
	// 	})


	// // blur event [focusout]
	// 	wrapper.addEventListener("focusout", e => {
	// 		const button_remove = e.target.parentNode.querySelector('.remove')
	// 		 	button_remove.classList.add("display_none")
	// 	})

	return true
}//end add_events



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_input_text.prototype.search = async function() {

	const self 			= this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const content_data = await get_content_data_search(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

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
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_edit(i, inputs_value[i], inputs_container, self, is_inside_tool)
		}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button close
		if(mode==='edit_in_list' && !is_inside_tool){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: buttons_container
			})
		}

	// button add input
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: buttons_container
			})
		}

	// tools
		if (!is_inside_tool) ui.add_tools(self, buttons_container)

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* INPUT_ELEMENT
* @return dom element li
*/
const get_input_element_edit = (i, current_value, inputs_container, self, is_inside_tool) => {

	const mode 		 	= self.mode
	const multi_line 	= (self.context.properties && self.context.properties.hasOwnProperty(multi_line)) ? self.context.properties.multi_line : 'false'
	const element_type 	= (multi_line === true) ? 'textarea' :'input'

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: element_type,			
			class_name 		: 'input_value',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: li
		})

		if (!multi_line) input.type = 'text'

	// button remove
		if((mode==='edit' || 'edit_in_list') && !is_inside_tool){
			const button_remove = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button remove display_none',
				dataset			: { key : i },
				parent 			: li
			})
		}


	return li
}//end input_element



/**
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_search(i, inputs_value[i], fragment, self)
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_search



/**
* GET_INPUT_ELEMENT_SEARCH
* @return dom element input
*/
const get_input_element_search = (i, current_value, inputs_container, self) => {

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			value 		 	: q_operator,
			class_name 		: 'q_operator',
			parent 		 	: inputs_container
		})


	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: inputs_container
		})


	return input
}//end get_input_element_search

