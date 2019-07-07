// import
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_number = function(component) {


}//end render_component_number



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_number.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= this.model + "_list"
	
	// Value as string
		const value_string = Array.isArray(data.value) ? data.value.join(' | ') : data.value

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
* @return DOM node wrapper
*/
render_component_number.prototype.edit = function(options) {
	
	const self = this
		
	const component = self
	const value 	= component.data.value || []
	
	// content_data
		const content_data = document.createElement("div")
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			
			// inputs 
				const input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'number',
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


