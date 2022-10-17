/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {ui} from '../../common/js/ui.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	import {view_default_edit_section_id} from './view_default_edit_section_id.js'



/**
* RENDER_EDIT_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_edit_component_section_id = function() {

	return true
}//end render_edit_component_section_id



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_section_id.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_section_id.render(self, options)
	}

	return null
}//end edit
