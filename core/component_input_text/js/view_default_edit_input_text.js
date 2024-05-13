// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, page_globals, get_label */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {change_handler, remove_handler} from './render_edit_component_input_text.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'


/**
* VIEW_DEFAULT_EDIT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_input_text = function() {

	return true
}//end view_default_edit_input_text



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
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
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length

		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// set the pointer
			content_data[i] = content_value
			// add node to content_data
			content_data.appendChild(content_value)
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
		const multi_line = (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const element_type			= (multi_line===true) ? 'textarea' : 'input'
		const with_lang_versions	= self.context.properties.with_lang_versions || false

	// check if the component is mandatory and it doesn't has value
		const add_class = self.context.properties.mandatory && !current_value && self.lang===page_globals.dedalo_data_nolan
			? ' mandatory'
			: ''

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: element_type,
			type			: 'text',
			class_name		: 'input_value' + add_class,
			value			: current_value,
			placeholder		: (current_value) ? '' : self.data.fallback_value[i],
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self, false)
				}
			})
		// keydown event
			input.addEventListener('keydown', function(e) {
				if(e.key==='Tab' ){
					ui.component.deactivate(self)
					return
				}
			})
		// keyup event
			// input.addEventListener('keyup', function(e) {
			// 	keyup_handler(e, i, self)
			// })
		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})
		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})
		// change event
			input.addEventListener('change',(e) => {
				change_handler(e, i, self)
			})//end fn_change
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
		if (i>0) {
			// button_remove
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			button_remove.addEventListener('mouseup', function(e) {
				e.stopPropagation()
				remove_handler(input, i, self)
			})
		}// end if(mode)

	// transliterate_value
		if (with_lang_versions) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'transliterate_value',
				inner_html		: self.data.transliterate_value,
				parent			: content_value
			})
		}


	// component_dataframe
		if(self.properties.has_dataframe){

			content_value.classList.add('has_dataframe')

			get_dataframe({
				self			: self,
				section_id		: self.section_id,
				section_tipo	: self.section_tipo,
				// tipo_key		: self.tipo,
				section_id_key	: i,
				view 			: self.view
			})
			.then(async function(component_dataframe){

				if(component_dataframe){

					self.ar_instances.push(component_dataframe)
					const dataframe_node = await component_dataframe.render()

					content_value.appendChild(dataframe_node)
				}
			})
		}

	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Creates the current value DOM node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	const data				= self.data || {}
	const fallback_value	= data.fallback_value || []
	const final_value		= get_fallback_value([current_value], fallback_value)

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: final_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// button add input
		if(show_interface.button_add === true){

			const button_add = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'Add new input field',
				parent			: fragment
			})
			button_add.addEventListener('click', function(e) {
				e.stopPropagation()

				// no value case
					if (!self.data.value || !self.data.value.length) {
						self.node.content_data[0].querySelector('input').focus()
						return
					}

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
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}//end add tools

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



// @license-end
