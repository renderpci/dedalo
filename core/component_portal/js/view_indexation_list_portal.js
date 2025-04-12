// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'

/**
* VIEW_INDEXATION_LIST_PORTAL
* Manages the component's logic and appearance in client side
*/
export const view_indexation_list_portal = function() {

	return true
}//end view_indexation_list_portal



/**
* RENDER
* Render node as text view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_indexation_list_portal.render = async function(self, options) {

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_list(self)
		wrapper.classList.add('portal')

	// get the value of the total records
		const value_string	= self.data?.pagination?.total || null

		if(!value_string){
			return wrapper
		}

	// create the content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string,
			parent			: wrapper
		})


	return wrapper
}//end render



// @license-end
