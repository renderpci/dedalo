/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEW_text
* Manage the components logic and appearance in client side
*/
export const render_view_text = function() {

	return true
}//end render_view_text



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_view_text.render = async function(self, options) {

	// Options vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = value.join(self.value_separator)

		const text_node = document.createTextNode(value_string)

	return text_node
}//end mini


