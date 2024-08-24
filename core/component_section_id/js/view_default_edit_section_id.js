// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* VIEW_DEFAULT_EDIT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const view_default_edit_section_id = function() {

	return true
}//end view_default_edit_section_id



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_section_id.render = async function(self, options) {

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
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)

		const selector = `${self.section_tipo}_${self.tipo}.edit`
		set_element_css(selector, {
			".wrapper_component": {
				'background-color' : self.context.color
			},
			".wrapper_component.active": {
				'background-color' : self.context.color
			}
		})

		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* CONTENT_DATA_EDIT
* Note that this component it's editable only in search mode
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// section_id value
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value section_id',
			inner_html		: value,
			parent			: content_data
		})

	return content_data
}//end get_content_data_edit



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
