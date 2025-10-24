// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_lang_behavior_check} from '../../common/js/render_common.js'
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
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
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
* @param string current_value
* @param object self Component instance
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

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
			value			: current_value,
			parent			: content_value
		})
		input.addEventListener('change', function() {

			// parsed_value
				const parsed_value = (input.value.length>0)
					? input.value
					: null

			// changed_data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: i,
					value	: parsed_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)

			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})//end event change
		// paste event
		const paste_handler = (e) => {
			// Trigger paste_tipo function to handle TLD 'ontology7' cases
			paste_tipo(e, self, input);
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
* PASTE_HANDLER
* Handle tipo paste when current component tipo is 'ontology7' (TLD).
* This is a special case useful for Ontology searches.
* It splits the pasted tipo like 'dd156' to 'dd' and '156' and
* fix the values into the corresponding inputs (TLD, section_id)
* @param e event
* @param object self - component instance
* @return void
*/
const paste_tipo = (e, self) => {

	// Only TLD input handle the paste value
	if (self.tipo!=='ontology7') {
		return
	}

	// Get pasted text from clipboard as dd1
	const pasted_text = e.clipboardData.getData('text');
	const match = pasted_text.match(/^([a-zA-Z_]+)(\d+)$/);
	if (match) {
		const [ , text, number ] = match;
		if (text && number) {
			// Find section_id "ontology2"
			const component_section_id = document.querySelector('.wrapper_component.ontology2')
			if (component_section_id) {
				const component_section_id_input = component_section_id.querySelector('input.input_value')
				if (component_section_id_input) {

					// Prevent duplicate values on paste
					e.preventDefault();

					const input = e.target

					// set new input values
					input.value = text
					component_section_id_input.value = number

					if(SHOW_DEBUG===true) {
						console.log('debug paste_tipo set text:', text, 'number:', number);
					}

					// Trigger change event in both inputs to save it in search preset
					input.dispatchEvent(new Event('change', { bubbles: true }));
					component_section_id_input.dispatchEvent(new Event('change', { bubbles: true }));

					component_section_id_input.focus()
				}
			}
		}
	}
}//end paste_handler



// @license-end
