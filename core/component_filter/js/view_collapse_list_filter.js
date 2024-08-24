// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_COLLAPSE_LIST_FILTER
* Manage the components logic and appearance in client side
*/
export const view_collapse_list_filter = function() {

	return true
}//end view_collapse_list_filter



/**
* RENDER
* Render node for use in current view
* @return HTMLElement wrapper
*/
view_collapse_list_filter.render = async function(self, options) {

	// short vars
		const data			= self.data
		const value			= data.value || []
		const value_string	= (self.section_tipo==='dd542')
			? value.join('<br>') // activity case
			: value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.classList.add('collapsed')
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			wrapper.classList.toggle('collapsed')

			// propagate to siblings
				const section_record = wrapper.parentNode.parentNode
				const elements_collapsed = section_record.querySelectorAll('.view_collapse')
				const elements_collapsed_length = elements_collapsed.length
				for (let i = 0; i < elements_collapsed_length; i++) {
					const item = elements_collapsed[i]
					if (item!==wrapper) {
						item.classList.toggle('collapsed')
					}
				}
		})


	return wrapper
}//end render



// @license-end
