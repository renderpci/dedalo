// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
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


	// set the lang option checkbox when the component is translatable.
	// It can change the language search behavior.
	// lang option allow to set if the component will search in all langs or in current data lang.
	// the default is search is set with all langs, checkbox in true.
	// if the `q_lang has set with a language (instead 'all' or null),
	// the search will be selective, only with the current data lang.
	// 'all' and null values meaning the the search will be in all languages. see: class.search.php->get_sql_where()
	if(self.context.translatable){
		// sqo saves the q_lang as all or not set
		// 'all' and null set the checkbox as true
		const q_lang_state = self.data.q_lang===null || self.data.q_lang==='all'
			? true
			: false

		// div_switcher
		// by default the checkbox is set as true (without the class name off)
		const div_switcher = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'switcher_translatable text_unselectable',
			parent			: content_value
		})
		// translatable option
			const lang_behavior_check = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'lang_behavior_check',
				parent			: div_switcher
			})
			// set the checkbox state
			lang_behavior_check.checked = q_lang_state
			if(!q_lang_state){
				div_switcher.classList.add("off")
			}

			const change_handler = function(){
				if(lang_behavior_check.checked){
					div_switcher.classList.remove("off")

					// q_lang. Fix the data in the instance previous to save
					self.data.q_lang = null //all languages
					// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)


				}else{
					div_switcher.classList.add("off")

					// q_lang. Fix the data in the instance previous to save
					self.data.q_lang = self.data.lang // search only in the current data lang
					// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)
				}
			}
			lang_behavior_check.addEventListener('change',change_handler)
	}// end if


	return content_value
}//end get_content_value



// @license-end
