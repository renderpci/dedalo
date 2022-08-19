/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_EMAIL
* Manage the components logic and appearance in client side
*/
export const render_edit_component_email = function() {

	return true
}//end render_edit_component_email



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node
*/
render_edit_component_email.prototype.edit = async function(options={render_level : 'full'}) {

	const self 	= this

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

	// set pointer to content_data
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


	// build values
		const inputs_value = value
		const value_length = inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element_edit(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}

	return content_data
}//end render_content_data



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
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			// button_add_input
			const add_button = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				parent			: fragment
			})
			add_button.addEventListener('mouseup',function(e) {
				const changed_data = Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
				.then((save_response)=>{
					const inputs_container	= self.wrapper.content_data.inputs_container
					const new_input			= get_input_element_edit(changed_data.key, changed_data.value, self)
					inputs_container.appendChild(new_input)
				})
			})

			// button_add_input
			const send_multiple_email = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button email_multiple',
				parent			: fragment
			})
			send_multiple_email.addEventListener('mouseup', async function (e) {
				const ar_emails = await self.get_ar_emails()
				const mailto_prefix = 'mailto:?bcc=';
				// ar_mails could be an array with 1 string item with all addresses or more than 1 string when the length is more than length supported by the SO (in Windows 2000 charts)
				// if the maximum chars is surpassed the string it was spliced in sorted strings and passed as string items of the array
				// every item of the array will be opened by the user to create the email
				if(ar_emails.length > 1){

					const body = ui.create_dom_element({
						element_type	: 'span',
						class_name 		: 'body'
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
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_INPUT_ELEMENT_EDIT
* @return dom element content_value
*/
const get_input_element_edit = (i, current_value, self) => {

	const mode				= self.mode
	const is_inside_tool	= self.is_inside_tool
	// check if the component is mandatory and it doesn't has value
	const add_class 		= self.context.properties.mandatory && !current_value
		? ' mandatory'
		: ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input_email = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value' + add_class,
			value			: current_value,
			parent			: content_value
		})
	//events
		input_email.addEventListener('change',function(e){
			const validated = self.verify_email(input_email.value)
			ui.component.error(!validated, input_email)

			if (validated) {
				// set the changed_data for replace it in the instance data
				// new_value. key is the position in the data array, the value is the new value
				const new_value = (input_email.value.length>0) ? input_email.value : null
				// set the changed_data for update the component data and send it to the server for change when save
				const changed_data = Object.freeze({
					action	: 'update',
					key		: i,
					value	: new_value
				})
				// update the data in the instance previous to save
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, changed_data)
				})
				// check if the new value is empty or not to remove the mandatory class
				if(new_value){
					input_email.classList.remove('mandatory')
				}else{
					input_email.classList.add('mandatory')
				}

			}
		})//end change
		input_email.addEventListener('keyup',async function(e){
			// page unload event
				if (e.key!=='Enter') {
					const key				= i
					const original_value	= self.db_data.value[key]
					const new_value			= input_email.value
					if (new_value!==original_value) {
						// set_before_unload (bool) add
						set_before_unload(true)
					}else{
						// set_before_unload (bool) remove
						set_before_unload(false)
					}
				}
		})//end keyup


	// add buttons to the email row
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			// button remove
			button_remove.addEventListener('mouseup',function(e){
				// force possible input change before remove
				document.activeElement.blur()

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: i,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: current_value || ' ',
					refresh			: true
				})
				.then(()=>{
				})
			})

			// button email
			const button_email = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button email hidden_button',
				parent			: content_value
			})
			button_email.addEventListener('mouseup',function(e) {
				self.send_email(current_value)
			})
		}

	return content_value
}//end input_element


