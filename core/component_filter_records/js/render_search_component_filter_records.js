/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
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
* @return DOM node wrapper
*/
render_search_component_filter_records.prototype.search = async function() {

	const self = this

	// content data
		const content_data = get_content_data(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

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

				const section_tipo	= e.target.dataset.tipo
				const key			= JSON.parse(e.target.dataset.key)
				const value			= (e.target.value.length>0)
					? {
						tipo		: e.target.dataset.tipo,
						// value	: self.validate_value(e.target.value.split(','))
						value		: e.target.value.split(',')
					  }
					: null;

				// key_found. search section tipo key if exists. Remember: data array keys are different that inputs keys
					const current_values	= self.data.value || []
					const values_length		= current_values.length
					let key_found			= values_length // default is last (length of array)
					for (let i = 0; i < values_length; i++) {
						if(current_values[i].tipo===section_tipo) {
							key_found = i;
							break;
						}
					}

				const changed_data = Object.freeze({
					action	: (value===null) ? 'remove' : 'update',
					key		: key_found,
					value	: value
				})

				// update the instance data (previous to save)
					self.update_data_value(changed_data)
				// set data.changed_data. The change_data to the instance
					self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

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

	const value				= self.data.value
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

		// header
			const header_li = ui.create_dom_element({
				element_type	: 'li',
				class_name		: 'header_li',
				parent			: inputs_container
			})
			const header_tipo = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'tipo',
				inner_html		: get_label.tipo || 'Tipo',
				parent			: header_li
			})
			const header_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: get_label.seccion || 'Section',
				parent			: header_li
			})
			const header_value = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: get_label.valor || 'Value',
				parent			: header_li
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
* @return DOM node li
*/
const get_input_element = (i, datalist_item, self) => {

	const datalist_value 	 = datalist_item.value
	const label 		 	 = datalist_item.label
	const tipo	 		 	 = datalist_item.tipo

	// value
	const value  		 	 = self.data.value || []
	const value_length   	 = value.length
	const item 		  	 	 = value.find(item => item.tipo===tipo)
	const input_value_string = typeof item!=="undefined" ? item.value.join(',') : ''

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// tipo
		const option_tipo = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: tipo,
			parent			: li
		})

	// label
		const option_label = ui.create_dom_element({
			element_type	: 'span',
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


