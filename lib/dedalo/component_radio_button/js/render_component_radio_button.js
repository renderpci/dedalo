// import
	import {ui} from '/dedalo/lib/dedalo/common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_radio_button = function(options) {

	this.context 			= options.context
	this.data 				= options.data

	this.tipo 				= options.tipo
	this.section_tipo		= options.section_tipo
	this.section_id			= options.section_id
	this.mode 				= options.mode
	this.lang 				= options.lang
	this.section_lang 		= options.section_lang
	this.model 				= options.model
	this.id 				= options.id

}//end render_component_radio_button



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_radio_button.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= this.model + "_list"
	
	// Value as string 
		const value_string = data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
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
render_component_radio_button.prototype.edit = function(options) {
	
	const self = this
	
	// Options vars 
		const context 			= self.context
		const data 				= self.data || []
		const datalist 			= self.data.datalist || []
		const value 			= data.value || []
		const label 			= context.label		
		const model 			= self.model
		const mode 				= 'edit'
		const tipo 				= context.tipo
		const section_id 		= data.section_id
		const id 				= self.id || 'id is not set'

	// Value as string
		if (data.length > 0) {
			const value_string = value.join(' | ')
		}

	// wrapper 
		const wrapper = ui.component.build_wrapper({
			id 		: id,
			tipo 	: tipo,
			model 	: model,
			mode 	: mode
		})

	// label 
		const component_label = ui.component.build_label({			
			mode 	: mode,
			label 	: label,
			parent 	: wrapper
		})

	// content_data	
		const content_data = ui.component.build_content_data({		
			parent : wrapper
		})
		
	// create ul
		const ul = common.create_dom_element({
			element_type	: 'ul',		
			parent 			: content_data
		})

	// build options
		const value_compare = value.length>0 ? value[0] : null		
		const length = datalist.length
		for (let i = 0; i < length; i++) {

			// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: ul
			})			

			const datalist_item = datalist[i]
			const option = common.create_dom_element({
				element_type	: 'input',
				value 			: JSON.stringify(datalist_item.value),
				type 			: 'radio',
				parent 			: li
			})	
			// checked option set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				option.checked = 'checked'
			}
				
			const option_label = common.create_dom_element({
				element_type	: 'label',
				text_content 	: datalist_item.label,
				parent 			: li
			})	
		}

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return wrapper
}//end edit


const compare_locators = function(datalist_value, data_value) {

	if (true) {}
}