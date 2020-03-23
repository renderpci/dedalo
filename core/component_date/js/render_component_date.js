/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
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
	const date_mode = self.context.properties.date_mode || 'date'

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level

	// load editor file
		await self.init_editor()

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data,
			buttons 	 : buttons
		})

		wrapper.classList.add(date_mode)

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
			input_element(changed_data.key, changed_data.value, inputs_container, self)
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
			//e.stopPropagation()

			const all_buttons_remove =wrapper.querySelectorAll('.remove')
				for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
					all_buttons_remove[i].classList.add("display_none")
				}

			const date_mode = self.context.properties.date_mode

			//if (e.target.matches('input[type="text"]') && date_mode != 'period' && date_mode != 'time') {
			if (e.target.matches('.calendar') && date_mode != 'period' && date_mode != 'time') {
				// set the button_remove associated to the input selected to visible
					// const button_remove = e.target.parentNode.querySelector('.remove')
					// button_remove.classList.remove("display_none")
					const datePicker = flatpickr(e.target, {
						onClose: self.close_flatpickr,
						onValueUpdate: function(selectedDates, dateStr, instance){
											ui.component.error(false, e.target.parentNode.previousSibling)
             								self.update_value_flatpickr(selectedDates, dateStr, instance, self, e.target)
             						}
					})

					datePicker.open()

				return true
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

			if (e.target.matches('.button.close')) {
				//change mode
				self.change_mode('list', true)

				return true
			}
		})

	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return
*/
const content_data_edit = async function(self) {

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
			input_element(i, inputs_value[i], inputs_container, self)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



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
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

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
				element_type	: 'div',
				class_name 		: 'button remove display_none',
				dataset			: { key : i },
				parent 			: li
			})
		}


	return li
}//end input_element



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
		element_type	: 'span',
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
		element_type	: 'span',
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
		element_type	: 'span',
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

	const button_calendar = ui.create_dom_element({
		element_type	: 'a',
		class_name 		: 'input-group-addon',
		dataset 		: { toggle: ''},
		parent 			: flatpickr_wrap
	})

	const icon_calendar = ui.create_dom_element({
		element_type	: 'i',
		class_name 		: 'button calendar',
		dataset 	 	: { key : i, role: role_name },
		parent 			: button_calendar
	})

	return true
}//end input_element_flatpicker



