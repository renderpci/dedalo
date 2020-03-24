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
render_component_portal.prototype.edit = async function(options={render_level : 'full'}) {

	const self = this

	// render_level
		const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})


	return wrapper
}//end edit



/**
* get_CONTENT_DATA_EDIT
* @return DOM node get_content_data_edit
*//*
const get_content_data_edit__DES = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	// content_data
		const content_data = = ui.component.build_content_data(self)

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}

	return content_data
}//end get_content_data_editp
*/



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const ar_section_record = await self.get_ar_instances()
	const is_inside_tool 	= self.is_inside_tool

	const fragment = new DocumentFragment()

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

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button close
		if(mode==='edit_in_list' && !is_inside_tool){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: fragment
			})
		}

	// button change_mode
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button change_mode',
			parent 			: fragment
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



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


