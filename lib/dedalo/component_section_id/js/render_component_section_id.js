// import
	import {ui} from '../../common/js/ui.js'
	import {common} from '../../common/js/common.js'


/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_section_id = function(component) {

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
}//end render_component_section_id



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_section_id.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data		
	
	// Value as string 
		const value_string = data.value

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
render_component_section_id.prototype.edit = function() {
	
	const self = this

	const value = self.data.value	

	// content_data	
		const content_data = document.createElement("div")
		const div_value = common.create_dom_element({
			element_type	: 'div',
			class_name		: 'css_section_id',
			text_content 	: value, 
			parent 			: content_data
		})

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

	return wrapper
}//end edit


