// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_autocomplete = function() {
		
	return true	
}//end render_component_autocomplete



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_autocomplete.prototype.edit = async function(ar_section_record) {
	
	const self = this

	const list_name = self.id + "_" + new Date().getUTCMilliseconds()
	
	// content_data
		const content_data = document.createElement("div")

	// input 
		const input = common.create_dom_element({
			element_type	: 'input',
			//value 			: list_name,	
			parent 			: content_data
		})
		input.setAttribute("list", list_name)
		input.addEventListener("keyup", function(e){
			console.log("this.value:",this.value);

		}, false)

	// datalist
		const datalist = common.create_dom_element({
			element_type	: 'datalist',
			id 				: list_name,	
			parent 			: content_data
		})
	
	// datalist_values test
		const datalist_values = ["uno","dos","tres","abeto","alga"]
		datalist_values.forEach(function(element) {			
			common.create_dom_element({
				element_type	: 'option',
				value 			: element,	
				parent 			: datalist
			})
		});
		

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			//console.log("----ar_section_record[i].node:",ar_section_record[i].node);
			content_data.appendChild(ar_section_record[i].node)
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
render_component_autocomplete.prototype.list = async function(ar_section_record) {
	
	const self = this
	

	// content_data
		const content_data = common.create_dom_element({
			element_type	: 'div',			
			class_name		: self.model + '_list ' + self.tipo + ' breakdown'
		})
	

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			
			const child_item = await ar_section_record[i].node
			
			content_data.appendChild(child_item)
		}
	
			
	return content_data
}//end list


