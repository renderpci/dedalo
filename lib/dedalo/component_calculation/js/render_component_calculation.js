// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_calculation = function(component) {

	return true
}//end render_component_calculation



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_calculation.prototype.list = function(options) {

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data

	// Value as string
		const value_string = Array.isArray(data.value) ? data.value.join(' | ') : data.value

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_calculation.prototype.edit = function(options) {

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data || []
		const value 			= data.value || []
		const label 			= context.label
		const model 			= self.model
		const mode 				= 'edit'
		const tipo 				= context.tipo
		const section_id 		= data.section_id
		const id 				= self.id || 'id is not set'

	// content_data
		const content_data = document.createElement("div")

		const input = common.create_dom_element({
			element_type	: 'div',
			text_content 	: value,
			parent 			: content_data
		})

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	return wrapper
}//end edit
