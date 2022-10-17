/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_edit
	}
	from './view_default_edit_info.js'


/**
* VIEW_DEFAULT_LIST_INFO
* Manages the component's logic and appearance in client side
*/
export const view_default_list_info = function() {

	return true
}//end view_default_list_info



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
view_default_list_info.render = async function(self, options) {

	// widgets load
		await self.get_widgets()

	// short vars
		const content_data = get_content_data_edit(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {

		})

	// Set value
		wrapper.appendChild(content_data)


	return wrapper
}//end list
