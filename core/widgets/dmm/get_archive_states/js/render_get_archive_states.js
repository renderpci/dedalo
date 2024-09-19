// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_STATES
* Manages the component's logic and appearance in client side
*/
export const render_get_archive_states = function() {

	return true
}//end render_get_archive_states



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_get_archive_states.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const ipo 			= self.ipo
		const ipo_length 	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data 		= self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return HTMLElement li
*/
const get_value_element = (i, data, values_container, self) => {

	const closed_afirmative			= data.find(item => item.id === 'closed_afirmative').value
	const closed_label 				= data.find(item => item.id === 'closed_afirmative').closed_label
	const answer_label 				= data.find(item => item.id === 'closed_afirmative').answer_label
	const closed_afirmative_percent	= data.find(item => item.id === 'closed_afirmative_percent').value
	const closed_negative			= data.find(item => item.id === 'closed_negative').value
	const closed_negative_percent	= data.find(item => item.id === 'closed_negative_percent').value
	const closed_count				= data.find(item => item.id === 'closed_count').value
	const closed_count_percent		= data.find(item => item.id === 'closed_count_percent').value
	const closed_total				= data.find(item => item.id === 'closed_total').value
	const answer_afirmative			= data.find(item => item.id === 'answer_afirmative').value
	const answer_afirmative_percent	= data.find(item => item.id === 'answer_afirmative_percent').value
	const answer_negative			= data.find(item => item.id === 'answer_negative').value
	const answer_negative_percent	= data.find(item => item.id === 'answer_negative_percent').value
	const answer_count				= data.find(item => item.id === 'answer_count').value
	const answer_count_percent		= data.find(item => item.id === 'answer_count_percent').value
	const answer_total				= data.find(item => item.id === 'answer_total').value

	const label_yes	= get_label.yes || 'yes'
	const label_no	= get_label.no || 'no'
	const label_of	= get_label.of || 'of'

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item get_archive_states',
			parent			: values_container
		})

	//closed
		const closed_node = ui.create_dom_element({
			element_type: 'div',
			class_name	: 'closed',
			parent 		: li
		})

		// label
		const closed_label_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'states_label closed_label',
			inner_html		: closed_label + ':',
			parent			: closed_node
		})
			//answer_text_node
			const closed_text =[]
			const closed_afirmative_text = closed_afirmative && closed_afirmative > 0
				? `${label_yes}: ${closed_afirmative} (${closed_afirmative_percent}%)`
				: ''

			const closed_negative_text = closed_negative && closed_negative > 0
				? `${label_no}: ${closed_negative} (${closed_negative_percent}%)`
				: ''

			const closed_total_text = closed_count && closed_count > 0
				? `n: ${closed_count} ${label_of} ${closed_total} (${closed_count_percent}%)`
				: ''
			closed_text.push(closed_afirmative_text)
			closed_text.push(closed_negative_text)
			closed_text.push(closed_total_text)

			//closed_text_node
				const closed_text_node = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'text',
					inner_html 	: closed_text.join(' | ') ,
					parent 		: closed_node
				})

	//answer
		const answer_node = ui.create_dom_element({
			element_type: 'div',
			class_name	: 'answer',
			parent 		: li
		})

		// label
		const answer_label_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'states_label answer_label',
			inner_html		: answer_label + ':',
			parent			: answer_node
		})
			//answer_text_node
			const answer_text =[]
			const answer_afirmative_text = answer_afirmative && answer_afirmative > 0
				? `pos: ${answer_afirmative} (${answer_afirmative_percent}%)`
				: ''

			const answer_negative_text = answer_negative && answer_negative > 0
				? `neg: ${answer_negative} (${answer_negative_percent}%)`
				: ''

			const answer_total_text = answer_count && answer_count > 0
				? `n: ${answer_count} ${label_of} ${answer_total} (${answer_count_percent}%)`
				: ''
			answer_text.push(answer_afirmative_text)
			answer_text.push(answer_negative_text)
			answer_text.push(answer_total_text)

			//answer_text_node
				const answer_text_node = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'text',
					inner_html 	: answer_text.join(' | ') ,
					parent 		: answer_node
				})




		// even manager model to use in other widgets_properties
		// this widget don't use it, because the info is not in the same section
		// than the components that changed our value
		// the user don't see the info and the input components at same time
		// self.events_tokens.push(
		// 	event_manager.subscribe('update_widget_value_'+i+'_'+self.id, fn_update_widget_value)
		// )
		// function fn_update_widget_value(changed_data) {

		// 	media_weight_value.innerHTML	= changed_data.find(item => item.id==='media_weight').value
		// 	max_weight_value.innerHTML		= changed_data.find(item => item.id==='max_weight').value
		// 	min_weight_value.innerHTML		= changed_data.find(item => item.id==='min_weight').value
		// 	total_weight_value.innerHTML	= changed_data.find(item => item.id==='total_elements_weights').value

		// 	media_diameter_value.innerHTML	= changed_data.find(item => item.id==='media_diameter').value
		// 	max_diameter_value.innerHTML	= changed_data.find(item => item.id==='max_diameter').value
		// 	min_diameter_value.innerHTML	= changed_data.find(item => item.id==='min_diameter').value
		// 	total_diameter_value.innerHTML	= changed_data.find(item => item.id==='total_elements_diameter').value

		// 	return true
		// }


	return li
}//end get_value_element



// @license-end
