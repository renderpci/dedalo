// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_buttons
	} from './render_edit_component_radio_button.js'



/**
* VIEW_RATING_EDIT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const view_rating_edit_radio_button = function() {

	return true
}//end view_rating_edit_radio_button



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_rating_edit_radio_button.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length

	// sort datalist by section_id
		datalist.sort((a, b) => (parseInt(a.section_id) > parseInt(b.section_id)) ? 1 : -1)

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build options
		for (let i = 0; i < datalist_length; i++) {
			const input_element_node = get_content_value(i, datalist[i], self)
			content_data.appendChild(input_element_node)
			// set pointers
			content_data[i] = input_element_node
		}

		update_status({
			content_data	: content_data,
			value			: self.data.value[0]
		})


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Note that param 'i' is key from datalist, not from component value
* @param int i
* 	datalist key
* @param object datalist_item
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const data				= self.data || {}
		const value				= data.value || []
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})
		content_value.section_id = datalist_item.section_id

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
			title			: label,
			parent			: content_value
		})
		input.addEventListener('change', function() {

			if (self.permissions===1){
				return
			}

			const changed_data = [Object.freeze({
				action	: 'update',
				key		: 0,
				value	: datalist_value
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

			// update label checked status
			update_status({
				content_data	: self.node.content_data,
				value			: self.data.value[0] || {}
			})
		})//end change event

		// permissions. Set disabled on low permissions
		if (self.permissions<2) {
			input.disabled = 'disabled'
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
* @param int i
* 	data.value array key
* @param string current_value
* 	label from datalist item that match current data value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: current_value
		})


	return content_value
}//end get_content_value_read



/**
* UPDATE_STATUS
* update status checked input set on match
* @param options object
* 	{
*		content_data	: content_data, 	component nodes
*		value			: value 			current value object
* 	}
* @return void
*/
const update_status = (options) => {

	const children	= options.content_data.childNodes
	const value		= options.value

 	for (const node of children) {
		if (value && parseInt(value.section_id) >= parseInt(node.section_id)) {
			node.classList.add('rated')
		}
		else{
			node.classList.remove('rated')
		}
	}
}
//end update_status



// @license-end
