// import
	import {ui} from '../../common/js/ui.js'
	import {common} from '../../common/js/common.js'


/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_inverse = function(component) {

	this.component 			= component
	this.context 			= component.context
	this.data 				= component.data

	this.tipo 				= component.tipo
	this.section_tipo		= component.section_tipo
	this.section_id			= component.section_id
	this.mode 				= component.mode
	this.lang 				= component.lang
	this.section_lang 		= component.section_lang
	this.model 				= component.model
	this.id 				= component.id

	return true
}//end render_component_inverse



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_inverse.prototype.list = function(options) {

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data

	// Value as string
		const value_string = data.value[0].locator.from_section_id

	// Node create
		const node = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_inverse.prototype.edit = function() {

	const self = this

	const value = self.data.value

	// content_data
		const content_data = document.createElement("div")

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

	// build values
		const inputs_value = value
		const value_length = inputs_value.length

		for (let i = 0; i < value_length; i++) {
			input_element(i, inputs_value[i], inputs_container, self)
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	return wrapper	
	
}//end edit


/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// span field section_id from related inverse section
		const span_section_id = ui.create_dom_element({
			element_type 	: 'span',
			class_name 		: 'inverse_show_section_id',
			dataset 	 	: { key : i },
			text_node	 	: current_value.locator.from_section_id,
			parent 		 	: li
		})

	// build span fields with other values from related inverse section
		const span_datalist_length 	= current_value.datalist.length

		for (let j = 0; j < span_datalist_length; j++) {
			
			const span_value = ui.create_dom_element({
				element_type 	: 'span',
				class_name 		: 'inverse_show_values',
				text_node	 	: current_value.datalist[j].label.concat(': ', current_value.datalist[j].value),
				parent 		 	: li
			})

		}		

	return li
}//end input_element