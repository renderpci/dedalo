// import
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'



/**
* VIEW_MINI_INVERSE
* Manage the components logic and appearance in client side
*/
export const view_mini_inverse = function() {

	return true
}//end view_mini_inverse



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_mini_inverse.render = async function(self, options) {

	// short vars
		const data = self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = data.value && data.value[0] && data.value[0].locator
			? data.value[0].locator.from_section_id
			: null

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end mini
