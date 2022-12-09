/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../../core/common/js/utils/index.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {view_default_edit_iri} from './view_default_edit_iri.js'
	import {view_line_edit_iri} from './view_line_edit_iri.js'
	import {view_text_iri} from './view_text_iri.js'
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
* Render node for use in modes: edit, edit_in_list
* @return DOM node
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

		case 'text':
			return view_text_iri.render(self, options)

		case 'default':
		default:
			return view_default_edit_iri.render(self, options)
	}

	return null
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
export const get_content_data = function(self) {

	const value				= self.data.value
	// const mode			= self.mode
	// const is_inside_tool	= self.is_inside_tool

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [{}] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const current_value = inputs_value[i]
			const content_value = get_content_value(i, current_value, self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	// current_value. (!) Fallback to {} because could be null when new blank value is added
		current_value = current_value || {}

	// short vars
		const mode	= self.mode
		const title	= current_value.title || ''
		const iri	= current_value.iri || ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	const use_title = typeof(self.context.properties.use_title) !== 'undefined'
		? self.context.properties.use_title
		: true

	if(use_title){
		// placeholder. Strip label HTML tags
			const placeholder_label = mode.indexOf('edit')!==-1
				? (get_label.title || 'Tilte')
				: null
			const placeholder_text = placeholder_label ? strip_tags(placeholder_label) : null

		// input title field
			const input_title = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				class_name		: 'input_value',
				placeholder		: placeholder_text,
				value			: title,
				parent			: content_value
			})
			//end change
			input_title.addEventListener('keyup', function(e) {
				current_value.title = input_title.value
				update_value(self, i, current_value)
			})//end keyup
	} // end if(use_title)


	// input iri field
	// const regex = /^((https?):\/\/)?([w|W]{3}\.)+[a-zA-Z0-9\-\.]{3,}\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/;

		const input_iri = ui.create_dom_element({
			element_type	: 'input',
			type			: 'url',
			class_name		: 'input_value url',
			placeholder		: 'http://',
			value			: iri,
			parent			: content_value
		})
		input_iri.addEventListener('keyup', function() {

			const regex = /(https?)?:\/\/.*\..+/;
			const value = input_iri.value

			if(value && !value.match(regex)){
				input_iri.classList.add('error')
				return false
			}
			input_iri.classList.remove('error')

			current_value.iri = input_iri.value
			update_value(self, i, current_value)
		})//end keyup

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

			input_iri_active.addEventListener('change', async function(e){

				// add style modified to wrapper node
					if (!self.node.classList.contains('modified')) {
						self.node.classList.add('modified')
					}

				current_value.dataframe = input_iri_active.checked

				// set_changed_data
					const changed_data_item = Object.freeze({
						action	: 'update',
						key		: i,
						value	: current_value
					})
						console.log("--> fixed changed_data_item:", changed_data_item);
					// fix instance changed_data
					await self.set_changed_data(changed_data_item)

				// force to save on every change
					const changed_data = self.data.changed_data || []
						console.log("--> self.data.changed_data:",self.data.changed_data);
					self.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
		})//end change event
		}

		const active_check_class = (use_active_check) ? 'active_check' : ''

	// button remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
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



	return content_value
}//end get_content_value



/**
* UPDATE_VALUE
* @return promise
*/
const update_value = function(self, i, current_value) {

	// full object value built as:
	// {
	//		iri	  : iri_value,
	//		title : title_value
	// 		dataframe : [] || true || false
	// }



	// change_value
	const changed_data_item = Object.freeze({
		action	: 'update',
		key		: i,
		value	: current_value
	})
	// fix instance changed_data
	self.set_changed_data(changed_data_item)

}//end update_value



/**
* SET_UNLOAD_STATE
* Page unload event
* @param instance self
* @param int i
*
* @return bool
*/
const set_unload_state = function(self, i, current_value) {

	// values
		const original_value	= self.db_data.value[i] || null
		// const current_value			= self.build_value(i)

	// compares new and old full values by property
		let equal = true
		if (original_value) {
			for(const prop in current_value) {
				if (!original_value[prop] || original_value[prop]!==current_value[prop]) {
					equal = false
					break
				}
			}
		}

	// set_before_unload (bool)
		set_before_unload(!equal)


	return true
}//end set_unload_state



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// DOM fragment
		const fragment = new DocumentFragment()

	// button add input
		if(!is_inside_tool) {
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
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
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons
