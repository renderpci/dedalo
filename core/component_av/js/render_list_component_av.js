/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	// import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	// import {object_to_url_vars} from '../../common/js/utils/index.js'
	import {render_view_column} from './render_view_column.js'
	import {render_view_mini} from './render_view_mini.js'



/**
* RENDER_LIST_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_list_component_av = function() {

	return true
}//end  render_list_component_av



/**
* LIST
* Render node for use in modes: list
* @return DOM node wrapper
*/
render_list_component_av.prototype.list = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return render_view_mini.render(self, options)

		case 'column':
		case 'default':
		default:
			return render_view_column.render(self, options)
	}

	return null
}//end list
