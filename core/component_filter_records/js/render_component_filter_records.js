/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_filter_records = function() {

	return true
}//end render_component_filter_records



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_filter_records.prototype.list = function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data
		const value 	= data.value || []


	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : true
		})

	// Value as string
		const value_string = value.join(' | ')

	// Set value
		wrapper.textContent = value_string


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_filter_records.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	const value		= self.data.value || []
	const datalist 	= self.data.datalist || []

	// content_data
		const content_data = await render_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.classList.add("with_100")

	// events (delegated)
		add_events(self, wrapper)

	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			//console.log("-------------- - event update_value changed_data:", changed_data);
			// change the value of the current dom element
			// const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			// changed_node.value = changed_data.value.join(',')
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {

				const section_tipo 	= e.target.dataset.tipo
				const key   		= JSON.parse(e.target.dataset.key)
				const value 		= (e.target.value.length>0)
					? {
						tipo 	: e.target.dataset.tipo,
						value 	: validate_value(e.target.value.split(','))
					  }
					: null;
						console.log("value:",value, validate_value(e.target.value.split(',')));

				// search section tipo key if exists
				//const a = self.data.value.find((item) => { if(item.tipo===e.target.dataset.tipo) return item })
				const current_values = self.data.value || []
				const values_length	 = current_values.length
				let key_found 		 = values_length // default is last (length of arary)
				for (let i = 0; i < values_length; i++) {
					if(current_values[i].tipo===section_tipo) {
						key_found = i;
						break;
					}
				}
				// // safe number values
				// 	if (value.value && value.value.length>0) {
				// 		const safe_values  = []
				// 		const actual_value = value.value
				// 		for (let i = 0; i < actual_value.length; i++) {
				// 			const current_number = parseInt(actual_value[i])
				// 			if (!isNaN(current_number)) {
				// 				safe_values.push(current_number)
				// 			}
				// 		}
				// 		if (safe_values.length>0) {
				// 			value.value = safe_values
				// 		}
				// 	}

				return

				const changed_data = Object.freeze({
					action	: 'update',
					key		: key_found,
					value	: value
				})
				self.change_value({
					changed_data : changed_data,
					refresh 	 : false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					//event_manager.publish('update_value_'+self.id, changed_data)
				})

				return true
			}

		}, false)

	// click event [mousedown]
		wrapper.addEventListener("mousedown", e => {
			e.stopPropagation()

			// change_mode
				if (e.target.matches('.button.close')) {

					//change mode
					self.change_mode('list', false)

					return true
				}
		})

	// keyup event
		wrapper.addEventListener("keyup", async (e) => {
			e.stopPropagation()

			return true
		})


	return true
}//end add_events



/**
* RENDER_CONTENT_DATA
* @return dom object content_data
*/
const render_content_data = async function(self) {

	const value 			= self.data.value
	const datalist			= self.data.datalist
	const datalist_length 	= datalist.length
	const mode 				= self.mode

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

		// header
			const header_li = ui.create_dom_element({
				element_type	: 'li',
				class_name 		: 'header_li',
				parent 			: inputs_container
			})
			const header_tipo = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'tipo',
				text_content 	: get_label['tipo'] || 'Tipo',
				parent 			: header_li
			})
			const header_label = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'label',
				text_content 	: get_label['seccion'] || 'Section',
				parent 			: header_li
			})
			const header_value = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'value',
				text_content 	: get_label['valor'] || 'Value',
				parent 			: header_li
			})

		// render all items sequentially
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];

				// input
					get_input_element(i, datalist_item, inputs_container, self)
			}

		// realocate rendered dom items
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

	// buttons
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'buttons_container',
		// 	parent 			: fragment
		// })

		// // button close
		// if(mode==='edit_in_list'){
		// 	const button_close = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button close',
		// 		parent 			: buttons_container
		// 	})
		// }

		// // button edit
		// 	ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button edit',
		// 		parent 			: buttons_container
		// 	})

		// // button reset
		// 	ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button reset',
		// 		parent 			: buttons_container
		// 	})


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end render_content_data



/**
* VALIDATE_VALUE
* @param array value
*	Like [1,5,8]
*/
const validate_value = (value) => {

	const safe_values  = []

	if (value && value.length>0) {

		const actual_value = value // .split(',')
		for (let i = 0; i < actual_value.length; i++) {
			const current_number = parseInt(actual_value[i])
			if (!isNaN(current_number)) {
				safe_values.push(current_number)
			}
		}
		// if (safe_values.length>0) {
		// 	value = safe_values // .join(',')
		// }
	}

	return safe_values
}//end validate_value



/**
* get_input_element
* @return dom element li
*/
const get_input_element = (i, datalist_item, inputs_container, self) => {

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
			element_type	: 'li',
			parent 			: inputs_container
		})

	// tipo
		const option_tipo = ui.create_dom_element({
			element_type	: 'span',
			inner_html	 	: tipo,
			parent 			: li
		})

	// label
		const option_label = ui.create_dom_element({
			element_type	: 'span',
			inner_html	 	: label,
			parent 			: li
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
			dataset 	 	: { key : i, tipo : tipo },
			value 		 	: input_value_string,
			parent 		 	: li
		})
		//input.pattern = "[0-9]"
		//input.setAttribute("pattern", "[0-9,]{1,1000}")



	return li
}//end get_input_element

