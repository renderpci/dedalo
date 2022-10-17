/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {view_default_edit_publication} from './view_default_edit_publication.js'



/**
* RENDER_EDIT_COMPONENT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const render_edit_component_publication = function() {

	return true
}//end render_edit_component_publication



/**
* EDIT
* Render node for use in edit mode
* @return DOM node wrapper
*/
render_edit_component_publication.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'default':
		default:
			return view_default_edit_publication.render(self, options)
	}

	return null
}//end edit
