// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_section_record} from './view_default_edit_section_record.js'
	import {view_text_section_record} from './view_text_section_record.js'
	import {view_mini_section_record} from './view_mini_section_record.js'



/**
* RENDER_EDIT_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_edit_section_record = function() {

	return true
}//end render_edit_section_record



/**
* EDIT
* Render the node to use in edit mode using current context view
* @param object options
* @return HTMLElement wrapper
*/
render_edit_section_record.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_section_record.render(self, options)

		case 'text':
			return view_text_section_record.render(self, options)

		case 'default':
		default:
			return view_default_edit_section_record.render(self, options)
	}
}//end edit



// @license-end
