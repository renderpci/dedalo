/*global, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const render_edit_component_radio_button = function() {

	return true
}//end render_edit_component_radio_button



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node
*/
render_edit_component_radio_button.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

	// inputs. Iterate datalist
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element_edit(
				i, // int datalist key
				datalist[i], // object datalist item
				self
			)
			content_data.appendChild(input_element)
			// set pointers
			content_data[i] = input_element
		}


	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* Note that param 'i' is key from datalist, not from component value
* @param int i
* 	datalist key
* @param object datalist_item
* @param object self
*
* @return DOM element content_value
*/
const get_input_element_edit = (i, datalist_item, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
		})
		input_label.prepend(input)
		input.addEventListener('change', function() {

			const changed_data = Object.freeze({
				action	: 'update',
				key		: 0,
				value	: datalist_value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
			.then(()=>{
				//self.selected_key = e.target.dataset.key
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, self)
			})
		})//end change event

		content_value.addEventListener('mousedown', function(e) {
			if (e.altKey===true) {
				e.stopPropagation()
				e.preventDefault()

				if (self.data.value.length===0) {
					return true
				}
				// remove checked state
				input.checked = false

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: self.get_checked_value_label(),
					refresh			: false,
					remove_dialog	: ()=>{
						return true
					}
				})
				.then(()=>{
					//self.selected_key = e.target.dataset.key
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, self)
				})
			}
		})

	// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}

	return content_value
}//end get_input_element_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// document fragment
		const fragment = new DocumentFragment()

	// button edit (go to target section)
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const target_sections			= self.context.target_sections
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				const label = (SHOW_DEBUG===true)
					? `${item.label} [${item.tipo}]`
					: item.label

				const button_edit = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button edit',
					title			: label,
					parent			: fragment
				})
				button_edit.addEventListener("click", function(e){
					e.stopPropagation()
					// navigate link
					event_manager.publish('user_navigation', {
						source : {
							tipo	: item.tipo,
							model	: 'section',
							mode	: 'list'
						}
					})
				})
			}
		}

	// button reset
		if(mode==='edit' || mode==='edit_in_list'){// && !is_inside_tool){
			const reset_button = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button reset',
				parent			: fragment
			})
			reset_button.addEventListener('click', function() {
				// force possible input change before remove
				document.activeElement.blur()

				if (self.data.value.length===0) {
					return true
				}

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: self.get_checked_value_label(),//'All',
					refresh			: true
				})
				.then(()=>{
					// rebuild and save the component
					// event_manager.publish('reset_element_'+self.id, self)
					event_manager.publish('update_value_'+self.id, self)
				})
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons
