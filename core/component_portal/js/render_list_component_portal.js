/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {view_autocomplete} from './view_autocomplete.js'



/**
* RENDER_LIST_COMPONENT_PORTAL
* Manages the component's logic and appearance in client side
*/
export const render_list_component_portal = function() {

	return true
};//end render_list_component_portal




/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_portal.prototype.list = async function() {

	const self = this

	// build all section_record instances
		const ar_section_record = await self.get_ar_instances()

	const fragment = new DocumentFragment();

	// add all section_record nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			// section_record node. Await to preserve order
			const section_record_node = await ar_section_record[i].render()
			fragment.appendChild(section_record_node)
		}
	// events
		// dblclick
			// wrapper.addEventListener("dblclick", function(e){
			// 	// e.stopPropagation()
			//
			// 	// change mode
			// 	self.change_mode('edit_in_list', true)
			// })

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	wrapper.appendChild(fragment)

	return wrapper
};//end  list


