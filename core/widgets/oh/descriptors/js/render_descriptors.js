/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import * as instances from '../../../../common/js/instances.js'
	import {ui} from '../../../../common/js/ui.js'
	// import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_DESCRIPTORS
* Manages the component's logic and apperance in client side
*/
export const render_descriptors = function() {

	return true
}//end render_descriptors



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_descriptors.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* LIST
* Render node for use in modes: list, list_in_list
* @return DOM node wrapper
*/
render_descriptors.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data = self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return DOM node li
*/
const get_value_element = (i, data, values_container, self) => {

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class			: 'media_icons',
			parent			: values_container
		})

	//column_id
		const column_id = ui.create_dom_element({
			element_type	: 'div',
			parent			: li
		})
		// value
		const indexation = data.find(item => item.id === 'indexation')
		const column_id_value = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: indexation.value,
			parent			: column_id
		})

		column_id_value.addEventListener("click", async (e) => {
			e.stopPropagation();

			const dd_grid = await instances.get_instance({
				model			: 'dd_grid',
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				tipo			: self.section_tipo,
				mode			: 'list',
				lang			: page_globals.dedalo_data_lang,
			})

			dd_grid.data = [data.find(item => item.id==='terms').value]

			const node = await dd_grid.render()

			column_id_value.appendChild(node)
		})


	return li
}//end get_value_element


