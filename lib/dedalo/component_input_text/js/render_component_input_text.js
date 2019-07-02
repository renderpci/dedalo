// import
	import {ui} from '/dedalo/lib/dedalo/common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function(component) {

	this.component 			= component
	//this.context 			= component.context
	//this.data 				= component.data
	//
	//this.tipo 				= component.tipo
	//this.section_tipo		= component.section_tipo
	//this.section_id			= component.section_id
	//this.mode 				= component.mode
	//this.lang 				= component.lang
	//this.section_lang 		= component.section_lang
	//this.model 				= component.model
	//this.id 				= component.id

}//end render_component_input_text



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_input_text.prototype.list = function() {

	const self = this

	// Options vars 
		const context 			= self.component.context
		const data 				= self.component.data
		const node_type 		= "div"
		const node_class_name 	= self.component.context.model + "_list"
	
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
*//*
render_component_input_text.prototype.edit__OLD = function() {
	
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
		const component 		= self.component

	// wrapper 
		const wrapper = ui.component.build_wrapper({
			id 			: id,
			tipo 		: tipo,
			model 		: model,
			mode 		: mode,
			component 	: component
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
	
	// input data
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
						
			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: inputs_value[i],
				parent 			: content_data
			})

			// events
				// change . saves value on change
					//input.addEventListener('change', () => self.component.save(), false)
					input.addEventListener('change', () => ui.component.save(component), false)
				// focus. activate on focus with tab
					input.addEventListener('focus', () => ui.component.active(component), false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);
	
	//wrapper.addEventListener('click', ()=> self.component.active());
	
	return wrapper
}//end edit
*/



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_input_text.prototype.edit = function() {
	
	const self = this
		
	const component = self.component
	const value 	= component.data.value
	
	// content_data
		const content_data = document.createElement("div")
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
						
			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: inputs_value[i],
				parent 			: content_data
			})

			// events 
				// change . saves value on change
					input.addEventListener('change', () => ui.component.save(component), false)
				// focus. activate on focus with tab
					input.addEventListener('focus', () => ui.component.active(component), false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(component, content_data)

	
	return wrapper
}//end edit


