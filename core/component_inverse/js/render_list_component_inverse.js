// import
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'


/**
* render_list_component_inverse
* Manage the components logic and appearance in client side
*/
export const render_list_component_inverse = function() {

	return true
}//end render_list_component_inverse



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_inverse.prototype.list = function() {

	const self = this

	// short vars
		const data = self.data || {}
		const value = data.value || []

	// Value as string
		const value_string = value && value[0] && value[0].locator
			? value[0].locator.from_section_id
			: null

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: false,
			value_string	: value_string
		})


	return wrapper
}//end list
