/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {render_list_view_default} from './render_list_view_default.js'
	import {render_view_mini} from './render_view_mini.js'

/**
* RENDER_LIST_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_list_component_input_text = function() {

	return true
}//end render_list_component_input_text



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_list_component_input_text.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return render_view_mini.render(self, options)

		case 'text':
			return render_view_text.render(self, options)

		case 'default':
		default:
			return render_list_view_default.render(self, options)
	}

	return null
}//end list
