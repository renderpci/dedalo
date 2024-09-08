// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL,Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		render_column_id,
		render_column_component_info,
		render_column_remove,
		get_buttons,
		activate_autocomplete,
		build_header,
		render_references
	} from './render_edit_component_portal.js'
	import {
		on_dragover,
		on_dragleave,
		on_drop, // used to reorder inside the same portal
	} from './drag_and_drop.js'


/**
* VIEW_DEFAULT_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_default_edit_portal = function() {

	return true
}//end view_default_edit_portal



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
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
			const header_wrapper_list = self.node.list_body
				? self.node.list_body.querySelector(":scope >.header_wrapper_list")
				: null;
			if (header_wrapper_list) {
				if (ar_section_record.length>0) {
					self.node.list_body.querySelector(":scope >.header_wrapper_list").classList.remove('hide')
				}else{
					self.node.list_body.querySelector(":scope >.header_wrapper_list").classList.add('hide')
				}
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
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			list_body	: list_body,
			buttons		: buttons,
			add_styles	: ['portal'] // added to the wrapper before view style
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)

	// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data

		wrapper.addEventListener('dragover',function(e){
			on_dragover(this, e, {
				caller	: self
			})
		})
		wrapper.addEventListener('dragleave',function(e){
			on_dragleave(this, e,)
		})
		wrapper.addEventListener('drop',function(e){
			on_drop( this, e, {
				caller	: self
			})
		})

	// service autocomplete
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			setTimeout(function(){
				if (self.active) {
					activate_autocomplete(self, wrapper)
				}
			}, 1)
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
* Adds control columns to the columns_map that will processed by section_recods
* @param object self
* @return array columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
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
		if (self.context.properties.source?.mode!=='external' && self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: render_column_remove
			})
		}else{
			columns_map.push({
				id		: 'empty',
				label	: '',
				width	: 'auto'
			})
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
