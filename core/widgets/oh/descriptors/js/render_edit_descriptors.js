// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import * as instances from '../../../../common/js/instances.js'
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_EDIT_DESCRIPTORS
* Manages the component's logic and appearance in client side
*/
export const render_edit_descriptors = function() {

	return true
}//end render_edit_descriptors



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return HTMLElement wrapper
*/
render_edit_descriptors.prototype.edit = async function(options) {

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
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

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
		button_display.addEventListener('mouseup', async function(e){
			e.stopPropagation()

			// change mode
				self.mode = 'list'
				self.node.classList.remove('edit')
				self.node.classList.add('list')

			await self.refresh()
		})

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'values_container',
			parent			: content_data
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length
		for (let i = 0; i < ipo_length; i++) {
			const data	= self.value.filter(item => item.key===i)
			const node	= await get_value_element(i, data, self)
			values_container.appendChild(node)
		}


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @param int i
* @param array data
* @param object self
* @return DocumentFragment
*/
const get_value_element = async (i, data, self) => {

	const indexation	= data.find(el => el.id==='indexation')
	const value			= indexation.value

	const fragment = new DocumentFragment()

	// label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html 		: (get_label.total || 'Total') + ' ' +  (value+''),
			parent			: fragment
		})

	// descriptors_list_container
		const descriptors_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'descriptors_list_container',
			parent			: fragment
		})

	// values dd_grid
		if (value && value>0) {
			// dd_grid build and append
			render_values(self, data)
			.then(function(dd_grid_node){
				descriptors_list_container.appendChild(dd_grid_node)
			})
		}


	return fragment
}//end get_value_element



/**
* RENDER_VALUES
* @param object self
* @param array data
* @return HTMLElement dd_grid_node
*/
const render_values = function(self, data) {

	return new Promise(async function(resolve){

		// dd_grid build and append
		const dd_grid_data	= [data.find(el => el.id==='terms').value]
		const dd_grid		= await instances.get_instance({
			model			: 'dd_grid',
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.section_tipo,
			mode			: 'list',
			view			: 'descriptors',
			lang			: page_globals.dedalo_data_lang,
			data			: dd_grid_data
		})
		await dd_grid.build(false)
		const dd_grid_node = await dd_grid.render()


		resolve(dd_grid_node)
	})
}//end render_values



// @license-end
