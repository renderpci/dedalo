/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	import {view_default_list_select} from './view_default_list_select.js'
	import {view_mini_list_select} from './view_mini_list_select.js'
	import {view_text_list_select} from './view_text_list_select.js'



/**
* RENDER_LIST_COMPONENT_SELECT
* Manages the component's logic and appearance in client side
*/
export const render_list_component_select = function() {

	return true
}//end render_list_component_select



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_select.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_select.render(self, options)

		case 'text':
			return view_text_list_select.render(self, options)

		case 'default':
		default:
			return view_default_list_select.render(self, options)
	}

	return null
}//end list
