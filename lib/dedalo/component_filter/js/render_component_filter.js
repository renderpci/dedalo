// import
	import {ui} from '/dedalo/lib/dedalo/common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_filter = function(component) {

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

}//end render_component_filter



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_filter.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= this.model + "_list"
	
	// Value as string 
		const value_string = data.value

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
			inner_html	 	: value_string
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
render_component_filter.prototype.edit = function(options) {
	
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

	// wrapper 
		const wrapper = ui.component.build_wrapper({
			id 			: id,
			tipo 		: tipo,
			model 		: model,
			mode 		: mode,
			component 	: self.component
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
		const length = datalist.length
		const value_length = value.length
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
				type 			: 'checkbox',
				parent 			: li
			})	
			// checked option set on match
			for (let j = 0; j < value_length; j++) {
				if (value[j] && datalist_item.value &&
					value[j].section_id===datalist_item.value.section_id &&
					value[j].section_tipo===datalist_item.value.section_tipo
					) {
						option.checked = 'checked'
				}
			}

			option.addEventListener('change', ()=> self.component.save(), false);
							
			const option_label = common.create_dom_element({
				element_type	: 'label',
				text_content 	: datalist_item.label,
				parent 			: li
			})	

			if(SHOW_DEBUG===true) {
				const notes = common.create_dom_element({
					element_type	: 'span',
					text_content 	: '[' + datalist_item.section_id + ']',
					parent 			: option_label
				})
			}	

		}

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return wrapper
}//end edit


const compare_locators = function(datalist_value, data_value) {

	if (true) {}
}