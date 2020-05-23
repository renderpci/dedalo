/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'


/**
* RENDER_COMPONENT_CALCULATION
* Manage the components logic and appearance in client side
*/
export const render_calculation = function(component) {

	return true
}//end render_calculation



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_calculation.prototype.list = async function() {

	const self = this

	// short vars
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
* Render node for use in edit
* @return DOM node
*/
render_calculation.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})

	// events
		// add_events(self, wrapper)

	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	// sort vars
		const mode 			= self.mode
		const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// values_container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const ipo 			= self.ipo
		const ipo_length 	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data = self.value.filter(item => item.key === i)
			get_value_element(i, data, values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* INPUT_ELEMENT
* @return DOM node li
*/
const get_value_element = (i, data, inputs_container, self) => {

	const output = self.ipo[i].output

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	for (let j = 0; j < output.length; j++) {

		const data_map = output[j]
		const current_data = data.find(el => el.id===data_map.id)

		const value = (typeof current_data!=='undefined')
			? current_data.value
			: null

		const label_suffix = value==1 ? '_singular' : ''

		// label before
			const current_label_before = (value && data_map['label_before'+label_suffix])
				? data_map['label_before'+label_suffix]
				: ''
			const label_before =  ui.create_dom_element({
					element_type 	: "label",
					class_name 		: 'before',
					text_content 	: get_label[current_label_before] || current_label_before,
					parent 		 	: li
			})

		// value
			const element_value = ui.create_dom_element({
				element_type 	: "span",
				class_name 		: 'value',
				inner_html 		: value,
				parent 		 	: li
			})

		// label after
		const current_label_after = (value && data_map['label_after'+label_suffix])
			? data_map['label_after'+label_suffix]
			: ''
		const separator = (value && data_map['separator'])
			? data_map['separator']
			: ''
		const label_after =  ui.create_dom_element({
				element_type 	: "label",
				class_name 		: 'after',
				text_content 	: (get_label[current_label_after] || current_label_after) + separator,
				parent 		 	: li
				})



		// event update_widget_value
			event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) => {

				const current_data = changed_data.find(el => el.id===data_map.id)

				if(typeof current_data==='undefined'){
					element_value.innerHTML = ''
					label_before.textContent = ''
					label_after.textContent = ''
					return
				}
				const value = current_data.value
				element_value.innerHTML = value

				// labels
				const label_suffix = value==1 ? '_singular' : ''

				// label before
				const current_label_before = (value && data_map['label_before'+label_suffix])
					? data_map['label_before'+label_suffix]
					: ''
				label_before.textContent = get_label[current_label_before] || current_label_before

				// label after
				const current_label_after = (value && data_map['label_after'+label_suffix])
					? data_map['label_after'+label_suffix]
					: ''
				const separator = (value && data_map['separator'])
					? data_map['separator']
					: ''
				label_after.textContent = (get_label[current_label_after] || current_label_after) + separator

			})
	}

	return li
}//end input_element
