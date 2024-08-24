// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_INVERSE
* Manage the components logic and appearance in client side
*/
export const view_default_list_inverse = function() {

	return true
}//end view_default_list_inverse



/**
* RENDER
* Render node for use in list
* @return HTMLElement wrapper
*/
view_default_list_inverse.render = async function(self, options) {

	// short vars
		const data = self.data || {}
		const value = data.value || []

	// Value as string
		const value_string = value && value[0] && value[0].locator
			? value[0].locator.from_section_id
			: null

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
