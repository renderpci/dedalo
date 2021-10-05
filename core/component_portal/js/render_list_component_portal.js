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
		const ar_promises				= []
		const ar_section_record_length	= ar_section_record.length
		for (let i = 0; i < ar_section_record_length; i++) {

			// sequential mode
				// // section_record node. Await to preserve order
				// const section_record_node = await ar_section_record[i].render()
				// 	// console.log("section_record_node:",section_record_node);
				// 	if (section_record_node) {
				// 		fragment.appendChild(section_record_node)
				// 	}else{
				// 		console.error("Invalid section_record_node:",section_record_node, ar_section_record[i]);
				// 	}

			// parallel mode
				const current_promise = new Promise(function(resolve){
					ar_section_record[i].render()
					.then(function(section_record_node){
						resolve(section_record_node)
					}).catch((errorMsg) => {
						console.error(errorMsg);
					})
				})
				ar_promises.push(current_promise)
		}

		// nodes. Await all nodes are parallel rendered and add to fragment
			await Promise.all(ar_promises).then(function(ar_section_record_node){
				const ar_section_record_node_length = ar_section_record_node.length
				for (let k = 0; k < ar_section_record_node_length; k++) {
					const section_record_node = ar_section_record_node[k]
					if (section_record_node) {
						fragment.appendChild(section_record_node)
					}else{
						console.error("Invalid section_record_node:",section_record_node, ar_section_record_node[k]);
					}
				}
			})

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


