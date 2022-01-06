/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {tr} from '../../common/js/tr.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_MINI_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_mini_component_text_area = function() {

	return true
};//end render_mini_component_text_area



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_mini_component_text_area.prototype.mini = async function() {

	const self = this

	// short vars
		const data	= self.data
		const value	= data.value || []

	// Value as string
		const value_string = tr.add_tag_img_on_the_fly( value.join(self.divisor) )

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
};//end mini


