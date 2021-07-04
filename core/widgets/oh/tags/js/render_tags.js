/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_WEIGHTS
* Manages the component's logic and apperance in client side
*/
export const render_tags= function() {

	return true
}//end render_tags



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_tags.prototype.edit = async function(options) {

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

render_tags.prototype.list = render_tags.prototype.edit

/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
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
* @return DOM node li
*/
const get_value_element = (i, data, values_container, self) => {

	// li, for every ipo will create a li node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class 			: 'get_archive_weights',
			parent 			: values_container
		})

	// total_tc
		const total_tc = ui.create_dom_element({
			element_type 	: 'div',
			class 			: 'total_tc',
			parent 			: li
		})
			//total_tc
				// label
					const total_tc_label = ui.create_dom_element({
						element_type 	: 'span',
						class_name		: 'label',
						inner_html 		: 'TC :',
						parent 			: total_tc
					})

				// value
					const total_tc_value = ui.create_dom_element({
						element_type 	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_tc').value,
						parent 			: total_tc
					})


	// ar_tc_wrong
		const ar_tc_wrong = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'ar_tc_wrong',
			parent 			: li
		})
			//ar_tc_wrong
				// label
					const ar_tc_wrong_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: get_label.etiqueta_revisar,
						parent 			: ar_tc_wrong
					})

				// value
					const ar_tc_wrong_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'ar_tc_wrong').value,
						parent 			: ar_tc_wrong
					})

	// total_index
		const total_index = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_index',
			parent 			: li
		})
			//total_index
				// label
					const total_index_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'INDEX :',
						parent 			: total_index
					})

				// value
					const total_index_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_index').value,
						parent 			: total_index
					})

	// total_missing_tags
		const total_missing_tags = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_missing_tags',
			parent 			: li
		})
			//total_missing_tags
				// label
					const total_missing_tags_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: get_label.etiquetas_borradas,
						parent 			: total_missing_tags
					})

				// value
					const total_missing_tags_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_missing_tags').value,
						parent 			: total_missing_tags
					})

	// total_to_review_tags
		const total_to_review_tags = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_to_review_tags',
			parent 			: li
		})
			//total_to_review_tags
				// label
					const total_to_review_tags_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: get_label.etiqueta_revisar,
						parent 			: total_to_review_tags
					})

				// value
					const total_to_review_tags_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_to_review_tags').value,
						parent 			: total_to_review_tags
					})

	// total_private_notes
		const total_private_notes = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_private_notes',
			parent 			: li
		})
			//total_private_notes
				// label
					const total_private_notes_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'Work NOTES :',
						parent 			: total_private_notes
					})

				// value
					const total_private_notes_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_private_notes').value,
						parent 			: total_private_notes
					})

	// total_public_notes
		const total_public_notes = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_public_notes',
			parent 			: li
		})
			//total_public_notes
				// label
					const total_public_notes_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'Public NOTES :',
						parent 			: total_public_notes
					})

				// value
					const total_public_notes_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_public_notes').value,
						parent 			: total_public_notes
					})


	// total_chars
		const total_chars = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_chars',
			parent 			: li
		})
			//total_chars
				// label
					const total_chars_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'CHARS :',
						parent 			: total_chars
					})

				// value
					const total_chars_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_chars').value,
						parent 			: total_chars
					})


	// total_chars_no_spaces
		const total_chars_no_spaces = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_chars_no_spaces',
			parent 			: li
		})
			//total_chars_no_spaces
				// label
					const total_chars_no_spaces_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'NO SPACES:',
						parent 			: total_chars_no_spaces
					})

				// value
					const total_chars_no_spaces_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_chars_no_spaces').value,
						parent 			: total_chars_no_spaces
					})


	// total_real_chars
		const total_real_chars = ui.create_dom_element({
			element_type	: 'div',
			class 			: 'total_real_chars',
			parent 			: li
		})
			//total_real_chars
				// label
					const total_real_chars_label = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html 		: 'CHARS REAL:',
						parent 			: total_real_chars
					})

				// value
					const total_real_chars_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: data.find(item => item.id === 'total_real_chars').value,
						parent 			: total_real_chars
					})

		// update the values when the observable was changed
		event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) =>{
	
				total_tc_value.innerHTML				= changed_data.find(item => item.id === 'total_tc').value
				ar_tc_wrong_value.innerHTML				= changed_data.find(item => item.id === 'ar_tc_wrong').value
				total_index_value.innerHTML				= changed_data.find(item => item.id === 'total_index').value
				total_missing_tags_value.innerHTML		= changed_data.find(item => item.id === 'total_missing_tags').value
				total_to_review_tags_value.innerHTML	= changed_data.find(item => item.id === 'total_to_review_tags').value
				total_private_notes_value.innerHTML		= changed_data.find(item => item.id === 'total_private_notes').value
				total_public_notes_value.innerHTML		= changed_data.find(item => item.id === 'total_public_notes').value
				total_chars_value.innerHTML				= changed_data.find(item => item.id === 'total_chars').value
				total_chars_no_spaces_value.innerHTML	= changed_data.find(item => item.id === 'total_chars_no_spaces').value
				total_real_chars_value.innerHTML		= changed_data.find(item => item.id === 'total_real_chars').value
					
		})


	return li
}//end get_value_element
