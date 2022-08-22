/*global */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_INPUT_TEXT
* Manages the component's logic and apperance in client side
*/
export const render_edit_component_input_text = function() {

	return true
}//end render_edit_component_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_input_text.prototype.edit = async function(options) {

	const self = this

	// options
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
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const mode					= self.mode
		const multi_line			= (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const element_type			= (multi_line===true) ? 'textarea' : 'input'
		const is_inside_tool		= self.is_inside_tool
		// const with_lang_versions	= self.context.properties.with_lang_versions || false

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: element_type,
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value,
			placeholder 	: (current_value) ? '' : self.data.fallback_value[i],
			parent			: content_value
		})
		input.addEventListener('change', async function() {

			// is_unique check
				if (self.context.properties.unique && input.value!=='') {
					const unique = await self.is_unique(input.value)
					if (typeof unique!=="undefined") {
						ui.show_message(
							self.node,
							`Warning. Duplicated value '${input.value}' in id: ` + unique.section_id,
							'warning'
						)
					}
				}

			// change data
				const changed_data = Object.freeze({
					action	: 'update',
					key		: i,
					value	: (input.value.length>0) ? input.value : null
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
		})//end change
		input.addEventListener('keyup', function(e) {
			// page unload event
				if (e.key!=='Enter') {
					const key				= i
					const original_value	= self.db_data.value[key]
					const new_value			= input.value
					// set_before_unload (bool)
					set_before_unload(new_value!==original_value)
				}
		})//end keyup

	// button remove. Triggered by wrapper delegated events
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {
			// button_remove
			const remove_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			remove_node.addEventListener('mouseup', function() {
				// force possible input change before remove
				document.activeElement.blur()

				const current_value = input.value ? input.value : null

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: i,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: current_value,
					refresh			: true
				})
			})
		}// end if(mode)


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit' || mode==='edit_in_list') { // && !is_inside_tool
			const button_add = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: 'Add new input field',
				parent			: fragment
			})
			button_add.addEventListener('click', function(e) {
				e.stopPropagation()

				const changed_data = Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
				.then(()=>{
					// console.log("self.node.content_data:",self.node.content_data[changed_data.key]);
					const input_node = self.node.content_data[changed_data.key].querySelector('input')
					if (input_node) {
						input_node.focus()
					}
				})
			})//end event click
		}//end if(mode)

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
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
