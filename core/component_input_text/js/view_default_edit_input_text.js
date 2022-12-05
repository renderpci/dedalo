/*global */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {keyup_handler, remove_handler} from './render_edit_component_input_text.js'



/**
* VIEW_DEFAULT_EDIT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_input_text = function() {

	return true
}//end view_default_edit_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
view_default_edit_input_text.render = async function(self, options) {

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
			// set the pointer
			content_data[i] = input_element_node
			// add node to content_data
			content_data.appendChild(input_element_node)
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Creates the current input text node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const multi_line	= (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const element_type	= (multi_line===true) ? 'textarea' : 'input'
		const is_inside_tool= self.is_inside_tool
		// const with_lang_versions	= self.context.properties.with_lang_versions || false

	// content_value node
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
			placeholder		: (current_value) ? '' : self.data.fallback_value[i],
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
		// keyup event
			input.addEventListener('keyup', function(e) {
				keyup_handler(e, i, self)
			})
		// blur event
			// input.addEventListener('blur', function() {
			// 	// force to save current input if changed (prevents override changed_data
			// 	// in multiple values cases)
			// 	if (self.data.changed_data) {
			// 		// change_value
			// 		self.change_value({
			// 			changed_data	: self.data.changed_data,
			// 			refresh			: false
			// 		})
			// 	}
			// })
		// change event
			// input.addEventListener('change', async function() {
			// 	// is_unique check
			// 		if (self.context.properties.unique && input.value!=='') {
			// 			const unique = await self.is_unique(input.value)
			// 			if (typeof unique!=="undefined") {
			// 				ui.show_message(
			// 					self.node,
			// 					`Warning. Duplicated value '${input.value}' in id: ` + unique.section_id,
			// 					'warning'
			// 				)
			// 			}
			// 		}
			// 	// change data
			// 		const changed_data = [Object.freeze({
			// 			action	: 'update',
			// 			key		: i,
			// 			value	: (input.value.length>0) ? input.value : null
			// 		})]
			// 		self.change_value({
			// 			changed_data	: changed_data,
			// 			refresh			: false
			// 		})
			// })

	// button remove. Triggered by wrapper delegated events
		if(!is_inside_tool && i>0) {
			// button_remove
			const remove_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			remove_node.addEventListener('mouseup', function() {
				remove_handler(input, i, self)
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

	const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// prevent to show buttons inside tool
		if (is_inside_tool) {
			return fragment
		}

	// button add input
		if (!is_inside_tool) {
			const button_add = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: 'Add new input field',
				parent			: fragment
			})
			button_add.addEventListener('click', function(e) {
				e.stopPropagation()

				const key = self.data.value.length

				const changed_data = [Object.freeze({
					action	: 'insert',
					key		: key,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
				.then(()=>{
					// console.log("self.node.content_data:",self.node.content_data[changed_data.key]);
					const input_node = self.node.content_data[key]
						? self.node.content_data[key].querySelector('input')
						: null
					if (input_node) {
						input_node.focus()
					}else{
						console.warn('Empty input_node:', self.node.content_data, key);
					}
				})
			})//end event click
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
