/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const view_default_edit_publication = function() {

	return true
}//end view_default_edit_publication



/**
* RENDER
* Render node for use in edit mode
* @return DOM node wrapper
*/
view_default_edit_publication.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = self.mode==='edit_in_list'
			? null
			: get_buttons(self)

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
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const value = self.data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			button_close : null // set to null to prevent it from being created
		})
		content_data.classList.add('nowrap')

	// build values
		const inputs_value	= (value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render the current value DOM nodes
* @param int i
* 	Value key
* @param object current_value
* 	Current locator value as:
* 	{type: 'dd151', section_id: '1', section_tipo: 'dd64', from_component_tipo: 'rsc20'}
* @param object self
*
* @return DOM element content_value
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// div_switcher
		const div_switcher = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'switcher_publication text_unselectable',
			parent			: content_value
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			value			: JSON.stringify(current_value),
			parent			: div_switcher
		})
		input.addEventListener('change', function() {

			const checked		= input.checked
			const changed_value	= (checked===true)
				? self.data.datalist.filter(item => item.section_id==1)[0].value
				: self.data.datalist.filter(item => item.section_id==2)[0].value

			const changed_data = [Object.freeze({
				action	: 'update',
				key		: i,
				value	: changed_value
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
			.then(()=>{
			// publish the publication locator value. (ex: used to change state of notes tag)
				event_manager.publish('change_publication_value_'+self.id_base, changed_value)
			})
		})
		// set checked from current value
		if (current_value.section_id==1) {
			input.setAttribute('checked', true)
		}

	// switch_label
		ui.create_dom_element({
			element_type	: 'i',
			parent			: div_switcher
		})


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
