/*global get_label, SHOW_DEBUG, Promise, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {
		render_column_component_info,
		render_column_remove,
		add_events,
		get_buttons,
		render_references
	} from './render_edit_component_portal.js'



/**
* RENDER_EDIT_VIEW_indexation
* Manage the components logic and appearance in client side
*/
export const render_edit_view_indexation = function() {

	return true
}//end render_edit_view_indexation



/**
* RENDER
* Manages the component's logic and appearance in client side
* @param component_portal instance self
* @param object options
* @return promise
* 	DOM node wrapper
*/
render_edit_view_indexation.render = async function(self, options) {

	// prevent to load autocpmplete service
		self.autocomplete = false

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record
		const ar_section_record	= await self.get_ar_instances({mode:'list'})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.classList.add(
			'portal',
			'view_indexation'
		)

	// events
		add_events(self, wrapper)


	return wrapper
}//end render



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

		// build references
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


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
			width		: 'auto',
			callback	: render_edit_view_indexation.render_column_id
		})

	const base_columns_map = await self.columns_map

	columns_map.push(...base_columns_map)

	// tag column
		columns_map.push({
			id			: 'tag',
			label		: 'Tag',
			width 		: 'auto',
			callback	: (options)=>{
				// console.log('+++++ options:', options);
				// console.log('+++++ self.data.value:', self.data.value);

				// options
					const locator = options.locator

				// tag_id
					const tag_id = locator.tag_id ?? null
					const tag_label = tag_id
						? 'Tag: ' + tag_id
						: ''

				return ui.create_dom_element({
					element_type    : 'div',
					class_name		: 'tags',
					inner_html		: tag_label
				})
			}
		})

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

	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
render_edit_view_indexation.render_column_id = function(options){

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// edit_button
		const edit_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'edit_button',
			parent			: fragment
		})
		edit_button.addEventListener("click", function(){
			const user_navigation_rqo = {
				caller_id	: self.id,
				source		: {
					action			: 'search',
					model			: 'section',
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					mode			: 'edit',
					lang			: self.lang
				},
				sqo : {
					section_tipo		: [{tipo : section_tipo}],
					filter				: null,
					limit				: 1,
					filter_by_locators	: [{
						section_tipo	: section_tipo,
						section_id		: section_id,
					}]
				}
			}
			event_manager.publish('user_navigation', user_navigation_rqo)
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit icon',
			parent			: edit_button
		})


	return fragment
}//end render_column_id
