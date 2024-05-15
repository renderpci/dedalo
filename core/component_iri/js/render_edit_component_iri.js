// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../../core/common/js/utils/index.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {view_default_edit_iri} from './view_default_edit_iri.js'
	import {view_line_edit_iri} from './view_line_edit_iri.js'
	import {view_mini_iri} from './view_mini_iri.js'



/**
* RENDER_EDIT_COMPONENT_IRI
* Manage the components logic and appearance in client side
*/
export const render_edit_component_iri = function() {

	return true
}//end render_edit_component_iri



/**
* EDIT
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_iri.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_iri.render(self, options)

		case 'mini':
			return view_mini_iri.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_iri.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [{}] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const current_value = inputs_value[i]
			const content_value_node = (self.permissions===1)
				? get_content_value_read(i, current_value, self)
				: get_content_value(i, current_value, self)
			content_data.appendChild(content_value_node)
			// set pointers
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param object current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// current_value. (!) Fallback to {} because could be null when new blank value is added
		current_value = current_value || {}

	// short vars
		const mode					= self.mode
		const title					= current_value.title || ''
		const iri					= current_value.iri || ''
		const with_lang_versions	= self.context.properties.with_lang_versions || false

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// title
		const use_title = typeof(self.context.properties.use_title) !== 'undefined'
			? self.context.properties.use_title
			: true
		if(use_title){
			// placeholder. Strip label HTML tags
				const placeholder_label = mode.indexOf('edit')!==-1
					? (get_label.title || 'Title')
					: null
				const placeholder_text = placeholder_label ? strip_tags(placeholder_label) : null

			// input title field
				const input_title = ui.create_dom_element({
					element_type	: 'input',
					type			: 'text',
					class_name		: 'input_value title',
					placeholder		: placeholder_text,
					value			: title,
					parent			: content_value
				})
				// keyup event
					input_title.addEventListener('keyup', fn_keyup)
					function fn_keyup(e) {
						// update property title
							current_value.title = input_title.value

						// update_value(self, i, current_value)
							self.keyup_handler(e, i, current_value, self)
					}//end keyup
				// focus event
					input_title.addEventListener('focus', function() {
						// force activate on input focus (tabulating case)
						if (!self.active) {
							ui.component.activate(self, false)
						}
					})
				// click event
					input_title.addEventListener('click', function(e) {
						e.stopPropagation()
					})
				// click event
					input_title.addEventListener('mousedown', function(e) {
						e.stopPropagation()
					})
		}// end if(use_title)

	// IRI input field
		// const regex = /^((https?):\/\/)?([w|W]{3}\.)+[a-zA-Z0-9\-\.]{3,}\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/;
		const input_iri = ui.create_dom_element({
			element_type	: 'input',
			type			: 'url',
			class_name		: 'input_value url',
			placeholder		: 'http://',
			value			: iri,
			parent			: content_value
		})
		// keyup event
			input_iri.addEventListener('keyup', fn_keyup)
			function fn_keyup(e) {

				// check if url is valid
					const regex = /(https?)?:\/\/.*\..+/;
					const value = input_iri.value

					if(value && !value.match(regex)){
						input_iri.classList.add('error')
						return false
					}

				// clean error class if exists
					if (input_iri.classList.contains('error')) {
						input_iri.classList.remove('error')
					}

				// update property iri
					current_value.iri = input_iri.value

				// update_value(self, i, current_value)
					self.keyup_handler(e, i, current_value, self)
			}//end keyup
		// focus event
			input_iri.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self, false)
				}
			})

	// active
		const use_active_check = typeof(self.context.properties.use_active_check) !== 'undefined'
			? self.context.properties.use_active_check
			: false
		if(use_active_check){

			const dataframe_data = current_value.dataframe
				? true
				: false

			const input_iri_active = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'input_iri_active',
				parent			: content_value
			})
			input_iri_active.checked = dataframe_data
			input_iri_active.addEventListener('change', fn_chnage)
			async function fn_chnage(e){

				// add style modified to wrapper node
					if (!self.node.classList.contains('modified')) {
						self.node.classList.add('modified')
					}

				// checked set for dataframe
					current_value.dataframe = input_iri_active.checked

				// set_changed_data
					const changed_data_item = Object.freeze({
						action	: 'update',
						key		: i,
						value	: current_value
					})
					// fix instance changed_data
					await self.set_changed_data(changed_data_item)

				// force to save on every change
					const changed_data = self.data.changed_data || []
					self.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
			}//end change event
		}

		const active_check_class = (use_active_check) ? 'active_check' : ''

	// button remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			title			: get_label.delete || 'Delete',
			class_name		: 'button remove hidden_button '+ active_check_class,
			parent			: content_value
		})
		button_remove.addEventListener('click', function(e) {
			e.stopPropagation()

			// force possible input change before remove
			document.activeElement.blur()

			const changed_data = [Object.freeze({
				action	: 'remove',
				key		: i,
				value	: null
			})]
			self.change_value({
				changed_data	: changed_data,
				label			: button_remove.previousElementSibling.value,
				refresh			: true
			})
		})

	// button link
		const button_link = ui.create_dom_element({
			element_type	: 'span',
			title			: get_label.vincular_recurso || 'Link resource',
			class_name		: 'button link hidden_button '+ active_check_class,
			parent			: content_value
		})
		button_link.addEventListener('click', function(e) {
			e.stopPropagation()

			// open a new window
				const url				= input_iri.value
				const current_window	= window.open(url, 'component_iri_opened', 'width=1024,height=720')
				current_window.focus()
		})

	// transliterate value
		if(self.data.transliterate_value) {

			const transliterate_value = self.data.transliterate_value[0] || {}

			const transliterate_value_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'transliterate_value',
				parent			: content_value
			})
			// title
				const title_text = transliterate_value.title || ''
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'title',
					inner_html		: title_text,
					parent			: transliterate_value_container
				})
			// IRI
				const iri_text = transliterate_value.iri || ''
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'iri',
					inner_html		: iri_text,
					parent			: transliterate_value_container
				})
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @param int i
* @param object current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// current_value. (!) Fallback to {} because could be null when new blank value is added
		current_value = current_value || {}

	// short vars
		const mode	= self.mode
		const title	= current_value.title || ''
		const iri	= current_value.iri || ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// title
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'title',
			inner_html		: title,
			parent			: content_value
		})

	// iri
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'iri',
			inner_html		: iri,
			parent			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// button add input
		if(show_interface.button_add === true){

			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'New',
				parent			: fragment
			})
			button_add_input.addEventListener('click', function(e) {
				e.stopPropagation()

				const changed_data = [Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,
					value	: null
				})]
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
			})
		}

	// buttons tools
		if(show_interface.tools === true){
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



// @license-end

