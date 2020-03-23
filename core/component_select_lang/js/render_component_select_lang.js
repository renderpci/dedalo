/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_select_lang = function(component) {

	return true
}//end render_component_select_lang



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_select_lang.prototype.list = async function() {

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
render_component_select_lang.prototype.edit = async function(options={render_level:'full'}) {

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
			content_data : content_data,
			buttons 	 : buttons
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

	return wrapper
}//end edit



/**
* get_CONTENT_DATA_EDIT
* @return
*/
const get_content_data_edit = async function(self) {

	// Options vars
	const mode 			= self.mode
	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// build selectable options
		input_element(inputs_container, self)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button close
		if(mode==='edit_in_list' && !is_inside_tool){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: fragment
			})
		}

	// button edit
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button edit',
				parent 			: fragment
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



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


