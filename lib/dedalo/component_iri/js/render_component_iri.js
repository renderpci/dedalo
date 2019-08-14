// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_iri = function() {

	return true
}//end render_component_iri



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_iri.prototype.list = async function() {

	const self = this

	// Options vars 
		const context 	= self.context
		const data 		= self.data		
	
	// Value as string
		const value_length = data.value.length
		let ar_value_string = [];

		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (data.value[i].title) {
				ar_line.push(data.value[i].title)
			}
			if (data.value[i].iri) {
				ar_line.push(data.value[i].iri)
			}

			if (ar_line && ar_line.length) {			
				ar_value_string.push(ar_line.join(' | '))
			}

		}
			
		const value_string = (ar_value_string && ar_value_string.length) ? ar_value_string.join('<br>') : null;

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			inner_html 	: value_string
		})

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_iri.prototype.edit = async function() {
	
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

	// create ul
	const ul = common.create_dom_element({
		element_type	: 'ul',		
		parent 			: content_data
	})	
		
	// select
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {

			// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: ul
			})	
						
			const title = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: inputs_value[i].title,
				parent 			: li
			})
			.addEventListener('change', ()=> self.component.save(), false);

			const iri = common.create_dom_element({
				element_type	: 'input',
				type 			: 'url',
				value 			: inputs_value[i].iri,
				parent 			: li
			})
			.addEventListener('change', ()=> self.component.save(), false);
			
			//TODO -  this element should be assign with a class that css will show as a button wich will open the iri in a new tab of the navigator
			const btn_iri = common.create_dom_element({
				element_type	: 'a',
				text_content	: 'LINK',
				parent 			: li
			})

			//TODO - remove text_content property, review what should be added to this element
			const div_iri = common.create_dom_element({
				element_type	: 'div',
				text_content	: ' DIV IRI ',
				parent 			: btn_iri
			})
		}

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)

	return wrapper
}//end edit



