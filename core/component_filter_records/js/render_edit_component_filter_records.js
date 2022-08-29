/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {array_equals} from '../../common/js/utils/index.js'



/**
* render_edit_component_filter_records
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter_records = function() {

	return true
}//end render_edit_component_filter_records



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_filter_records.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// wrapper.classList.add("with_100")
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const datalist			= self.data.datalist
		const datalist_length	= datalist.length

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")

		// header_row
			const header_row = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header_row',
				parent			: content_data
			})
			// header_tipo
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label_item tipo',
				inner_html		: get_label.tipo || 'Tipo',
				parent			: header_row
			})
			// header_label
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label_item label',
				inner_html		: get_label.seccion || 'Section',
				parent			: header_row
			})
			// header_value
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label_item value',
				inner_html		: get_label.valor || 'Value',
				parent			: header_row
			})

		// content_value items
			// render all items sequentially
			for (let i = 0; i < datalist_length; i++) {
				// input
				const content_value = get_content_value(i, datalist[i], self)
				content_data.appendChild(content_value)
				// set pointer
				content_data[i] = content_value
			}

		// realocate rendered dom items
			// const nodes_lenght = inputs_container.childNodes.length
			// // iterate in reverse order to avoid problems on move nodes
			// for (let i = nodes_lenght - 1; i >= 0; i--) {

			// 	const item = inputs_container.childNodes[i]
			// 	if (item.dataset.parent) {
			// 		//const parent_id = datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id
			// 		const current_parent = inputs_container.querySelector("[data-id='"+item.dataset.parent+"']")
			// 		if (current_parent) {
			// 			current_parent.appendChild(item)
			// 		}
			// 	}
			// }


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value array current key
* @param object datalist_item
* {
* 	label		: "label",
* 	tipo		: "rsc23",
*	permissions	: 2
* }
* @return DOM node li
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// tipo
		const tipo	= datalist_item.tipo
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_item section_tipo',
			inner_html		: tipo,
			parent			: content_value
		})

	// label
		const label	= datalist_item.label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'body_item',
			inner_html		: label,
			parent			: content_value
		})

	// input field
		const item					= value.find(item => item.tipo===tipo)
		const input_value_string	= typeof item!=="undefined" ? item.value.join(',') : ''
		const input_node			= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'body_item input_value',
			value			: input_value_string,
			placeholder		: 'Comma separated id like 1,2,3',
			parent			: content_value
		})
		// change event
			input_node.addEventListener('change', function() {

				const section_tipo	= datalist_item.tipo
				const value			= this.value.length>0
					? {
						tipo 	: datalist_item.tipo,
						value 	: self.validate_value(this.value.split(','))
					  }
					: null;

				// key_found. search section tipo key if exists. Remember: data array keys are different that inputs keys
					const current_values	= self.data.value || []
					const values_length		= current_values.length
					let key_found			= values_length // default is last (length of array)
					for (let j = 0; j < values_length; j++) {
						if(current_values[j].tipo===section_tipo) {
							key_found = j;
							break;
						}
					}

				// change_value
					const changed_data = Object.freeze({
						action	: (value===null) ? 'remove' : 'update',
						key		: key_found,
						value	: value
					})
					self.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
					.then(()=>{
						// update safe value in input text
						if (value) {
							input_node.value = value.value.join(",")
						}
					})
			})//end change
		// keyup event
			input_node.addEventListener('keyup', function(e) {
				// page unload event
					// if (e.key!=='Enter') {
					// 	const value_key			= value.findIndex(el => el.tipo===datalist_item.tipo);
					// 	const original_value	= self.db_data.value[value_key]
					// 	const new_value			= this.value.length>0
					// 		? {
					// 			tipo 	: datalist_item.tipo,
					// 			value 	: self.validate_value(this.value.split(','))
					// 		  }
					// 		: null;

					// 	const is_equal = original_value && original_value.value && new_value && new_value.value
					// 		? array_equals(original_value.value, new_value.value)
					// 		: false
					// 	// set_before_unload (bool)
					// 	set_before_unload(!is_equal)
					// }

				// Enter key force to save changes
					if (e.key==='Enter') {
						// force to save current input if changed
						if (self.data.changed_data.length>0) {
							// change_value (save data)
							self.change_value({
								changed_data	: self.data.changed_data,
								refresh			: false
							})
						}
						return false
					}
				// change data
					const changed_data = Object.freeze({
						action	: 'update',
						key		: i,
						value	: (this.value.length>0) ? this.value : null
					})

				// fix instance changed_data
					self.set_changed_data(changed_data)
			})//end keyup


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
