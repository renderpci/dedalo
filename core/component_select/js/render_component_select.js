/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_select = function(component) {

	return true
}//end render_component_select


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_select.prototype.list = async function() {

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
render_component_select.prototype.edit = async function(options={render_level:'full'}) {

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
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events delegated
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = (self, wrapper) => {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
		}

	// edit button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('edit_element_'+self.id, edit_element)
		)
		function edit_element(changed_data) {
			// change the value of the current dom element
			//const changed_data = component.data.changed_data
			//const inputs_container = wrapper.querySelector('.inputs_container')
			//input_element(changed_data.key, changed_data.value, inputs_container)
		}

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update
				if (e.target.matches('select')) {

					const parsed_value = (e.target.value.length>0) ? JSON.parse(e.target.value) : null

					const changed_data = Object.freeze({
						action  : (parsed_value != null) ? 'update' : 'remove',
						key 	: (parsed_value != null) ? 0 : false,
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

			if (e.target.matches('select')) {
			 	event_manager.publish('active_component', self)

			 	return true
			}
		},true)


	return true
}//end add_events



/**
* CONTENT_DATA_EDIT
* @return
*/
const content_data_edit = async function(self) {

	// Options vars
	const mode = self.mode

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// build selectable options
		input_element(inputs_container, self)

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
		}

	// tools
		if (!is_inside_tool) ui.add_tools(self, buttons_container)

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
//const input_element = (i, current_value, inputs_container, self) => {
const input_element = (inputs_container, self) => {

	const value 	= self.data.value || []
	const datalist	= JSON.parse(JSON.stringify(self.data.datalist)) || []

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			parent 			: inputs_container
		})

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: li
		})

	// add empty option at begining of array
		const empty_option = {
			label : '',
			value : null
		}
		datalist.unshift(empty_option);

	// build options
		const value_compare = value.length>0 ? value[0] : null
		const length = datalist.length
		for (let i = 0; i < length; i++) {

			const datalist_item = datalist[i]
			const option = ui.create_dom_element({
				element_type	: 'option',
				value 			: JSON.stringify(datalist_item.value),
				text_content 	: datalist_item.label,
				parent 			: select
			})
			// selected options set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				option.selected = true
			}

		}

	return li

}//end input_element
