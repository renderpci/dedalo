/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {view_mini_list_publication} from './view_mini_list_publication.js'
	import {view_default_list_publication} from './view_default_list_publication.js'


/**
* RENDER_LIST_COMPONENT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const render_list_component_publication = function() {

	return true
}//end render_list_component_publication



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_publication.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_publication.render(self, options)

		case 'default':
		default:
			return view_default_list_publication.render(self, options)
	}

	return null
}//end list
