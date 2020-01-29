/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
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
render_component_portal.prototype.edit = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})



	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data_edit
*//*
const content_data_edit__DES = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}

	return content_data
}//end content_data_editp
*/



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	const fragment = new DocumentFragment()
	const is_inside_tool = ui.inside_tool(self)


	// ul inputs contaniner
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// li build values (add all nodes from the rendered_section_record)
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			// builds li
			const current_section_record = ar_section_record[i]
			if (!current_section_record) {
				console.log("current_section_record:",current_section_record);
			}
			await input_element(current_section_record, inputs_container)
		}

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button chamnge mode
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button change_mode',
			parent 			: buttons_container
		})
		
	// tools
		if (!is_inside_tool) ui.add_tools(self, buttons_container)

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = async function(current_section_record, inputs_container){

	const key = current_section_record.paginated_key

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			dataset 	 : { key : key },
			parent 		 : inputs_container
		})

	// input field
		const section_record_node = await current_section_record.render()
		li.appendChild(section_record_node)

	// button remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button remove',
			dataset			: { key : key },
			parent 			: li
		})


	return li
}//end input_element



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_component_portal.prototype.list = async function() {

	const self = this

	const ar_section_record = self.ar_instances


	// content_data
		const content_data = ui.create_dom_element({
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


