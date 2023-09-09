// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_COMPONENT_EXTERNAL
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_component_external = function() {

	return true
}//end view_default_edit_component_external



/**
* RENDER
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
view_default_edit_component_external.render = async function(self, options)  {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const value_string		= value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
