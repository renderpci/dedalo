/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	// import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {render_list_view_default} from './render_list_view_default.js'
	import {render_list_view_mosaic} from './render_list_view_mosaic.js'


/**
* RENDER_LIST_COMPONENT_IMAGE
* Manage the components logic and appearance in client side
*/
export const render_list_component_image = function() {

	return true
}//end render_list_component_image



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_image.prototype.list = function(options) {

	const self = this

	// options
		// const render_level = options.render_level

	// view
		const view	= self.context.view || 'table'

	// wrapper
		let wrapper
		switch(view) {

			case 'mosaic':
				wrapper = render_list_view_mosaic.render(self, options)
				break;


			case 'default':
			default:
				wrapper = render_list_view_default.render(self, options)
				break;
		}

	return wrapper
}//end list
