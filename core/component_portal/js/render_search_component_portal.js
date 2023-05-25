// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {
		// render_column_remove,
		activate_autocomplete,
		render_column_component_info
	} from './render_edit_component_portal.js'



/**
* RENDER_SEARCH_COMPONENT_PORTAL
* Manages the component's logic and appearance in client side
*/
export const render_search_component_portal = function() {

	return true
}//end render_search_component_portal



/**
* SEARCH
* Render node for use in search mode
* @param object options
* @return HTMLElement wrapper
*/
render_search_component_portal.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

	// ar_section_record
		const ar_section_record = await get_section_records({
			caller	: self,
			mode	:'list',
			view	: children_view
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await render_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		wrapper.classList.add('portal', 'view_line')
		// set pointers
		wrapper.content_data = content_data

	// autocomplete
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			activate_autocomplete(self, wrapper)
		})


	return wrapper
}//end search



/**
* RENDER_CONTENT_DATA
* @param object self
* @param array ar_section_record
* @return HTMLElement content_data
*/
const render_content_data = async function(self, ar_section_record) {

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})
		input_q_operator.addEventListener('click', function(e){
			e.stopPropagation()
		})
		input_q_operator.addEventListener('change', function(){
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// ar_section_record
		const ar_section_record_length = ar_section_record.length
		for (let i = 0; i < ar_section_record_length; i++) {
			// section_record
			const section_record_node = await ar_section_record[i].render()
			console.log('>> section_record TO RENDER:', ar_section_record[i]);
			fragment.appendChild(section_record_node)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end render_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		// 	columns_map.push({
		// 		id			: 'section_id',
		// 		label		: 'Id',
		// 		width		: 'auto',
		// 		callback	: render_edit_view_line.render_column_id
		// 	})

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
			label		: get_label.delete || 'Delete',
			width		: 'auto',
			callback	: render_column_remove // self.render_column_remove
		})

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_REMOVE
* Render column_remov node
* Shared across views
* @param object options
* @return HTMLElement button_remove
*/
export const render_column_remove = function(options) {
	console.log('))) render_column_remove options:', options);

	// options
		const self				= options.caller
		// const row_key		= options.row_key
		// const paginated_key	= options.paginated_key
		// const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const locator		= options.locator

	// DocumentFragment
		const fragment = new DocumentFragment()

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_remove',
			parent			: fragment
		})
		button_remove.addEventListener('click', function(e){
			e.stopPropagation()

			const unlink_record = function() {
				// changed_data
				const changed_data_item = Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})
				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

					self.refresh({
						// build_autoload : true
					})
			}

			unlink_record()
		})

	// remove_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button delete_light icon',
			parent			: button_remove
		})


	return fragment
}//end render_column_remove()



// @license-end
