/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_PORTAL
* Manages the component's logic and appearance in client side
*/
export const view_mini_portal = function() {

	return true
}//end view_mini_portal



/**
* RENDER
* Render node for use in list
* @return HTMLElement wrapper
*/
view_mini_portal.render = async function(self) {

	// ar_section_record
		const children_view	= self.context.children_view || self.context.view || 'text'

		const ar_section_record	= await get_section_records({
			caller	: self,
			view	: children_view
		})
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