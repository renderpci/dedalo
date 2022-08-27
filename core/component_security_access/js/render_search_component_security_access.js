/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const render_search_component_security_access = function() {

	return true
}//end render_search_component_security_access



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_security_access.prototype.search = async function() {

	const self 	= this

	const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.id = self.id

	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const value		= self.data.value
	const datalist	= self.data.datalist

	const fragment = new DocumentFragment()

	const input = ui.create_dom_element({
		element_type	: 'span',
		class_name		: '',
		inner_html		: 'Working here! (search mode)',
		parent			: fragment
	})
	input.addEventListener('change', function() {
	})

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data
