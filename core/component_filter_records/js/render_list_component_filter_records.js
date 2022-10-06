/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_list_component_filter_records
* Manage the components logic and appearance in client side
*/
export const render_list_component_filter_records = function() {

	return true
}//end render_list_component_filter_records



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_filter_records.prototype.list = function() {

	const self = this

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()
			self.change_mode(
				'edit_in_list',
				true // autoload. On true, load data from API when user click to edit_in_list
			)
		})


	return wrapper
}//end list
