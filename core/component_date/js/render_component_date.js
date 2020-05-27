/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_COMPONENT_DATE
* Manage the components logic and appearance in client side
*/
export const render_component_date = function() {

	return true
}//end render_component_date



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_date.prototype.list = async function() {

	const self = this

	// Options vars
		const context 		= self.context
		const data 			= self.data

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
render_component_date.prototype.edit = async function(options={render_level : 'full'}) {

	const self = this

	// date_mode . Defined in ontology properties
		const date_mode = self.context.properties.date_mode || 'date'

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level || 'full'

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})

		wrapper.classList.add(date_mode)

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	const date_mode = self.context.properties.date_mode

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {

		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			get_input_element_edit(changed_data.key, changed_data.value, inputs_container, self)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			//e.stopPropagation()

			// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"]')) {

				let value

				// build date
				switch(date_mode) {

					case 'range':
						const dato_range = self.get_dato_range(e.target, e.target.dataset.role)

						if (e.target.dataset.role==='range_start') {
							(dato_range.start === false) ? value = false : value = dato_range
						}

						if (e.target.dataset.role==='range_end') {
							(dato_range.end === false) ? value = false : value = dato_range
						}
						break;

					case 'period':
						value = self.get_dato_period(e.target.parentNode)
						break;

					case 'time':
						const dato = (e.target.value.length>0) ? self.get_dato_time(e.target.value) : ''
						if (dato) {
							e.target.value = dato.res_formatted
							value = dato.dd_date
						}
						break;

					case 'date':
					default:
						value = (e.target.value.length>0) ? self.get_dato_date(e.target.value) : ''
						break;
				}

				const validated = (value || value === '') ? true : false
				ui.component.error(!validated, e.target)

				if (validated) {
					const changed_data = Object.freeze({
						action	: 'update',
						key		: JSON.parse(e.target.dataset.key),
						value	: value,
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, changed_data)
					})
				}
				return true
			}
		}, false)

	// click event [click]
		wrapper.addEventListener("click", e => {

			// const all_buttons_remove =wrapper.querySelectorAll('.remove')

			// console.log("all_buttons_remove:",all_buttons_remove);

			// for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
			// 	all_buttons_remove[i].classList.add("display_none")
			// }

			// show current remove button
			// const targetDate = e.target.parentNode
			// console.log("e.target:",e.target);
			// console.log("targetDate:",targetDate.parentNode);

				// if (targetDate.matches('input[type="text"')) {
				// 	// set the button_remove associated to the input selected to visible
				// 		const button_remove = targetDate.parentNode.querySelector('.remove')
				// 		if (button_remove) {
				// 			button_remove.classList.remove("display_none")
				// 		}
				// }
				// if (targetDate.matches('i')) {
				// 		const button_email_send = targetDate.parentNode.querySelector('.calendar')
				// 		if (button_email_send) {
				// 			button_email_send.classList.remove("display_none")
				// 		}
				// }	

			//if (e.target.matches('input[type="text"]') && date_mode != 'period' && date_mode != 'time') {
			if (e.target.matches('.calendar') && date_mode!=='period' && date_mode!=='time') {
			//if (date_mode != 'period' && date_mode != 'time') {

				//console.log("e.target.parentNode.parentNode:",e.target.parentNode.parentNode);

				// // set the button_remove associated to the input selected to visible
				// 	const button_remove = e.target.parentNode.parentNode.querySelector('.remove')
				// 		console.log("button_remove:",button_remove);
				// 	if (button_remove) {
				// 		button_remove.classList.remove("display_none")
				// 	}

				//ui.component.show_button(e.target.parentNode.parentNode, '.remove')


				const datePicker = flatpickr(e.target, {
					onClose 	  : self.close_flatpickr,
					onValueUpdate : function(selectedDates, dateStr, instance){
										ui.component.error(false, e.target.parentNode.previousSibling)
										self.update_value_flatpickr(selectedDates, dateStr, instance, self, e.target)
									}
				})
				datePicker.open()

				return true
			//} else {
				//ui.component.show_button(e.target.parentNode, '.remove')
			}

			// insert
				if (e.target.matches('.button.add')) {

					const changed_data = Object.freeze({
						action	: 'insert',
						key		: self.data.value.length,
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
				if (e.target.matches('.button.remove')) {					// e.stopPropagation()

					// force possible input change before remove
					document.activeElement.blur()

					const current_input = e.target.parentNode.querySelector('input')
					const current_value = current_input ? current_input.value : null

					const changed_data = Object.freeze({
						action	: 'remove',
						key		: e.target.dataset.key,
						value	: null,
						refresh : true
					})
					self.change_value({
						changed_data : changed_data,
						label 		 : current_value,
						refresh 	 : true
					})
					.then(()=>{
					})

					return true
				}
		})//end click

	return true
}//end add_events



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_component_date.prototype.search = async function() {

	const self 	= this

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

			}, false)

	return wrapper
}//end search



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const value 		= self.data.value
	const mode 			= self.mode
	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// build values
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_edit(i, inputs_value[i], inputs_container, self)
		}

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

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

	// button add input
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
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
* GET_INPUT_ELEMENT_EDIT
* @return dom element li
*/
const get_input_element_edit = (i, current_value, inputs_container, self) => {

	const mode 		= self.mode
	const date_mode = self.context.properties.date_mode

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// build date
		switch(date_mode) {

			case 'range':
				input_element_range(i, current_value, li, self)
				break;

			case 'period':
				input_element_period(i, current_value, li)
				break;

			case 'time':
				input_element_time(i, current_value, li, self)
				break;

			case 'date':
			default:
				input_element_default(i, current_value, li, self)
				break;
		}

	// button remove
		if(mode==='edit' || 'edit_in_list'){
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button remove hidden_button',
				dataset			: { key : i },
				parent 			: li
			})
		}


	return li
}//end get_input_element_edit



/**
* INPUT_ELEMENT_RANGE
*/
const input_element_range = (i, current_value, inputs_container, self) => {

	const date_mode = self.context.properties.date_mode

	const input_value_start = (current_value && current_value.start) ? self.get_dd_timestamp(current_value.start, date_mode)	: ''
	const input_value_end 	= (current_value && current_value.end) ? self.get_dd_timestamp(current_value.end, date_mode) 		: ''

		input_element_flatpicker(i, 'range_start', input_value_start, inputs_container, self)

		// create div
		const div = ui.create_dom_element({
			element_type	: 'div',
			text_content	: ' <> ',
			parent 			: inputs_container
		})

		input_element_flatpicker(i, 'range_end', input_value_end, inputs_container, self)

	return true
}//end input_element_range



/**
* INPUT_ELEMENT_PERIOD
*/
const input_element_period = (i, current_value, inputs_container) => {

	const period = (current_value &&current_value.period) ? current_value.period : null

	const year = (period) ? period.year : ''
	const month =  (period) ? period.month : ''
	const day =  (period) ? period.day : ''

	const label_year = (year!=='' && year>1) ? get_label['anyos'] : get_label['anyo']
	const label_month = (month!=='' && month>1) ? get_label['meses'] : get_label['mes']
	const label_day = (day!=='' && day>1) ? get_label['dias'] : get_label['dia']


	const input_year = ui.create_dom_element({
		element_type	: 'input',
		type 			: 'text',
		class_name 		: 'input_value',
		dataset 	 	: { key : i, role: 'period_year' },
		value 			: year,
		placeholder 	: 'Y',
		parent 			: inputs_container
	})

	const span_year = ui.create_dom_element({
		element_type	: 'label',
		text_content	: label_year,
		parent 			: inputs_container
	})

	const input_month = ui.create_dom_element({
		element_type	: 'input',
		type 			: 'text',
		class_name 		: 'input_value',
		dataset 	 	: { key : i, role: 'period_month' },
		value 			: month,
		placeholder 	: 'M',
		parent 			: inputs_container
	})

	const span_month = ui.create_dom_element({
		element_type	: 'label',
		text_content	: label_month,
		parent 			: inputs_container
	})

	const input_day = ui.create_dom_element({
		element_type	: 'input',
		type 			: 'text',
		class_name 		: 'input_value',
		dataset 	 	: { key : i, role: 'period_day' },
		value 			: day,
		placeholder 	: 'D',
		parent 			: inputs_container
	})

	const span_day = ui.create_dom_element({
		element_type	: 'label',
		text_content	: label_day,
		parent 			: inputs_container
	})

	return true
}//end input_element_period



/**
* INPUT_ELEMENT_TIME
*/
const input_element_time = (i, current_value, inputs_container, self) => {

	const date_mode = self.context.properties.date_mode

	const input_value = (current_value) ? self.get_dd_timestamp(current_value, date_mode) : ''

	const input_time = ui.create_dom_element({
		element_type	: 'input',
		type 			: 'text',
		class_name 		: 'input_value',
		dataset 	 	: { key : i },
		value 			: input_value,
		placeholder 	: self.get_ejemplo(),
		parent 			: inputs_container
	})

	return true
}//end input_element_time



/**
* INPUT_ELEMENT_DEFAULT
*/
const input_element_default = (i, current_value, inputs_container, self) => {

	const date_mode 	= self.context.properties.date_mode
	const input_value 	= (current_value && current_value.start) ? self.get_dd_timestamp(current_value.start, date_mode) : ''

	input_element_flatpicker(i, 'default', input_value, inputs_container, self)

	return true
}//end input_element_default



/**
* INPUT_ELEMENT_FLATPICKER
*/
const input_element_flatpicker = (i, role_name, input_value, inputs_container, self) => {

	// create div end
		const flatpickr_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'flatpickr input-group',
			dataset 	 	: { wrap : true, clickOpens: false, dateFormat: 'd-m-Y'},
			parent 			: inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'form-control',
			dataset 	 	: { key : i, role: role_name, altinput: true, input: ''},
			value 		 	: input_value,
			placeholder 	: self.get_ejemplo(),
			parent 		 	: flatpickr_wrap
		})

	// button_calendar
		const button_calendar = ui.create_dom_element({
			element_type	: 'a',
			class_name 		: 'input-group-addon',
			dataset 		: { toggle: ''},
			parent 			: flatpickr_wrap
		})

	// icon_calendar
		const icon_calendar = ui.create_dom_element({
			element_type	: 'i',
			class_name 		: 'button calendar hidden_button',
			dataset 	 	: { key : i, role: role_name },
			parent 			: button_calendar
		})

	return true
}//end input_element_flatpicker



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
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
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


