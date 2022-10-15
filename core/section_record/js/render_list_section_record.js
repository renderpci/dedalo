/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_section_record} from './view_default_list_section_record.js'
	import {view_mini_section_record} from './view_mini_section_record.js'
	import {view_text_section_record} from './view_text_section_record.js'


/**
* RENDER_LIST_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_list_section_record = function() {

	return true
}//end render_list_section_record



/**
* LIST
* Render node for use in list with all columns and rendered components
* @param array ar_instances
* @return Promise DOM node wrapper
*/
render_list_section_record.prototype.list = async function(options={}) {

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
			return view_default_list_section_record.render(self, options)
	}

	return null
}//end render_list_section_record.prototype.list
