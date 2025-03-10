// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_WEIGHTS
* Manages the component's logic and appearance in client side
*/
export const render_get_archive_weights = function() {

	return true
}//end render_get_archive_weights



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_get_archive_weights.prototype.edit = async function(options) {

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

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item get_archive_weights',
			parent			: values_container
		})

	//weights
		const archive_weights = ui.create_dom_element({
			element_type: 'div',
			class_name	: 'archive_weights',
			parent 		: li
		})

		// general
		const sum_weights = ui.create_dom_element({
			element_type: 'div',
			class_name	: 'sum_weights',
			parent 		: archive_weights
		})
			//media_weight
				// label
					const media_weight_label = ui.create_dom_element({
						element_type: 'span',
						class_name	: 'label',
						inner_html 	: get_label.weight + ': ' ,
						parent 		: sum_weights
					})

				// value
					const media_weight_value = ui.create_dom_element({
						element_type: 'span',
						class_name	: 'value',
						inner_html 	: data.find(item => item.id === 'media_weight').value,
						parent 		: sum_weights
					})

		// detail
		const weights_values = ui.create_dom_element({
			element_type: 'span',
			class_name	: 'weights_values',
			parent 		: archive_weights
		})
			//max_weight
				// label
				const max_weight_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label_range',
					inner_html 	: 'max: ',
					parent 		: weights_values
				})

				// value
				const max_weight_value = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'value',
					inner_html 	: data.find(item => item.id === 'max_weight').value,
					parent 		: weights_values
				})

			// min_weight
				// label
				const min_weight_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label_range',
					inner_html 	: ' | min: ',
					parent 		: weights_values
				})

				// value
				const min_weight_value = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'value',
					inner_html 	: data.find(item => item.id === 'min_weight').value,
					parent 		: weights_values
				})

			// total_elements_weights
				// label
				const total_weight_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label',
					inner_html 	: ' | n: ',
					parent 		: weights_values
				})

				// value
				const total_weight_value = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'value',
					inner_html 	: data.find(item => item.id === 'total_elements_weights').value,
					parent 		: weights_values
				})


	//Diameter
		// general
		const archive_diameter = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'archive_diameter',
			parent			: li
		})

		const sum_diameter = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'sum_diameter',
			parent			: archive_diameter
		})
		// media_diameter
			// label
				const media_diameter_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label',
					inner_html 	: get_label.diameter + ': ' ,
					parent 		: sum_diameter
				})

			// value
				const media_diameter_value = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'value',
					inner_html 	: data.find(item => item.id === 'media_diameter').value,
					parent 		: sum_diameter
				})
		// detail
		const diameter_values = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'diameter_values',
			parent			: archive_diameter
		})
			// max_diameter
				// label
				const max_diameter_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label_range',
					inner_html 	: 'max: ',
					parent 		: diameter_values
				})

				// value
				const max_diameter_value = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'value',
					inner_html 	: data.find(item => item.id === 'max_diameter').value,
					parent 		: diameter_values
				})

			// min_diameter
				// label
				const min_diameter_label = ui.create_dom_element({
					element_type: 'span',
					class_name	: 'label_range',
					inner_html 	: ' | min: ',
					parent 		: diameter_values
				})

				// value
				const min_diameter_value = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value',
					inner_html		: data.find(item => item.id === 'min_diameter').value,
					parent			: diameter_values
				})


			//total_elements_diameter
				// label
				const total_diameter_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'label',
					inner_html		: ' | n: ',
					parent			: diameter_values
				})

				// value
				const total_diameter_value = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value',
					inner_html		: data.find(item => item.id === 'total_elements_diameter').value,
					parent			: diameter_values
				})


		// even manager model to use in other widgets_properties
		// this widget don't use it, because the info is not in the same section
		// than the components that changed our value
		// the user don't see the info and the input components at same time
		self.events_tokens.push(
			event_manager.subscribe('update_widget_value_'+i+'_'+self.id, fn_update_widget_value)
		)
		function fn_update_widget_value(changed_data) {

			media_weight_value.innerHTML	= changed_data.find(item => item.id==='media_weight').value
			max_weight_value.innerHTML		= changed_data.find(item => item.id==='max_weight').value
			min_weight_value.innerHTML		= changed_data.find(item => item.id==='min_weight').value
			total_weight_value.innerHTML	= changed_data.find(item => item.id==='total_elements_weights').value

			media_diameter_value.innerHTML	= changed_data.find(item => item.id==='media_diameter').value
			max_diameter_value.innerHTML	= changed_data.find(item => item.id==='max_diameter').value
			min_diameter_value.innerHTML	= changed_data.find(item => item.id==='min_diameter').value
			total_diameter_value.innerHTML	= changed_data.find(item => item.id==='total_elements_diameter').value

			return true
		}


	return li
}//end get_value_element



// @license-end
