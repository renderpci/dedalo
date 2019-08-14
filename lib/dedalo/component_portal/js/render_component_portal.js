// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {paginator} from '../../search/js/paginator.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_portal = function() {
		
	return true	
}//end render_component_portal



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_portal.prototype.edit = async function(ar_section_record) {
	
	const self = this
	
	// content_data
		const content_data = document.createElement("div")

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}

		//const value_length 	= value.length
		//for (let i = 0; i < value_length; i++) {
		//	const locator = value[i]
		//		console.log("locator:",locator);
		//
		//	const current_section_tipo 	= locator.section_tipo
		//	const current_section_id 	= locator.section_id
		//	const data				 = self.data.filter(element => element.section_tipo===self.section_tipo && element.section_id===current_section_id)
		//
		//}


	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

	// paginator js
	//	const current_paginator = new paginator()
	//
	//	current_paginator.init({
	//		caller 	: self
	//	})
	//	const paginator_node = current_paginator.render()
	//		//console.log("current_paginator:",current_paginator.render());
//
	//	wrapper.appendChild(paginator_node)

			
	return wrapper
}//end edit



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_component_portal.prototype.list = async function(ar_section_record) {
	
	const self = this
	

	// content_data
		const content_data = common.create_dom_element({
			element_type	: 'div',			
			class_name		: self.model + '_list ' + self.tipo + ' breakdown'
		})
	

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			
			const child_item = await ar_section_record[i].render()
			
			content_data.appendChild(child_item)
		}

			
	return content_data
}//end list


