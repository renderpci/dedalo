/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {ui} from '../../common/js/ui.js'
	import {view_mini_section_id} from './view_mini_section_id.js'
	import {view_default_list_section_id} from './view_default_list_section_id.js'



/**
* RENDER_LIST_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_list_component_section_id = function() {

	return true
}//end render_list_component_section_id



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_section_id.prototype.list = function() {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_section_id.render(self, options)

		case 'default':
		default:
			return view_default_list_section_id.render(self, options)
	}

	return null
}//end list
