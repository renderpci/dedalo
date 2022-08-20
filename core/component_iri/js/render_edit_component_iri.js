/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../../core/common/js/utils/index.js'
	import {set_before_unload} from '../../common/js/events.js'



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

	self.data.value = self.data.value || []

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
}//end get_content_data_edit



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
		input_title.addEventListener('change', function() {
			update_value(self, i)
		})
		//end change
		input_title.addEventListener('keyup', function(e) {
			// page unload event
			if (e.key!=='Enter') set_unload_state(self, i);
		})//end keyup

	if((mode==='edit' || mode==='edit_in_list')) {

		// input iri field
			const input_iri = ui.create_dom_element({
				element_type	: 'input',
				type			: 'url',
				class_name		: 'input_value url',
				placeholder		: 'http://',
				pattern			: '(https?)?:\/\/.*\..+',
				value			: iri,
				parent			: content_value
			})
			input_iri.addEventListener('change', function() {
				update_value(self, i)
			})
			//end change
			input_iri.addEventListener('keyup', function(e) {
				// page unload event
				if (e.key!=='Enter') set_unload_state(self, i);
			})//end keyup

	// button remove
		const button_remove = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button remove hidden_button',
			parent			: content_value
		})
		button_remove.addEventListener('click', function(e) {
			e.stopPropagation()

			// force possible input change before remove
			document.activeElement.blur()

			const changed_data = Object.freeze({
				action	: 'remove',
				key		: i,
				value	: null
			})
			self.change_value({
				changed_data	: changed_data,
				label			: button_remove.previousElementSibling.value,
				refresh			: true
			})
		})

	// button link
		const button_link = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button link hidden_button',
			parent			: content_value
		})
		button_link.addEventListener('click', function(e) {
			e.stopPropagation()

			// open a new window
				const url				= input_iri.value
				const current_window	= window.open(url, 'component_iri_opened', 'width=1024,height=720')
				current_window.focus()
		})
	}//end if((mode==='edit' || mode==='edit_in_list'))


	return content_value
}//end get_content_value



/**
* UPDATE_VALUE
* @return promise
*/
const update_value = function(self, i) {

	// full object value built as:
	// {
	//		iri	  : iri_value,
	//		title : title_value
	// }
	const full_value = self.build_value(i)

	return new Promise(function(resolve){

		// change_value
		const changed_data = Object.freeze({
			action	: 'update',
			key		: i,
			value	: full_value
		})
		self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})
		.then(()=>{
			// event to update the dom elements of the instance
			event_manager.publish('update_value_'+self.id_base, changed_data)

			resolve()
		})
	})
}//end update_value



/**
* SET_UNLOAD_STATE
* Page unload event
* @return bool
*/
const set_unload_state = function(self, i) {

	// values
		const original_value	= self.db_data.value[i]
		const new_value			= self.build_value(i)

	// compares new and old full values by property
		let equal = true
		for(const prop in new_value) {
			if (!original_value[prop] || original_value[prop]!==new_value[prop]) {
				equal = false
				break
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
const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// DOM fragment
		const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit' || mode==='edit_in_list') { // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				parent			: fragment
			})
			button_add_input.addEventListener('click', function(e) {
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
			})
		}

	// buttons tools
		if (!is_inside_tool) {
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
