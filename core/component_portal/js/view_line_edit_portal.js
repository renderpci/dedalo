// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	import {get_section_records} from '../../section/js/section.js'
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
		self.columns_map = await rebuild_columns_map(self)

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
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
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons,
			// label			: null
		})
		wrapper.classList.add('portal')
		// set pointers
		wrapper.content_data = content_data

	// autocomplete
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			activate_autocomplete(self, wrapper)
		})


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @param object self
* @param array ar_section_record
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

	// button_exit_edit
		// const button_exit_edit = ui.component.build_button_exit_edit(self)
		// fragment.appendChild(button_exit_edit)

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
* Adding control columns to the columns_map that will processed by section_recod
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
			callback	: view_line_edit_portal.render_column_id
		})

	// base_columns_map
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// column component_info
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// column remove
		if ( self.context.properties.source?.mode !== 'external' && self.permissions > 1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: view_line_edit_portal.render_column_remove
			})
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* It is called by section_record to create the column id with custom options
* @param object options
* @return DOM DocumentFragment
*/
view_line_edit_portal.render_column_id = function(options) {

	// options
		const self			= options.caller
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
			// edit_record_handler
			self.edit_record_handler({
				section_tipo	: section_tipo,
				section_id		: section_id,
			})
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			// class_name	: 'button pen icon grey',
			class_name		: 'button edit icon grey',
			parent			: button_edit
		})


	return fragment
}//end render_column_id



/**
* RENDER_COLUMN_REMOVE
* It is called by section_record to create the column remove with custom options
* Render column_remov node
* Shared across views
* @param object options
* @return DocumentFragment
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
		button_remove.addEventListener('click', async function(e) {
			e.stopPropagation()

			// stop if the user don't confirm
				if (!confirm(get_label.sure)) {
					return
				}

			// fire the unlink_record method
				self.unlink_record({
					paginated_key	: paginated_key,
					row_key			: row_key,
					section_id		: section_id
				})

			// delete_dataframe_record
				self.delete_dataframe_record({
					section_id : section_id
				})

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
			class_name		: 'button delete_light icon grey',
			parent			: button_remove
		})


	return button_remove
}//end render_column_remove



// @license-end
