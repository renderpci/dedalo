// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_search_component_text_area = function() {

	return true
}//end render_search_component_text_area



/**
* SEARCH
* Render node for use in current mode
* @return HTMLElement wrapper
*/
render_search_component_text_area.prototype.search = async function(options) {

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

	// add events
		add_events(self, wrapper)

	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
	wrapper.addEventListener('change', (e) => {

		// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"].input_value')) {

				// input. Get the input node that has changed
					const input = e.target

				// parsed_value
					const parsed_value = (input.value.length>0) ? input.value : null

				// changed_data
					const changed_data_item = Object.freeze({
						action	: 'update',
						key		: JSON.parse(input.dataset.key),
						value	: parsed_value
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

				return true
			}
	})


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value // .length>0 ? value : ['']
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i]

			// input field
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'input_value',
					dataset			: { key : i },
					value			: current_value,
					parent			: content_data
				})
		}

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
				parent			: content_data
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




	return content_data
}//end get_content_data



// @license-end
