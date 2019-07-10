// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



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

			const child_item = await ar_section_record[i].node

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
		const content_data = document.createElement("div")


	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			
			const child_item = await ar_section_record[i].node
			
			content_data.appendChild(child_item)
		}
		

	// ui build_list returns component wrapper 
		//const wrapper =	ui.component.build_edit(self, content_data)

			
	return content_data
}//end list




/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_portal.prototype.list99 = function(ar_section_record) {
	
	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= context.model + "_list"
	
	// Value as string 
		const value_string = "portal test list"

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
			text_content 	: value_string
		})

	return node
}//end list


