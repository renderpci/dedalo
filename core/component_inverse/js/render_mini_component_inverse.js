// import
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'



/**
* RENDER_MINI_COMPONENT_INVERSE
* Manage the components logic and appearance in client side
*/
export const render_mini_component_inverse = function() {

	return true
}//end render_mini_component_inverse



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_inverse.prototype.mini = function() {

	const self = this

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
