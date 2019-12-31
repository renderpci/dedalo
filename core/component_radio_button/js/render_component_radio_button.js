/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_radio_button = function() {

	return true
}//end render_component_radio_button


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_radio_button.prototype.list = async function() {

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : true
		})

	// Value as string
		const value_string = data.value

	// Set value
		wrapper.textContent = value_string

	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_radio_button.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// events delegated
	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
		}

	// add button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('edit_element_'+self.id, edit_element)
		)
		function edit_element(changed_data) {
			// change the value of the current dom element
			//const changed_data = component.data.changed_data
			//const inputs_container = wrapper.querySelector('.inputs_container')
			//input_element(changed_data.key, changed_data.value, inputs_container)
		}

	// remove button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('reset_element_'+self.id, reset_element)
		)
		async function reset_element(instance) {
			// change all elements inside of content_data
			const new_content_data = await content_data_edit(instance)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[1].replaceWith(new_content_data)
		}

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update
				if (e.target.matches('input[type="radio"]')) {

					const parsed_value 	= JSON.parse(e.target.value)

					const changed_data = Object.freeze({
						action  : 'update',
						key 	: 0,
						value 	: parsed_value
					})

					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((api_response)=>{
						//self.selected_key = e.target.dataset.key
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, self)
					})

					return true
				}

		}, false)

	// click event
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// remove all
				if (e.target.matches('.button.reset')) {

					if (self.data.value[0] !=null) {
						// force possible input change before remove
						document.activeElement.blur()

						if (self.data.value.length===0) {
							return true
						}

						const changed_data = Object.freeze({
							action  : 'remove',
							key 	: false,
							value 	: null
						})

						self.change_value({
							changed_data : changed_data,
							label  		 : self.get_checked_value_label(),//'All',
							refresh 	 : true
						})
						.then((api_response)=>{
							// rebuild and save the component
							// event_manager.publish('reset_element_'+self.id, self)
							// event_manager.publish('save_component_'+self.id, self)
						})

						return true
					}
				}

			// edit target section
				if (e.target.matches('.button.edit')) {
					// rebuild_nodes. event to render the component again
					event_manager.publish('edit_element_'+self.id, self)

					return true
				}

			// mode change
				if (e.target.matches('.button.close')) {
					//change mode
					self.change_mode('list', true)

					return true
				}


		},false)

	// focus event
		wrapper.addEventListener("focus", e => {
			// e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="radio"]')) {
			 	event_manager.publish('active_component', self)

			 	return true
			}
		},true)

	return wrapper
}//end edit


/**
* CONTENT_DATA_EDIT
* @return
*/
const content_data_edit = async function(self) {

	// Options vars
	const value 	= self.data.value
	const datalist	= self.data.datalist
	const mode 		= self.mode

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

		// build options
		const value_compare = value.length>0 ? value[0] : null
		const length = datalist.length
		for (let i = 0; i < length; i++) {
			input_element(i, datalist[i], inputs_container, self)
		}

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button close input
		if(mode==='edit_in_list'){
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: buttons_container
			})
		}

	// button add input
		if(mode==='edit' || 'edit_in_list'){
			// button edit
				ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button edit',
					parent 			: buttons_container
				})

			// button reset
				ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button reset',
					parent 			: buttons_container
				})
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit

/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	const value  		 	= self.data.value || []
	const value_length   	= value.length
	const datalist_item  	= current_value
	const datalist_value 	= datalist_item.value
	const label 		 	= datalist_item.label
	const section_id	 	= datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			parent 			: inputs_container
		})

	// input checkbox
		const option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'radio',
			id 				: self.id +"_"+ i,
			dataset 	 	: { key : i },
			value 			: JSON.stringify(datalist_value),
			name 			: self.id,
			parent 			: li
		})

	// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					option.checked = 'checked'
			}
		}

	// label
		const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			text_content 	: label_string,
			parent 			: li
		})
		option_label.setAttribute("for", self.id +"_"+ i)


	return li

}//end input_element
