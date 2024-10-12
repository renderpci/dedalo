// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_instance} from '../../../../common/js/instances.js'
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_LIST_DESCRIPTORS
* Manages the component's logic and appearance in client side
*/
export const render_list_descriptors = function() {

	return true
}//end render_list_descriptors



/**
* LIST
* Render node for use in modes: list, list_in_list
* @param object options
* @return HTMLElement wrapper
*/
render_list_descriptors.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_list(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_LIST
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_list = async function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data widget'
		})

	// button_display
		const button_display = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_display',
			inner_html 		: get_label.terms || 'Terms',
			parent			: content_data
		})
		button_display.addEventListener('mouseup', function(e){
			e.stopPropagation()

			button_display.classList.add('loading')

			// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner small',
					parent			: content_data
				})

			// change mode
				self.mode = 'edit'
				self.node.classList.remove('list')
				self.node.classList.add('edit')

			self.refresh()
			.then(function(response){
				spinner.remove()
				button_display.classList.remove('loading')
			})
		})


	return content_data
}//end get_content_data_list



/**
* GET_VALUE_ELEMENT
* @return HTMLElement li
*/
const get_value_element = async (i, data, values_container, self) => {

	const indexation	= data.find(el => el.id==='indexation')
	const value			= indexation.value

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item descriptors',
			parent			: values_container
		})

		if (value<1) {
			return li
		}

	// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html 		: get_label.terms || 'Terms',
			parent			: li
		})

	// value
		const column_id_value = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value link',
			inner_html		: value+'',
			parent			: li
		})
		column_id_value.addEventListener('click', async (e) => {
			e.stopPropagation();
			e.preventDefault();

			// toggle visibility when is already loaded
			descriptors_list_container.classList.toggle('hide')

		})

	// descriptors_list_container
		const descriptors_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'descriptors_list_container',
			parent			: li
		})

	// dd_grid build
		const dd_grid_data	= [data.find(el => el.id==='terms').value]
		const dd_grid		= await get_instance({
			model			: 'dd_grid',
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.section_tipo,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			data			: dd_grid_data
		})
		await dd_grid.build(false)
		const node = await dd_grid.render()
		descriptors_list_container.appendChild(node)


	return li
}//end get_value_element



// @license-end
