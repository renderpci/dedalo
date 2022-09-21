/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {
		// render_column_remove,
		activate_autocomplete,
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
* Render node for use in search
* @param object options
* @return DOM node wrapper
*/
render_search_component_portal.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'


	// columns_map
		const columns_map = rebuild_columns_map(self)
		self.columns_map = columns_map


	// content_data. Note that function build_content_data is imported from edit mode
		const content_data = await build_content_data(self)
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
		wrapper.addEventListener('click', function() {
			activate_autocomplete(self, wrapper)
			// .then(function(){
				// if (e.target.matches('input[type="text"].q_operator')) {
				// 	// prevent activate component on click inside q_operator input
				// 	return true
				// }
				// self.autocomplete.search_input.focus()
			// })
		})


	return wrapper
}//end search



/**
* BUILD_CONTENT_DATA
* Used too in search mode
* @return DOM node content_data
*/
export const build_content_data = async function(self) {

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
		input_q_operator.addEventListener('change', function(){
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

		const ar_section_record = await self.get_ar_instances({mode:'list'})

		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

		const ar_section_record_length = ar_section_record.length
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

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

	return content_data
}//end build_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// // column section_id check
	// 	columns_map.push({
	// 		id			: 'section_id',
	// 		label		: 'Id',
	// 		width 		: 'auto',
	// 		callback	: render_edit_view_line.render_column_id
	// 	})


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
				callback	: render_column_remove // self.render_column_remove
			})
		}

	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_REMOVE
* Render column_remov node
* Shared across views
* @param object options
* @return DOM DocumentFragment
*/
const render_column_remove = function(options) {

	// options
		const self				= options.caller
		// const row_key		= options.row_key
		// const paginated_key	= options.paginated_key
		// const section_id		= options.section_id
		// const section_tipo	= options.section_tipo
		// const locator		= options.locator

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

					self.refresh()
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
