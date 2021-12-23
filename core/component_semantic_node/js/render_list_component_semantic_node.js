/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_LIST_Component_semantic_node
* Manages the component's logic and appearance in client side
*/
export const render_list_component_semantic_node = function() {

	return true
};//end render_list_component_semantic_node



/**
* LIST
* Render component node to use in list
* @return DOM node wrapper
*/
render_list_component_semantic_node.prototype.list = async function() {

	const self = this

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		// const fallback			= self.get_fallback_value(value, fallback_value)
		// const value_string		= fallback.join(self.divisor)

	console.log("self.data---------------:",self.data);
	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload		: false,
			value_string	: JSON.stringify(data.value)
		})


	return wrapper
};//end list


