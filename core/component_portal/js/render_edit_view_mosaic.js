/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		add_events,
		render_references
	} from './render_edit_component_portal.js'



/**
* RENDER_EDIT_VIEW_MOSAIC
* Manage the components logic and appearance in client side
*/
export const render_edit_view_mosaic = function() {

	return true
}//end render_edit_view_mosaic



/**
* RENDER_EDIT_VIEW_MOSAIC
* Manages the component's logic and appearance in client side
*/
render_edit_view_mosaic.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// alternative view node with all ddo in table mode
		self.columns_map_full	= JSON.parse(JSON.stringify(self.columns_map))

		const alt_columns_map	= await rebuild_columns_map(self, false)
		self.columns_map		= alt_columns_map
		// list_body
		const alt_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'alt_list_body display_none'
		})
		// close_alt_list_body
		const close_alt_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button close close_alt_list_body',
			parent 			: alt_list_body
		})
		close_alt_list_body.addEventListener('click', function(){
			alt_list_body.classList.add('display_none')
		})

		const alt_ar_section_record	= await self.get_ar_instances({mode:'list'})

		// content_data
		const alternative_table_view =  await get_alternative_table_view(self, alt_ar_section_record, alt_list_body)
		// header
		// build using common ui builder
		const list_header_node = ui.render_list_header(alt_columns_map, self)
		// const list_header_node = build_header(alt_columns_map, alt_ar_section_record, self)
			alt_list_body.appendChild(list_header_node)
			alt_list_body.appendChild(alternative_table_view)

		const alt_items				= ui.flat_column_items(alt_columns_map);
		const alt_template_columns	= alt_items.join(' ')
		Object.assign(
			alt_list_body.style,
			{
				"grid-template-columns": alt_template_columns
			}
		)

	// create the mosaic with only the marked ddo as "mosaic" with true value
		// columns_map
			const columns_map	= await rebuild_columns_map(self, true)
			self.columns_map	= columns_map
			self.id_variant		= 'alt'
		// get the instances for create the mosaic
			const ar_section_record	= await self.get_ar_instances({mode:'list'})
		// content_data
			const content_data = await get_content_data(self, ar_section_record)
			if (render_level==='content') {
				// show header_wrapper_list if is hidden
					if (ar_section_record.length>0) {
						self.node.map(el => {
							el.querySelector(":scope >.list_body>.header_wrapper_list").classList.remove('hide')
						})
					}
				return content_data
			}

		// list_body
			const list_body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_body'
			})

			const items				= ui.flat_column_items(columns_map);
			const template_columns	= items.join(' ')
			Object.assign(
				list_body.style,
				{
					"grid-template-columns": template_columns
				}
			)

			list_body.appendChild(content_data)

	// buttons
		const buttons = get_buttons(self)

	// top
		// const top = get_top(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			// content_data	: content_data,
			buttons			: buttons,
			list_body		: list_body
			// top			: top
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)

		wrapper.appendChild(alt_list_body)

	// events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @return DOM node content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length	= ar_section_record.length
			if (ar_section_record_length===0) {

			}else{
				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record	= ar_section_record[i]

					const section_record_node = await section_record.render()

					section_record_node.addEventListener('mouseup', function(){
							event_manager.publish('mosaic_show_alt_'+section_record_node.id, section_record_node)
					})

					// section record
						fragment.appendChild(section_record_node)

					// image
				}
			}//end if (ar_section_record_length===0)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

	return content_data
}//end get_content_data




/**
* GET_alternative_table_view
* Render all received section records and place it into a new div 'content_data'
* @return DOM node content_data
*/
const get_alternative_table_view = async function(self, ar_section_record, alt_list_body) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length	= ar_section_record.length
			if (ar_section_record_length===0) {

			}else{
				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record	= ar_section_record[i]

					const section_record_node = await section_record.render()
					section_record_node.classList.add('display_none')

					event_manager.subscribe('mosaic_show_alt_'+section_record_node.id+'_alt', mosaic_show_alt)
					function mosaic_show_alt(parent_node) {
						const ar_child_node = section_record_node.parentNode.children;
						const len = ar_child_node.length

						for (var i = len - 1; i >= 0; i--) {
							const node = ar_child_node[i]
							if(node.classList.contains('header_wrapper_list') || node.classList.contains('close_alt_list_body')){
								continue
							}
							node.classList.add('display_none')
						}
						alt_list_body.classList.remove('display_none')
						section_record_node.classList.remove('display_none')
					}

					// section record
						fragment.appendChild(section_record_node)

					// image
				}
			}//end if (ar_section_record_length===0)

		// build references
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

	return fragment
}//end get_alternative_table_view



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self, view_mosaic) {

	const columns_map = []

	if(!view_mosaic){// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width 		: 'auto',
			callback	: render_edit_view_mosaic.render_column_id
		})
	}
	// base_columns_map
		const base_columns_map = view_mosaic
			? await self.columns_map.filter(el => el.mosaic === true)
			: await self.columns_map
		columns_map.push(...base_columns_map)

	if(!view_mosaic){
		// column component_info check
			if (self.add_component_info===true) {
				columns_map.push({
					id			: 'ddinfo',
					label		: 'Info',
					callback	: render_column_component_info
				})
			}

		// button_remove
			if (self.permissions>1) {
				columns_map.push({
					id			: 'remove',
					label		: '', // get_label.delete || 'Delete',
					width 		: 'auto',
					callback	: render_column_remove
				})
			}
	}

	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @return DocumentFragment
*/
	// render_edit_view_mosaic.render_column_id = function(options){

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


