// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_PASSWORD
* Manages the component's logic and appearance in client side
*/
export const view_default_list_password = function() {

	return true
}//end view_default_list_password



/**
* RENDER
* Render node for use in list. It shouldn't be use but just in case someone added it to a list the page would work properly
* @return HTMLElement wrapper
*/
view_default_list_password.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const value_string	= value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : '****************'
		})
		wrapper.type = 'password'


	return wrapper
}//end render



// @license-end
