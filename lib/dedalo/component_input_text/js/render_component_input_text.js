// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function(component) {
		
		
}//end render_component_input_text
	
	//this.component 		= component
	//this.context 			= component.context
	//this.data 			= component.data
	//
	//this.tipo 			= component.tipo
	//this.section_tipo		= component.section_tipo
	//this.section_id		= component.section_id
	//this.mode 			= component.mode
	//this.lang 			= component.lang
	//this.section_lang 	= component.section_lang
	//this.model 			= component.model
	//this.id 				= component.id



/**
* LIST OLD
* Render node for use in list
* @return DOM node
*//*
render_component_input_text.prototype.list_OLD = function() {

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
*/



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_input_text.prototype.list = function() {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= context.model + "_list"
	
	// Value as string 
		const value_string = data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
			text_content 	: value_string
		})

	return node
}//end list



/**
* EDIT OLD
* Render node for use in edit
* @return DOM node wrapper
*//*
render_component_input_text.prototype.edit_OLD = function() {
	
	const self = this
		
	const component = self.component
	const value 	= component.data.value
	
	// content_data
		const content_data = document.createElement("div")
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			
			// inputs 
				const input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'text',
					value 			: inputs_value[i],
					parent 			: content_data
				})

			// events 
				// change . saves value on change
					//input.addEventListener('change', () => ui.component.save(component), false)
					input.addEventListener('change', (e) => {
						event_manager.publish('component_save', component)
					}, false)
				// focus. activate on focus with tab
					input.addEventListener('focus', (e) => {
						event_manager.publish('component_active', component)
					}, false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(component, content_data)
		
	return wrapper
}//end edit
*/



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_input_text.prototype.edit = function() {
	
	const self = this
			
	const component = self
	const value 	= self.data.value

	// content_data
		const content_data = document.createElement("div")
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			
			// inputs 
				const input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'text',
					value 			: inputs_value[i],
					parent 			: content_data
				})
				input.setAttribute("value",inputs_value[i])
			
			// events 
				// change. saves value on change
					input.addEventListener('change', (e) => {
						event_manager.publish('component_save', component)
					}, false)
				// focus. activate on focus with tab
					input.addEventListener('focus', (e) => {
						event_manager.publish('component_active', component)
					}, false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(component, content_data)

			
	return wrapper
}//end edit


