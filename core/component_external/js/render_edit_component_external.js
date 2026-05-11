// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_component_external} from './view_default_edit_component_external.js'



/**
* RENDER_EDIT_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_external = function() {

	return true
}//end render_edit_component_external



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_external.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
		case 'line':

		case 'print':
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_component_external.render(self, options)
	}
}//end edit



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

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){
			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			// click event
			const click_handler = (e) => {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			}
			button_fullscreen.addEventListener('click', click_handler)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
