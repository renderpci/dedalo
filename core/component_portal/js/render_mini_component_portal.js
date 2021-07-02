/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_MINI_COMPONENT_PORTAL
* Manages the component's logic and apperance in client side
*/
export const render_mini_component_portal = function() {

	return true
};//end render_mini_component_portal



/**
* MINI
* Render node for use in list
* @return DOM node wrapper
*/
render_mini_component_portal.prototype.mini = async function() {

	const self = this

	const ar_section_record = await self.get_ar_instances()

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			const child_item = await ar_section_record[i].render()			
			wrapper.appendChild(child_item)
		}

	return wrapper
};//end  mini



