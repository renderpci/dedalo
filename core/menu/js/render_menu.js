// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_menu} from './view_default_edit_menu.js'



/**
* RENDER_MENU
* Manages the element's logic and appearance in client side
*/
export const render_menu = function() {

	return true
}//end render_menu



/**
* EDIT
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_menu.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'


	switch(view) {

		case 'default':
		default:
			// full with wrapper, label, buttons and content_data
			return view_default_edit_menu.render(self, options)
	}
}//end edit



/**
* RENDER_SECTION_LABEL
* @param object self
* @return HTMLElement section_label
*/
export const render_section_label = function(self) {

	const section_label = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'section_label top_item inactive',
		title			: get_label.seccion || 'Section'
	})

	return section_label
}//end render_section_label



// @license-end
