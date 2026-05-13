// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_lang_behavior_check} from '../../common/js/render_common.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_search_component_input_text = function() {

	return true
}//end render_search_component_input_text



/**
* SEARCH
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
*/
render_search_component_input_text.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= entries.length>0 ? entries : [{value : ''}]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// if the value is not a object, create a object with the value
			// This happen when the value is from a preset saved as q value
			const data_item = typeof inputs_value[i] === 'object'
				? inputs_value[i]
				: {value : inputs_value[i]}

			const input_element_node = get_content_value(i, data_item, self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render component's content value node
* @param int i Array key of current value from data
* @param object data_item
* @param object self Component instance
* @return HTMLElement content_value
*/
const get_content_value = (i, data_item, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: data_item.value || '',
			parent			: content_value
		})
		// change event
		const change_handler = (e) => {

			// ontology7 split: if user typed a combined value like 'rsc170',
			// split it into TLD ('rsc') and section_id ('170') across the two inputs
			if (self.tipo==='ontology7') {
				const split_done = split_tipo_to_fields(input.value, input, self)
				if (split_done) {
					// split_tipo_to_fields already dispatched change events on both inputs
					return
				}
			}

			const data_item_to_save = clone(data_item)

			// parsed_value
			data_item_to_save.value = (input.value.length>0)
				? input.value
				: null

			// q_operator. Special cases of search_q_operator_default. Set q_operator to the default value
			if(self.search_q_operator_default.has(self.tipo)) {
				self.data.q_operator = data_item_to_save.value
					? self.search_q_operator_default.get(self.tipo)
					: null
			}

			// changed_data
			const changed_data_item = Object.freeze({
				action	: (data_item_to_save.value === null) ? 'remove' : 'update',
				id		: (self.data?.entries?.[i]?.id) || null,
				key		: i,
				value	: (data_item_to_save.value === null) ? null : data_item_to_save
			})

			// update the instance data (previous to save)
			self.update_data_value(changed_data_item)

			// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)
		}
		input.addEventListener('change', change_handler)

		// paste event
		const paste_handler = (e) => {
			paste_tipo(e, self)
		}
		input.addEventListener('paste', paste_handler)

	// set the lang option checkbox when the component is translatable.
	// It can change the language search behavior.
	// lang option allow to set if the component will search in all langs or in current data lang.
	// the default is search is set with all langs, checkbox in true.
	// if the `q_lang has set with a language (instead 'all' or null),
	// the search will be selective, only with the current data lang.
	// 'all' and null values meaning the the search will be in all languages. see: class.search.php->get_sql_where()
	if(self.context.translatable){
		// render_lang_behavior_check from render_common
		const lang_behavior_check = render_lang_behavior_check(self)
		content_value.appendChild(lang_behavior_check)
	}//end if(self.context.translatable)


	return content_value
}//end get_content_value



/**
* SPLIT_TIPO_TO_FIELDS
* Splits a combined tipo value like 'rsc170' into TLD ('rsc') and section_id ('170'),
* then sets each part into the corresponding input within the same search_group.
* Used by both paste_tipo and change_handler when the component tipo is 'ontology7'.
* @param string value - The combined value to split (e.g. 'rsc170')
* @param HTMLElement input - The current input element (ontology7)
* @param object self - Component instance
* @return bool - true if split was performed, false otherwise
*/
const split_tipo_to_fields = (value, input, self) => {

	// Only TLD input handles the split
	if (self.tipo!=='ontology7') {
		return false
	}

	// Match pattern like 'rsc170' → text='rsc', number='170'
	const match = value.match(/^([a-zA-Z_]+)(\d+)$/)
	if (!match) {
		return false
	}

	const [ , text, number ] = match
	if (!text || !number) {
		return false
	}

	// Find ontology2 input scoped to the same search_group
	const search_group = input.closest('.search_group')
	if (!search_group) {
		return false
	}

	const ontology2_input = search_group.querySelector('.wrapper_component.ontology2 input.input_value')
	if (!ontology2_input) {
		return false
	}

	// set new input values
	input.value			= text
	ontology2_input.value	= number

	if(SHOW_DEBUG===true) {
		console.log('debug split_tipo_to_fields set text:', text, 'number:', number);
	}

	// Trigger change event in both inputs to update instance data and search preset
	input.dispatchEvent(new Event('change', { bubbles: true }))
	ontology2_input.dispatchEvent(new Event('change', { bubbles: true }))

	// Move focus to section_id input for natural flow
	ontology2_input.focus()

	return true
}//end split_tipo_to_fields



/**
* PASTE_TIPO
* Handle tipo paste when current component tipo is 'ontology7' (TLD).
* This is a special case useful for Ontology searches.
* It splits the pasted tipo like 'dd156' to 'dd' and '156' and
* fixes the values into the corresponding inputs (TLD, section_id)
* @param e event
* @param object self - component instance
* @return void
*/
const paste_tipo = (e, self) => {

	// Only TLD input handle the paste value
	if (self.tipo!=='ontology7') {
		return
	}

	// Get pasted text from clipboard
	const pasted_text = e.clipboardData.getData('text')

	// Prevent the default paste — split_tipo_to_fields will set both inputs
	const match = pasted_text.match(/^([a-zA-Z_]+)(\d+)$/)
	if (match) {
		e.preventDefault()
		const input = e.target
		// Set the input value first so split_tipo_to_fields can read it
		input.value = pasted_text
		split_tipo_to_fields(pasted_text, input, self)
	}
}//end paste_tipo



// @license-end
