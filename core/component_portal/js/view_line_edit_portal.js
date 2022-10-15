/*global get_label, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {
		render_column_component_info,
		activate_autocomplete,
		get_buttons,
		render_references
	} from './render_edit_component_portal.js'



/**
* VIEW_LINE_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_line_edit_portal = function() {

	return true
}//end view_line_edit_portal




/**
* RENDER
* Manages the component's logic and appearance in client side
* @param component_portal instance self
* @param object options
* @return promise
* 	DOM node wrapper
*/
view_line_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= rebuild_columns_map(self)
		self.columns_map	= columns_map

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

	// ar_section_record
		const ar_section_record	= await self.get_ar_instances({
			mode	: 'list',
			view	: children_view
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		wrapper.classList.add('portal')
		// set pointers
		wrapper.content_data = content_data

	// autocomplete
		wrapper.addEventListener('click', function() {
			activate_autocomplete(self, wrapper)
		})


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
			width 		: 'auto',
			callback	: view_line_edit_portal.render_column_id
		})


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
		if (self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width 		: 'auto',
				callback	: view_line_edit_portal.render_column_remove
			})
		}

	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
view_line_edit_portal.render_column_id = function(options){

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit button_view_' + self.context.view,
			parent			: fragment
		})
		button_edit.addEventListener('click', function(e) {
			e.stopPropagation()

			// user navigation
				// const user_navigation_rqo = {
				// 	caller_id	: self.id,
				// 	source		: {
				// 		action			: 'search',
				// 		model			: 'section',
				// 		tipo			: section_tipo,
				// 		section_tipo	: section_tipo,
				// 		mode			: 'edit',
				// 		lang			: self.lang
				// 	},
				// 	sqo : {
				// 		section_tipo		: [{tipo : section_tipo}],
				// 		filter				: null,
				// 		limit				: 1,
				// 		filter_by_locators	: [{
				// 			section_tipo	: section_tipo,
				// 			section_id		: section_id,
				// 		}]
				// 	}
				// }
				// event_manager.publish('user_navigation', user_navigation_rqo)
			// open a new window
				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					id				: section_id,
					mode			: 'edit',
					menu			: false
				})
				const new_window = open_window({
					url		: url,
					name	: 'record_view',
					width	: 1280,
					height	: 740
				})
				new_window.addEventListener('blur', function() {

					// refresh. Get the proper element to refresh based on some criteria.
					// Note that portals in text view are not self refresh able
						function get_edit_caller(instance) {
							if(instance.caller && instance.caller.mode==='edit' && instance.caller.type==='component') {
								return instance.caller
							}else if(instance.caller) {
								return get_edit_caller(instance.caller)
							}
							return self
						}
						const edit_caller = get_edit_caller(self)
						if (edit_caller) {
							edit_caller.refresh({
								build_autoload : true
							})
						}
				})
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button pen icon grey',
			parent			: button_edit
		})


	return fragment
}//end render_column_id



/**
* RENDER_COLUMN_REMOVE
* Render column_remov node
* Shared across views
* @param object options
* @return DOM DocumentFragment
*/
view_line_edit_portal.render_column_remove = function(options) {

	// options
		const self				= options.caller
		const row_key			= options.row_key
		const paginated_key		= options.paginated_key
		const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const locator		= options.locator

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_remove'
		})
		button_remove.addEventListener('click', function(e) {
			e.stopPropagation()

			// stop if the user don't confirm
				if (!confirm(get_label.sure)) {
					return
				}

			// unlink_record
				const unlink_record = function() {
					// changed_data
					const changed_data = [Object.freeze({
						action	: 'remove',
						key		: paginated_key,
						value	: null
					})]
					// change_value (implies saves too)
					// remove the remove_dialog it's controlled by the event of the button that call
					// prevent the double confirmation
					self.change_value({
						changed_data	: changed_data,
						label			: section_id,
						refresh			: false,
						remove_dialog	: ()=>{
							return true
						}
					})
					.then(async (response)=>{
						// the user has selected cancel from delete dialog
							if (response===false) {
								// modal. Close modal if isset
								// if (modal) {
								// 	modal.on_close()
								// }
								return
							}

						// update pagination offset
							self.update_pagination_values('remove')

						// refresh
							await self.refresh({
								build_autoload : true // when true, force reset offset
							})

						// check if the caller has active a tag_id
							if(self.active_tag){
								// filter component data by tag_id and re-render content
								self.filter_data_by_tag_id(self.active_tag)
							}

						// event to update the DOM elements of the instance
							event_manager.publish('remove_element_'+self.id, row_key)
					})
				}
				// fire the unlink
				unlink_record()

			// data pagination offset. Check and update self data to allow save API request return the proper paginated data
				const key = parseInt(row_key)
				if (key===0 && self.data.pagination.offset>0) {
					const next_offset = (self.data.pagination.offset - self.data.pagination.limit)
					// set before exec API request on Save
					self.data.pagination.offset = next_offset>0
						? next_offset
						: 0
				}
		})

	// remove_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button delete_bold icon grey',
			parent			: button_remove
		})


	return button_remove
}//end render_column_remove()
