// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_SUM_DATES
* Manages the component's logic and appearance in client side
*/
export const render_sum_dates = function() {

	return true
}//end render_sum_dates



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_sum_dates.prototype.edit = async function(options) {

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
			class_name		: 'widget_item sum_dates',
			parent			: values_container
		})

	const sum_intervals				= data.find(item => item.id === 'sum_intervals').value || {}
	const sum_estitmated_time_add	= data.find(item => item.id === 'sum_estitmated_time_add').value || null
	const estitmated_time_undefined	= data.find(item => item.id === 'estitmated_time_undefined').value || null

	// get the text of the sum_interval
	const ar_sum_intervals =[]

		if( sum_intervals.y > 0 ){
			const year_label = (sum_intervals.y > 1)
				? get_label.years
				: get_label.year
			const year_text = `${sum_intervals.y} ${year_label}`
			ar_sum_intervals.push(year_text)
		}
		if( sum_intervals.m > 0 ){
			const month_label = (sum_intervals.m > 1)
				? get_label.months
				: get_label.month
			const month_text = `${sum_intervals.m} ${month_label}`
			ar_sum_intervals.push(month_text)
		}
		if( sum_intervals.d > 0){
			const day_label = (sum_intervals.d > 1)
				? get_label.days
				: get_label.day
			const day_text = `${sum_intervals.d} ${day_label}`
			ar_sum_intervals.push(day_text)
		}

	// get the text of the sum_estitmated_time_add
	const ar_sum_estitmated_time_add =[]

		if( sum_estitmated_time_add.y > 0 ){
			const estimated_year_label = (sum_estitmated_time_add.y > 1)
				? get_label.years
				: get_label.year
			const estimated_year_text = `${sum_estitmated_time_add.y} ${estimated_year_label}`
			ar_sum_estitmated_time_add.push(estimated_year_text)
		}
		if( sum_estitmated_time_add.m > 0 ){
			const estimated_month_label = (sum_estitmated_time_add.m > 1)
				? get_label.months
				: get_label.month
			const estimated_month_text = `${sum_estitmated_time_add.m} ${estimated_month_label}`
			ar_sum_estitmated_time_add.push(estimated_month_text)
		}
		if( sum_estitmated_time_add.d > 0 ){
			const estimated_day_label = (sum_estitmated_time_add.d > 1)
				? get_label.days
				: get_label.day
			const estimated_day_text = `${sum_estitmated_time_add.d} ${estimated_day_label}`
			ar_sum_estitmated_time_add.push(estimated_day_text)
		}

	//ar_sum_intervals
		const sum_intervals_node = ui.create_dom_element({
			element_type: 'div',
			class_name	: 'sum_intervals',
			inner_html	: ar_sum_intervals.join(' '),
			parent 		: li
		})

		if( ar_sum_estitmated_time_add.length > 0 || estitmated_time_undefined === true){

			const ar_indeterminate = ['( Temps estimat afegit:'];

			if( ar_sum_estitmated_time_add.length  > 0 ){
				 ar_indeterminate.push( ar_sum_estitmated_time_add.join(' ') )
			}
			if( estitmated_time_undefined === true ){

				if( ar_sum_estitmated_time_add.length  > 0 ){
					  ar_indeterminate.push( ' + ' )
				}
				 ar_indeterminate.push( 'indeterminat' )
			}

			 ar_indeterminate.push( ')' )

			const sum_estitmated_time_add_node = ui.create_dom_element({
				element_type: 'span',
				class_name	: 'sum_dates_period_notes',
				inner_html	: ar_indeterminate.join(' '),
				parent 		: li
			})

		}



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
