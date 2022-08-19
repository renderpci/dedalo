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
}//end render_search_component_filter



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

	return wrapper
}//end search


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
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})
		input_q_operator.addEventListener('change',function () {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

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
}//end get_content_data



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
			inner_html		: datalist_item.label,
			parent			: grouper
		})

	return grouper
}//end get_grouper_element



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const datalist_value	= datalist_item.value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

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
			parent			: li
		})
		input.addEventListener('change',function() {

			const action		= (input.checked===true) ? 'insert' : 'remove'
			const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			const changed_value	= (action==='insert') ? datalist_value : null

			const changed_data = Object.freeze({
				action	: action,
				key		: changed_key,
				value	: changed_value
			})

			// update the instance data (previous to save)
				self.update_data_value(changed_data)
			// set data.changed_data. The change_data to the instance
				self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
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
}//end get_input_element

