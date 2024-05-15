// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_email} from './view_default_edit_email.js'
	import {view_line_edit_email} from './view_line_edit_email.js'
	import {view_mini_email} from './view_mini_email.js'



/**
* RENDER_EDIT_COMPONENT_EMAIL
* Manage the components logic and appearance in client side
*/
export const render_edit_component_email = function() {

	return true
}//end render_edit_component_email



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_email.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_email.render(self, options)

		case 'mini':
			return view_mini_email.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'default':
		default:
			return view_default_edit_email.render(self, options)
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

	// build values
		const inputs_value = value
		const value_length = inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	const mode = self.mode
	// check if the component is mandatory and it doesn't has value
	const add_class = self.context.properties.mandatory && !current_value
		? ' mandatory'
		: ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value' + add_class,
			value			: current_value,
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self, false)
				}
			})
		// keyup event
			input.addEventListener('keyup', function(e){
				keyup_handler(e, i, self)
			})
		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})
		// mousedown event. Capture event propagation
			// input.addEventListener('mousedown', (e) => {
			// 	e.stopPropagation()
			// })
		// change event
			input.addEventListener('change', fn_change)
			function fn_change(e) {
				// validate
				const validated = self.verify_email(input.value)
				ui.component.error(!validated, input)
				if (!validated) {
					return false
				}
			}//end change

	// add buttons to the email row
		// button_remove
			if (i>0) {
				const button_remove = ui.create_dom_element({
					element_type	: 'span',
					title			: get_label.delete || 'Delete',
					class_name		: 'button remove hidden_button',
					parent			: content_value
				})
				button_remove.addEventListener('mouseup', function(e) {
					e.stopPropagation()
					remove_handler(input, i, self)
				})
			}

		// button email
			const button_email = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button email hidden_button',
				parent			: content_value
			})
			button_email.addEventListener('mouseup', function(e) {
				e.stopPropagation()
				self.send_email(input.value)
			})



	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
* @param int i
* 	data.value array key
* @param string current_value
* @param object self
*
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

			// button_add_input
			const add_button = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'Add new input field',
				parent			: fragment
			})
			add_button.addEventListener('click', function(e) {
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
			})
		}

	// button send_multiple_email
		if(show_interface.tools === true){
			const send_multiple_email = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button email_multiple',
				parent			: fragment
			})
			send_multiple_email.addEventListener('click', async function (e) {
				e.stopPropagation()

				const ar_emails		= await self.get_ar_emails()
				const mailto_prefix	= 'mailto:?bcc=';
				// ar_mails could be an array with 1 string item with all addresses or more than 1 string when the length is more than length supported by the SO (in Windows 2000 charts)
				// if the maximum chars is surpassed the string it was spliced in sorted strings and passed as string items of the array
				// every item of the array will be opened by the user to create the email
				if(ar_emails.length > 1){

					const body = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'body'
					})

					const body_title = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'body_title',
						text_node		: get_label.email_limit_explanation,
						parent			: body
					})
					// create the mail with the addresses and create the buttons to open the email app
					for (let i = 0; i < ar_emails.length; i++) {

						const current_emails = ar_emails[i]
						// find the separator to count the total of emails for every chunk of emails.
						const regex = /;/g;
						const search_number_of_email =  current_emails.match(regex) || []
						const number_of_email = search_number_of_email.length > 0
							? search_number_of_email.length +1
							: 1
						const buton_option = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'warning',
							inner_html		: (get_label.email || 'email') + ': ' + number_of_email,
							parent			: body
						})

						buton_option.addEventListener('mouseup', function (e) {
							// when the user click in the button remove the option and open the email with the addresses
							buton_option.remove()
							window.location.href = mailto_prefix + current_emails
						})
					}

					// modal. create new modal with the email buttons
						ui.attach_to_modal({
							header	: get_label.alert_limit_of_emails || 'emails limitation',
							body	: body,
							footer	: null,
							size	: 'small'
						})

				}else{
					window.location.href = mailto_prefix + ar_emails[0]
				}
			})
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* KEYUP_HANDLER
* Store current value in self.data.changed_data
* If key pressed is 'Enter', force save the value
* @param event e
* @param int key
* @param object self
* @return bool
*/
export const keyup_handler = function(e, key, self) {
	e.preventDefault()

	// tab/shift case catch
		if (e.key==='Tab' || e.key==='Shift') {
			return
		}

	// Enter key force to save changes
		if (e.key==='Enter') {

			// force to save current input if changed
				const changed_data = self.data.changed_data || []
				// change_value (save data)
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
		}else{
			// change data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: key,
					value	: e.target.value || ''
				})

			// fix instance changed_data
				self.set_changed_data(changed_data_item)
		}


	return true
}//end keyup_handler



/**
* REMOVE_HANDLER
* Handle button remove actions
* @param DOM  node input
* @param int key
* @param object self
* @return promise response
*/
export const remove_handler = function(input, key, self) {

	// force possible input change before remove
		document.activeElement.blur()

	// value
		const current_value = input.value ? input.value : null
		if (current_value) {
			if (!confirm(get_label.sure)) {
				return
			}
		}

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			key		: key,
			value	: null
		})]

	// change_value. Returns a promise that is resolved on api response is done
		const response = self.change_value({
			changed_data	: changed_data,
			label			: current_value,
			refresh			: true
		})


	return response
}//end remove_handler



// @license-end
