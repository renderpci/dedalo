// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const render_list_component_external = function() {

	return true
}//end render_list_component_external



/**
* MINI
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
render_list_component_external.prototype.list = async function() {

	const self = this

	// short vars
		const data				= self.data || {}
		const value				= data.value || []
		const value_string		= value.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			e.stopPropagation()

			self.change_mode({
				mode : 'edit',
				view : 'line'
			})
		})


	return wrapper
}//end list


// @license-end