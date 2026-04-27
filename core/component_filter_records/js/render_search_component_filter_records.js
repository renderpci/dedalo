// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_FILTER_RECORDS
* Manage the components logic and appearance in client side
*/
export const render_search_component_filter_records = function() {

	return true
}//end render_search_component_filter_records



/**
* SEARCH
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_search_component_filter_records.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	// events (delegated)
		add_events(self, wrapper)

	return wrapper
}//end search



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		// self.events_tokens.push(
		// )
		// function update_value (changed_data) {
		// 	//console.log("-------------- - event update_value changed_data:", changed_data);
		// 	// change the value of the current dom element
		// 	// const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
		// 	//changed_node.value = changed_data.value.join(',')
		// }

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', async (e) => {
			// e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {

				// common change handler
					self.change_handler({
						value	: e.target.value,
						tipo	: e.target.dataset.tipo
					})

				return true
			}
		})


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return dom object content_data
*/
const get_content_data = function(self) {

	const entries			= self.data.entries
	const datalist			= self.data.datalist
	const datalist_length	= datalist.length
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		// inputs. render all items sequentially
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];

				// input
					const input_element = get_input_element(i, datalist_item, self)
					inputs_container.appendChild(input_element)
			}

		// relocate rendered dom items
			const nodes_lenght = inputs_container.childNodes.length
			// iterate in reverse order to avoid problems on move nodes
			for (let i = nodes_lenght - 1; i >= 0; i--) {

				const item = inputs_container.childNodes[i]
				if (item.dataset.parent) {
					//const parent_id = datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id
					const current_parent = inputs_container.querySelector("[data-id='"+item.dataset.parent+"']")
					if (current_parent) {
						current_parent.appendChild(item)
					}
				}
			}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* @return HTMLElement li
*/
const get_input_element = (i, datalist_item, self) => {

	const datalist_value 	 = datalist_item.value
	const label 		 	 = datalist_item.label
	const tipo	 		 	 = datalist_item.tipo

	// value
	const entries  		 	= self.data.entries || []
	const entries_length   	 = entries.length
	const item 		  	 	= entries.find(item => item.tipo===tipo)
	const input_value_string = typeof item!=="undefined" ? item.value.join(',') : ''

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// tipo
		const option_tipo = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'tipo',
			inner_html		: tipo,
			parent			: li
		})

	// label
		const option_label = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'label',
			inner_html		: label,
			parent			: li
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			dataset			: { key : i, tipo : tipo },
			value			: input_value_string,
			placeholder		: "Comma separated id like 1,2,3",
			parent			: li
		})
		//input.pattern = "[0-9]"
		//input.setAttribute("pattern", "[0-9,]{1,1000}")


	return li
}//end get_input_element



// @license-end
