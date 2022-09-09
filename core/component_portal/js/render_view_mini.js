/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEW_MINI
* Manages the component's logic and appearance in client side
*/
export const render_view_mini = function() {

	return true
}//end render_view_mini



/**
* MINI
* Render node for use in list
* @return DOM node wrapper
*/
render_view_mini.prototype.mini = async function() {

	const self = this

	// ar_section_record
		const ar_section_record = await self.get_ar_instances()
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {
			const child_item = await ar_section_record[i].render()
			wrapper.appendChild(child_item)
		}

	return wrapper
}//end  mini
