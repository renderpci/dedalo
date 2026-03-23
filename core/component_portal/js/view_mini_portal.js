// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* Render node for use in this view
* @param object self
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
		wrapper.classList.add('portal', 'view_mini')

	// add all nodes
		const length = ar_section_record.length
		if (length > 0) {
			const fragment = new DocumentFragment()
			const rendered_nodes = await Promise.all(ar_section_record.map(rec => rec.render()))
			for (let i = 0; i < length; i++) {
				if (rendered_nodes[i]) {
					fragment.appendChild(rendered_nodes[i])
				}
			}
			wrapper.appendChild(fragment)
		}

	return wrapper
}//end render



// @license-end
