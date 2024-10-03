// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'



/**
* RENDER_COMPONENT_CALCULATION
* Manage the components logic and appearance in client side
*/
export const render_calculation = function() {

	return true
}//end render_calculation


/**
* EDIT
* Render node for use in edit
* @return HTMLElement wrapper
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
* LIST
* Render component node to use in list
* @return HTMLElement wrapper
*/
render_calculation.prototype.list = render_calculation.prototype.edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// sort vars
		const mode = self.mode

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
* @return HTMLElement li
*/
const get_value_element = (i, data, inputs_container, self) => {

	const output = self.ipo[i].output

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item calculation',
			parent			: inputs_container
		})

	for (let j = 0; j < output.length; j++) {

		const data_map = output[j]
		const current_data = data.find(el => el.id===data_map.id)

		const server_value = (typeof current_data!=='undefined')
			? current_data.value
			: null

		const get_date_string = ()=>{

			if(server_value){

				// const date		= new Date(server_value.year, server_value.month -1, server_value.day);
				// const locale	= page_globals.locale
				// const result	= date.toLocaleString(locale, {year:"numeric",month:"numeric",day:"numeric"});

				const ar_date = []
				if(server_value.day){
					ar_date.push(server_value.day)
				}
				if(server_value.month){
					ar_date.push(server_value.month)
				}
				if(server_value.year){
					ar_date.push(server_value.year)
				}
				const result = ar_date.join('/')
				return result
			}
		}

		const value = (data_map.format && data_map.format === 'date')
			? get_date_string()
			: server_value

		const label_suffix = value==1 ? '_singular' : ''

		// label before
			const current_label_before = (value && data_map['label_before'+label_suffix])
				? data_map['label_before'+label_suffix]
				: ''
			const label_before =  ui.create_dom_element({
					element_type	: "label",
					class_name		: 'before',
					inner_html		: get_label[current_label_before] || current_label_before,
					parent			: li
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
				element_type	: "label",
				class_name		: 'after',
				inner_html		: ' '+(get_label[current_label_after] || current_label_after) + separator,
				parent			: li
			})

		// event update_widget_value
			const update_widget_value_handler = (changed_data) => {

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
			}
			self.events_tokens.push(
				event_manager.subscribe('update_widget_value_'+i+'_'+self.id, update_widget_value_handler)
			)
	}//end for loop


	return li
}//end input_element



// @license-end
