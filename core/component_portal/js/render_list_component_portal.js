/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {view_autocomplete} from './view_autocomplete.js'
	// import {flat_column_items} from '../../common/js/common.js'
	import {render_edit_component_portal} from '../../component_portal/js/render_edit_component_portal.js'



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
	// render_list_component_portal.prototype.list = async function() {

	// 	const self = this

	// 	// build all section_record instances
	// 		const ar_section_record = await self.get_ar_instances()

	// 	const fragment = new DocumentFragment();

	// 	// add all section_record nodes
	// 		const ar_promises				= []
	// 		const ar_section_record_length	= ar_section_record.length
	// 		for (let i = 0; i < ar_section_record_length; i++) {

	// 			// sequential mode
	// 				// // section_record node. Await to preserve order
	// 				// const section_record_node = await ar_section_record[i].render()
	// 				// 	// console.log("section_record_node:",section_record_node);
	// 				// 	if (section_record_node) {
	// 				// 		fragment.appendChild(section_record_node)
	// 				// 	}else{
	// 				// 		console.error("Invalid section_record_node:",section_record_node, ar_section_record[i]);
	// 				// 	}

	// 			// parallel mode
	// 				const current_promise = new Promise(function(resolve){
	// 					ar_section_record[i].render()
	// 					.then(function(section_record_node){
	// 						resolve(section_record_node)
	// 					}).catch((errorMsg) => {
	// 						console.error(errorMsg);
	// 					})
	// 				})
	// 				ar_promises.push(current_promise)
	// 		}

	// 		// nodes. Await all nodes are parallel rendered and add to fragment
	// 			await Promise.all(ar_promises).then(function(ar_section_record_node){
	// 				const ar_section_record_node_length = ar_section_record_node.length
	// 				for (let k = 0; k < ar_section_record_node_length; k++) {
	// 					const section_record_node = ar_section_record_node[k]
	// 					if (section_record_node) {
	// 						fragment.appendChild(section_record_node)
	// 					}else{
	// 						console.error("Invalid section_record_node:",section_record_node, ar_section_record_node[k]);
	// 					}
	// 				}
	// 			})

	// 	// events
	// 		// dblclick
	// 			// wrapper.addEventListener("dblclick", function(e){
	// 			// 	// e.stopPropagation()
	// 			//
	// 			// 	// change mode
	// 			// 	self.change_mode('edit_in_list', true)
	// 			// })

	// 	// wrapper
	// 		const wrapper = ui.component.build_wrapper_list(self, {
	// 			autoload : false
	// 		})

	// 	// CSS

	// 	wrapper.appendChild(fragment)

	// 	return wrapper
	// };//end  list




/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
// render_list_component_portal.prototype.list = render_edit_component_portal.prototype.edit
render_list_component_portal.prototype.list = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// view
		const view	= self.view || null


	const wrapper = (async ()=>{

		switch(view) {

			case 'view_autocomplete99':
				return view_autocomplete(self, options)

			default:
				// reset service state portal_active
					// self.portal_active = false

				const ar_section_record	= await self.get_ar_instances()

				// content_data
					const content_data = await get_content_data(self, ar_section_record)
					if (render_level==='content') {
						return content_data
					}

				// columns_map
					const columns_map = await self.columns_map

				const fragment = new DocumentFragment()

				// list_body
					const list_body = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'list_body',
						parent			: fragment
					})
					// const items				= flat_column_items(columns_map)
					// const template_columns	= `auto ${items.join(' ')}`
					// const template_columns = `repeat(${columns_map.length}, 1fr)`
					// flat columns create a sequence of grid widths taking care of sub-column space
					// like 1fr 1fr 1fr 3fr 1fr
					const items				= ui.flat_column_items(columns_map)
					const template_columns	= `${items.join(' ')}`
					Object.assign(
						list_body.style,
						{
							"grid-template-columns": template_columns
						}
					)

				// header
					// const list_header_node = build_header(columns_map, ar_section_record, self)
					// const list_header_node = ui.render_list_header(columns_map, self, false)
					// list_body.appendChild(list_header_node)

				// content_data append
					list_body.appendChild(content_data)

				// wrapper. ui build_edit returns component wrapper
					// const _wrapper = ui.component.build_wrapper_edit(self, {
					// 	// autoload	: false,
					// 	// buttons		: buttons,
					// 	list_body	: list_body
					// 	// top		: top
					// })
					// _wrapper.classList.add("portal")

				// wrapper
					const _wrapper = ui.create_dom_element({
						element_type	: 'div',
						id				: self.id,
						//class_name	: self.model + ' ' + self.tipo + ' ' + self.mode
						class_name		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' portal ' + self.mode
					})
					_wrapper.appendChild(fragment)

				// events
					// add_events(self, _wrapper)

				return _wrapper;
		}//end switch(view)
	})()


	return wrapper
};//end list



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @return DOM node content_data
*/
const get_content_data = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length	= ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case
			// const row_item = no_records_node()
			// fragment.appendChild(row_item)
		}else{

			const ar_promises = []
			for (let i = 0; i < ar_section_record_length; i++) {
				const render_promise = ar_section_record[i].render()
				ar_promises.push(render_promise)
			}
			await Promise.all(ar_promises).then(function(values) {
			  for (let i = 0; i < ar_section_record_length; i++) {

				const section_record = values[i]

				fragment.appendChild(section_record)
			  }
			});
		}//end if (ar_section_record_length===0)

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data


