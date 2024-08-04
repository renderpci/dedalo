// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_SECURITY_ACCESS
* Manages the component's logic and appearance in client side
*/
export const view_default_list_security_access = function() {

	return true
}//end view_default_list_security_access



/**
* RENDER
* Render node for use in list
* @return HTMLElement wrapper
*/
view_default_list_security_access.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		// const value_string = JSON.stringify(value, null, 2)
		const value_string = 'View list unavailable'

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
