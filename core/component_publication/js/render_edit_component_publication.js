/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const render_edit_component_publication = function() {

	return true
};//end render_edit_component_publication



/**
* EDIT
* Render node for use in edit mode
* @return DOM node wrapper
*/
render_edit_component_publication.prototype.edit = async function(options={render_level : 'full'}) {

	const self = this

	// options
		const render_level = options.render_level

	// content_data
		const content_data = get_content_data(self)
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

	// add events
		add_events(self, wrapper)


	return wrapper
};//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {
	// events delegated

	// change
		wrapper.addEventListener("change", e => {
			// e.stopPropagation()

			if (e.target.matches('input[type="checkbox"]')) {

				// selected_node. fix selected node
				self.selected_node = wrapper

				const input			= e.target
				const checked		= input.checked
				const changed_value	= (checked===true)
					? self.data.datalist.filter(item => item.section_id==1)[0].value
					: self.data.datalist.filter(item => item.section_id==2)[0].value

				const changed_data = Object.freeze({
					action	: 'update',
					key		: 0,
					value	: changed_value
				})
				self.change_value({
					changed_data	: changed_data,
					// label		: e.target.nextElementSibling.textContent,
					refresh			: false
				})

				return true
			}
		})

	// click event
		wrapper.addEventListener("click", e => {
			e.stopPropagation()

			// change_mode
				if (e.target.matches('.button.close')) {
					//change mode
					self.change_mode('list', true)

					return true
				}
		})

	// focus event
		wrapper.addEventListener("focus", e => {
			// e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="checkbox"]')) {
			 	event_manager.publish('active_component', self)

			 	return true
			}
		})

	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// Options vars
	const value				= self.data.value || []
	// const is_inside_tool	= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs_container
		// const inputs_container = ui.create_dom_element({
		// 	element_type	: 'ul',
		// 	class_name 		: 'inputs_container',
		// 	parent 			: fragment
		// })

	// build values
		const inputs_value = (value.length<1) ? [""] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element = get_input_element(i, inputs_value[i])
			fragment.appendChild(input_element)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
};//end get_buttons



/**
* GET_INPUT_ELEMENT
* @return DOM element div_switcher
*/
const get_input_element = (i, current_value) => {

	// div_switcher
		const div_switcher = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'switcher_publication text_unselectable'
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			// class_name	: 'ios-toggle',
			// id			: input_id,
			dataset			: { key : i },
			value			: JSON.stringify(current_value),
			parent			: div_switcher
		})
		// set checked from current value
		if (current_value.section_id==1) {
			input.setAttribute("checked", true)
		}

	// switch_label
		ui.create_dom_element({
			element_type	: 'i',
			// class_name	: 'checkbox-label',
			parent			: div_switcher
		})


	return div_switcher
};//end get_input_element


