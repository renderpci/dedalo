/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_FILTER
* Manage the components logic and appearance in client side
*/
export const render_search_component_filter = function() {

	return true
};//end render_search_component_filter



/**
* SEARCH
* Render node for use in search
* @return DOM node
*/
render_search_component_filter.prototype.search = async function() {

	const self = this

	// content_data
		const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// events (delegated)
		add_events(self, wrapper)

	return wrapper
};//end search



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// // update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
	// 	self.events_tokens.push(
	// 		event_manager.subscribe('update_value_'+self.id, update_value)
	// 	)
	// 	function update_value (component) {
	// 		// change the value of the current dom element
	// 		const changed_data = component.data.changed_data
	// 		const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
	// 		changed_node.checked = (changed_data.value === null) ? false : true
	// 	}

	// // add button element, subscription to the events
	// 	self.events_tokens.push(
	// 		event_manager.subscribe('edit_element_'+self.id, edit_element)
	// 	)
	// 	function edit_element(component) {
	// 		// change the value of the current dom element
	// 		//const changed_data = component.data.changed_data
	// 		//const inputs_container = wrapper.querySelector('.inputs_container')
	// 		//get_input_element(changed_data.key, changed_data.value, inputs_container)
	// 	}

	// // remove button element, subscription to the events
	// 	self.events_tokens.push(
	// 		event_manager.subscribe('reset_element_'+self.id, reset_element)
	// 	)
	// 	async function reset_element(instance) {
	// 		// change all elements inside of content_data
	// 		const new_content_data = await get_content_data(instance)
	// 		// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
	// 		wrapper.childNodes[1].replaceWith(new_content_data)
	// 	}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {

			// update / remove
				if (e.target.matches('input[type="checkbox"]')) {

					const action		= (e.target.checked===true) ? 'insert' : 'remove'
					const parsed_value	= JSON.parse(e.target.value)
					const changed_key	= self.get_changed_key(action, parsed_value)
					const changed_value	= (action==='insert') ? parsed_value : null

					const changed_data = Object.freeze({
						action	: action,
						key		: changed_key,
						value	: changed_value,
					})

					// update the instance data (previous to save)
						self.update_data_value(changed_data)
					// set data.changed_data. The change_data to the instance
						self.data.changed_data = changed_data
					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					return true
				}

			// q_operator. get the input value of the q_operator
				// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
				// like; radio_button, check_box, date, autocomplete, etc
				if (e.target.matches('input[type="text"].q_operator')) {

					// input. Get the input node that has changed
						const input = e.target
					// value
						const value = (input.value.length>0) ? input.value : null
					// q_operator. Fix the data in the instance previous to save
						self.data.q_operator = value
					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					return true
				}
		})


	return true
};//end add_events



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

	// q operator (search only)
		// const q_operator = self.data.q_operator
		// const input_q_operator = ui.create_dom_element({
		// 	element_type	: 'input',
		// 	type			: 'text',
		// 	value			: q_operator,
		// 	class_name		: 'q_operator',
		// 	parent			: fragment
		// })

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		// render all items sequentially
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];
				if (datalist_item.type==='typology') {
					// grouper
					const grouper_element = get_grouper_element(i, datalist_item, self)
					inputs_container.appendChild(grouper_element)

				}else{
					// input
					const input_element = get_input_element(i, datalist_item, self)
					inputs_container.appendChild(input_element)
				}
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
};//end get_content_data



/**
* GET_GROUPER_ELEMENT
*	Typology element
* @return dom element li
*/
const get_grouper_element = (i, datalist_item, self) => {

	// grouper
		const grouper = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'grouper',
			data_set		: {
				id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
				parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
			}
		})

	// label
		const grouper_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grouper_label',
			text_content	: datalist_item.label,
			parent			: grouper
		})

	return grouper
};//end get_grouper_element



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value  		 = self.data.value || []
	const value_length   = value.length
	const datalist_item  = current_value
	const datalist_value = datalist_item.value
	const label 		 = datalist_item.label
	const section_id	 = datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			data_set		: {
				id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
				parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
			}
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: input_id,
			dataset			: { key : i },
			value			: JSON.stringify(datalist_value),
			parent			: li
		})
		// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}

	// label
		const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		option_label.setAttribute("for", input_id)


	return li
};//end get_input_element


