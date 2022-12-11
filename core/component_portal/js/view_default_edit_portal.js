/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL,Promise */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		activate_autocomplete,
		build_header,
		render_references
	} from './render_edit_component_portal.js'



/**
* VIEW_DEFAULT_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_default_edit_portal = function() {

	return true
}//end view_default_edit_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
*/
view_default_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// reset service state portal_active
		// self.portal_active = false

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record
		const ar_section_record	= await self.get_ar_instances({
			mode : 'list'
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			// show header_wrapper_list if is hidden
				if (ar_section_record.length>0) {
					// self.node.querySelector(":scope >.list_body>.header_wrapper_list").classList.remove('hide')
					self.node.list_body.querySelector(":scope >.header_wrapper_list").classList.remove('hide')
				}
			return content_data
		}

	// header
		const list_header_node = build_header(columns_map, ar_section_record, self)

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body'
		})

		// const n_columns = list_header_node.children.length
		// // id (auto), repeat x columns, delete (25px)
		// const template_columns = (self.permissions>1)
		// 	? "auto repeat("+(n_columns-2)+", 1fr) auto"
		// 	: "auto repeat("+(n_columns-1)+", 1fr)"

		const items				= ui.flat_column_items(columns_map);
		const template_columns	= items.join(' ')
		// old way inline
			// Object.assign(
			// 	list_body.style,
			// 	{
			// 		"grid-template-columns": template_columns
			// 	}
			// )
		// new way on-the-fly css
			const css_object = {
				".list_body" : {
					"grid-template-columns" : template_columns
				}
			}
			const selector = `${self.section_tipo}_${self.tipo}.edit.view_${self.view}`
			set_element_css(selector, css_object)

		list_body.appendChild(list_header_node)
		list_body.appendChild(content_data)

	// buttons
		const buttons = get_buttons(self)

	// top
		// const top = get_top(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			buttons		: buttons,
			list_body	: list_body
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)

	// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// autocomplete
		wrapper.addEventListener('click', function() {
			activate_autocomplete(self, wrapper)
		})


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @param object self
* @param array ar_section_record
* @return HTMLelement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// content_data node
		const content_data = ui.component.build_content_data(self)

		// section_record. Add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				// const row_item = no_records_node()
				// fragment.appendChild(row_item)
			}else{

				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record	= ar_section_record[i]
					// const section_id		= section_record.section_id
					// const section_tipo	= section_record.section_tipo

					// section_record wrapper
						// const row_wrapper = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'row_wrapper section_record ' + ' ' + self.tipo + ' ' + self.mode + (self.mode==='tm' ? ' list' : '')
						// })
						// row_wrapper.addEventListener("click", (e) => {
						// 	// e.stopPropagation()
						// 	if (!e.target.classList.contains("row_active")) {
						// 		e.target.classList.add("row_active")
						// 	}
						// })

					// section_record NODE
						// const row_container = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'section_record_container',
						// 	parent			: row_wrapper
						// })
						const section_record_node = await section_record.render()
						// set the pointer
						content_data[i] = section_record_node
					// button_remove
						// if (self.permissions>1) {
						// 	const column = ui.create_dom_element({
						// 		element_type	: 'div',
						// 		class_name		: 'column remove_column',
						// 		parent			: row_wrapper
						// 	})
						// 	ui.create_dom_element({
						// 		element_type	: 'span',
						// 		class_name		: 'button remove',
						// 		dataset			: { key : i },
						// 		parent			: column
						// 	})
						// }

					// section record
						fragment.appendChild(section_record_node)
				}
			}//end if (ar_section_record_length===0)

		// references. Build references if exists
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

		// add fragment
			content_data.appendChild(fragment)


	// set node only when it is in DOM (to save browser resources)
		// const observer = new IntersectionObserver(async function(entries) {
		// 	const entry = entries[1] || entries[0]
		// 	if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
		// 		observer.disconnect();
		// 		const fragment = await build_values()
		// 		content_data.appendChild(fragment)
		// 	}
		// }, { threshold: [0] });
		// observer.observe(content_data);


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width 		: 'auto',
			callback	: render_column_id
		})

	// base_columns_map
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// column component_info check
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// button_remove
		columns_map.push({
			id			: 'remove',
			label		: '', // get_label.delete || 'Delete',
			width 		: 'auto',
			callback	: render_column_remove
		})


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @return DocumentFragment
*/
	// view_default_edit_portal.render_column_id = function(options){

	// 	// options
	// 		const self			= options.caller
	// 		const section_id	= options.section_id
	// 		const section_tipo	= options.section_tipo

	// 	const fragment = new DocumentFragment()

	// 	// section_id
	// 		ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'section_id',
	// 			text_content	: section_id,
	// 			parent			: fragment
	// 		})

	// 	// edit_button
	// 		const edit_button = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'button edit',
	// 			parent			: fragment
	// 		})
	// 		edit_button.addEventListener("click", function(){
	// 			const user_navigation_rqo = {
	// 				caller_id	: self.id,
	// 				source		: {
	// 					action			: 'search',
	// 					model			: 'section',
	// 					tipo			: section_tipo,
	// 					section_tipo	: section_tipo,
	// 					mode			: 'edit',
	// 					lang			: self.lang
	// 				},
	// 				sqo : {
	// 					section_tipo		: [{tipo : section_tipo}],
	// 					filter				: null,
	// 					limit				: 1,
	// 					filter_by_locators	: [{
	// 						section_tipo	: section_tipo,
	// 						section_id		: section_id,
	// 					}]
	// 				}
	// 			}
	// 			event_manager.publish('user_navigation', user_navigation_rqo)
	// 		})

	// 	return fragment
	// }// end render_column_id()



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
	// const get_input_element = function(current_section_record){

	// 	 // key. when portal is in search mode, is undefined, fallback to zero
	// 	const key = current_section_record.paginated_key || 0

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			dataset			: { key : key }
	// 		})

	// 	// input field
	// 		current_section_record.render()
	// 		.then(function(section_record_node){

	// 			// section_record_node append
	// 				li.appendChild(section_record_node)

	// 			// button remove
	// 				const button_remove = ui.create_dom_element({
	// 					element_type	: 'span',
	// 					class_name		: 'button remove',
	// 					dataset			: { key : key },
	// 					parent			: li
	// 				})
	// 		})


	// 	return li
	// }//end get_input_element



/**
* GET_INPUT_ELEMENT_AWAIT
* @return dom element li
*/
	// const get_input_element_await = async function(current_section_record){

	// 	 // key. when portal is in search mode, is undefined, fallback to zero
	// 	const key = current_section_record.paginated_key || 0

	// 	// li
	// 		const li = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			dataset			: { key : key }
	// 		})

	// 	// input field
	// 		const section_record_node = await current_section_record.render()
	// 		// section_record_node append
	// 			li.appendChild(section_record_node)
	// 		// button remove
	// 			const button_remove = ui.create_dom_element({
	// 				element_type	: 'span',
	// 				class_name		: 'button remove',
	// 				dataset			: { key : key },
	// 				parent			: li
	// 			})


	// 	return li
	// }//end get_input_element_await
