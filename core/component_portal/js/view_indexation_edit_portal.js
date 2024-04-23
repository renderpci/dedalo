// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, Promise, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	import {instances} from '../../common/js/instances.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	// import {select_tag} from '../../component_text_area/js/view_default_edit_text_area.js'
	import {
		render_column_component_info,
		render_column_remove,
		render_references,
		get_buttons
	} from './render_edit_component_portal.js'



/**
* VIEW_INDEXATION_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_indexation_edit_portal = function() {

	return true
}//end view_indexation_edit_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
* @param component_portal instance self
* @param object options
* @return promise
* 	DOM node wrapper
*/
view_indexation_edit_portal.render = async function(self, options) {

	// prevents to load autocomplete service
		self.autocomplete = false

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		self.columns_map = await rebuild_columns_map(self)

	// value_combined (grouped by tag id)
		const data				= self.data || {}
		const value				= data.value || []
		const value_combined	= []
		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {
			const item = value[i]
			const found = value_combined.find(el => el.section_tipo===item.section_tipo && el.section_id===item.section_id)
			if (!found) {
				value_combined.push(item)
			}
		}

	// ar_section_record
		const id_variant = self.active_tag && self.active_tag.tag
			? self.id_variant + '_' + self.active_tag.tag.tag_id
			: self.id_variant + '_' + (new Date()).getTime()

		const ar_section_record	= await get_section_records({
			caller		: self,
			mode		: 'list',
			columns_map	: self.columns_map,
			value		: value_combined,
			id_variant	: id_variant
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// ! configure interface to avoid display modal button_delete_link_and_record
		self.show_interface.button_delete_link_and_record = false
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		wrapper.classList.add(
			'portal',
			'view_indexation'
		)
		// set pointers
		wrapper.content_data = content_data


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

					// sort values alphabetically
						values.sort((a,b)=>a.innerText>b.innerText?1:-1)

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

	// active_tag
		if (self.active_tag) {
			const list_footer =  ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_footer',
				parent			: fragment
			})
			const button_remove_filter = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary button_remove_filter icon eye',
				inner_html		: get_label.remove_filter || 'Remove filter',
				parent			: list_footer
			})
			const fn_click = function(e) {
				e.stopPropagation()
				// reset filter
				self.reset_filter_data()
			}
			button_remove_filter.addEventListener('click', fn_click)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return array columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// section_id column add
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
			callback	: render_column_id
		})

	// regular columns add
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// tag column add
		columns_map.push({
			id			: 'tag',
			label		: 'Tag',
			width		: 'auto',
			callback	: render_tag_column
		})

	// ddinfo. column_component_info column add
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// info. render_info_column column add
		const info_node = columns_map.push({
			id			: 'info',
			label		: 'Info',
			callback	: render_info_column
		})

	// button_remove column add (Moved to inside render_info_column for readability)
		// if (self.permissions>1) {
		// 	columns_map.push({
		// 		id			: 'remove',
		// 		label		: '', // get_label.delete || 'Delete',
		// 		width		: 'auto',
		// 		callback	: render_column_remove
		// 	})
		// }

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
const render_column_id = function(options) {

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit',
			title_label		: get_label.open || 'Open',
			parent			: fragment
		})
		button_edit.addEventListener('click', function(){

			// open in new window
			const url = DEDALO_CORE_URL + '/page/?tipo='+section_tipo+'&id='+section_id+'&menu=false'
			window.open(
				url,
				'edit_window',
				'menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes'
			)

			// DES navigation
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
		})

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit icon',
			parent			: button_edit
		})


	return fragment
}//end render_column_id



/**
* RENDER_TAG_COLUMN
* @param object options
* @return HTMLElement DocumentFragment
*/
const render_tag_column = function(options) {

	// options
		const locator		= options.locator
		const caller		= options.caller
		const data			= caller.data || {}
		const value			= data.value || []
		const value_tags	= value.filter(el => el.section_tipo===locator.section_tipo && el.section_id==locator.section_id)
		// const value_tags	= [locator]

	const self = caller

	const fragment = new DocumentFragment()

	// add a tag for each value
		const value_tags_length = value_tags.length
		for (let i = 0; i < value_tags_length; i++) {

			const current_locator = value_tags[i]

			if (!current_locator.tag_id) {
				console.warn('Ignored non tag_id locator:', current_locator);
				continue;
			}

			const tag_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tags',
				inner_html		: current_locator.tag_id || null,
				parent			: fragment
			})
			tag_node.addEventListener('click', function(e) {
				e.stopPropagation()
				e.preventDefault()

				if(SHOW_DEBUG===true) {
					console.log('Clicked tag_id from column:', current_locator.tag_id);
				}

				// tag_component_tipo
					if (!current_locator.tag_component_tipo) {
						// get from properties
						const tag_component_tipo = self.context.properties?.config_relation?.tag_component_tipo
						if (tag_component_tipo) {
							current_locator.tag_component_tipo = tag_component_tipo
							console.warn('WARNING: locator tag_component_tipo is mandatory! Adding auto tag_component_tipo from properties', current_locator);
						}else{
							console.warn('ERROR: locator tag_component_tipo is mandatory! Not received into current locator and unable to get it from properties fallback', self.context.properties);
							return
						}
					}

				// id_base build like rsc167_5_rsc36
					const id_base = [
						caller.section_tipo,
						caller.section_id,
						current_locator.tag_component_tipo
					].join('_')

				// locate component into the global array of instances
					const component = instances.find(el => el.id_base===id_base)
					if (component) {

						// text_area_instance
						const text_area_instance = component

						// get the text_editor (service)
						const text_editor = text_area_instance.text_editor[0]

						// id_base of component_text_area
						const id_base = text_area_instance.id_base

						// tag. Get the tag object selecting the tag into the text_area editor (get the tag attributes)
						// needed to get the tag state, to show the tag info inside the tool_indexation
						const tag = text_editor.get_view_tag_attributes({
							type	: 'indexIn',
							tag_id	: current_locator.tag_id
						})
						// fire the event to select tag
						event_manager.publish('click_tag_index_'+ id_base, {tag: tag})
					}else{
						console.error('Unable to locate component into instances. id_base:', id_base);
					}
			})//end event click
		}


	return fragment
}//end render_tag_column



/**
* RENDER_INFO_COLUMN
* @param object options
* @return HTMLElement DocumentFragment
*/
const render_info_column = function(options) {

	// options
		const locator	= options.locator
		const self		= options.caller

	// short vars
		const section_tipo		= locator.section_tipo
		const target_section	= self.target_section

	const fragment = new DocumentFragment()

	// check vars
		if (!section_tipo || !target_section) {
			return fragment // null
		}

		const found			= target_section.find(el => el.tipo===section_tipo)
		const section_label	= found
			? found.label
			: ''

	// info_node
		const info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'note italic',
			inner_html		: '[' + section_label + ']',
			parent			: fragment
		})

	// remove node (former column_remove)
		if (self.permissions>1) {
			info_node.appendChild(
				render_column_remove(options)
			)
		}


	return fragment
}//end render_info_column



// @license-end
