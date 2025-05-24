// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL,Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		activate_autocomplete,
		build_header,
		render_references
	} from './render_edit_component_portal.js'



/**
* VIEW_CONTENT_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_content_edit_portal = function() {

	return true
}//end view_content_edit_portal



/**
* RENDER
* Manages the component's logic and appearance in client side
* @param object
* 	component instance
* @param object options
* @return HTMLElement wrapper
*/
view_content_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			mode	: 'list'
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
				}else{
					self.node.list_body.querySelector(":scope >.header_wrapper_list").classList.add('hide')
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

		const items				= ui.flat_column_items(columns_map);
		const template_columns	= items.join(' ')

			const css_object = {
				".list_body" : {
					"grid-template-columns" : template_columns
				}
			}
			const selector = `${self.section_tipo}_${self.tipo}.edit.view_${self.view}`
			set_element_css(selector, css_object)

		list_body.appendChild(list_header_node)
		list_body.appendChild(content_data)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			list_body	: list_body,
			label		: null
		})
		wrapper.classList.add('portal', 'view_'+self.context.view)

	// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

	// service autocomplete
		const click_handler = (e) => {
			e.stopPropagation()
			dd_request_idle_callback(
				() => {
					if (self.active) {
						activate_autocomplete(self, wrapper)
					}
				}
			)
		}
		wrapper.addEventListener('click', click_handler)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @param object self
* 	component instance
* @param array ar_section_record
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// content_data node
		const content_data = ui.component.build_content_data(self)

		// section_record. Add all section_record rendered nodes
			const ar_section_record_length = ar_section_record.length
			if (ar_section_record_length>0) {
				// const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record = ar_section_record[i]

					const section_record_node = await section_record.render()
					// set the pointer
					content_data[i] = section_record_node

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


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_records
* @param object self
* 	component instance
* @return array columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// base_columns_map
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
