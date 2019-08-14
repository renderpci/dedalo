// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'

/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_radio_button = function() {
		
	return true
}//end render_component_radio_button


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_radio_button.prototype.list = async function() {

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

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_radio_button.prototype.edit = async function() {
	
	const self = this
	const value = self.data.value	
	
	// Options vars 			
		const tipo 				= self.tipo
		const section_tipo		= self.section_tipo
		const section_id 		= self.section_id
		const datalist 			= self.data.datalist || []

		const content_data = document.createElement('div')
		
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
			const input = common.create_dom_element({
				element_type	: 'input',
				value 			: JSON.stringify(datalist_item.value),
				type 			: 'radio',
				parent 			: li,
				name 			: `${section_tipo}_${tipo}_${section_id}`
			})		

			// checked input set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				input.checked = 'checked'
			}

			// events 
				// change. saves value on change
					input.addEventListener('change', (e) => {
						event_manager.publish('component_save', self)
					}, false)
				// focus. activate on focus with tab
					input.addEventListener('focus', (e) => {
						event_manager.publish('component_active', self)
					}, false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
				
			const option_label = common.create_dom_element({
				element_type	: 'label',
				text_content 	: datalist_item.label,
				parent 			: li
			})	
		}

		// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)
	
	return wrapper
}//end edit


const compare_locators = function(datalist_value, data_value) {

	if (true) {}
}