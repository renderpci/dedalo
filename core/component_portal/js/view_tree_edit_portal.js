// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {
		render_column_remove,
		activate_autocomplete,
		get_buttons
	} from './render_edit_component_portal.js'



/**
* VIEW_TREE_EDIT_PORTAL
* Manage the components logic and appearance in client side
*/
export const view_tree_edit_portal = function() {

	return true
}//end view_tree_edit_portal




/**
* RENDER
* Manages the component's logic and appearance in client side
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_tree_edit_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			mode	:'list'
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// show interface
		self.show_interface.button_tree			= true
		self.show_interface.button_add			= false
		self.show_interface.button_link			= false
		self.show_interface.button_list			= false
		self.show_interface.button_fullscreen	= false

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			// label		: null,
			buttons			: buttons,
			add_styles		: ['portal','view_line'] // added to the wrapper before view style
		})
		// set pointers
		wrapper.content_data = content_data

		// on-the-fly css
		// if expected number of columns (2) change, updates the columns CSS
		// This happen, for sample, when user do not have enough permissions to delete
		if (self.columns_map.length!==2) {
			const items				= ui.flat_column_items(self.columns_map);
			const template_columns	= items.join(' '); // like 1fr auto'
			const css_object = {
				".content_data" : {
					"grid-template-columns" : template_columns
				}
			}
			const selector = `${self.section_tipo}_${self.tipo}.edit.view_${self.view}`
			set_element_css(selector, css_object)
		}

	// events
		add_events(self, wrapper)


	return wrapper
}//end render



/**
* ADD_EVENTS
* @param object self
* @param HTMLElement wrapper
* @return bool
*/
export const add_events = function(self, wrapper) {

	// click delegated
		wrapper.addEventListener('click', fn_wrapper_click)
		function fn_wrapper_click(e){
			e.stopPropagation()

			// active autocomplete
			setTimeout(function(){
				if (self.active) {
					activate_autocomplete(self, wrapper)
				}
			}, 1)

			// remove row
				if(e.target.matches('.button.remove')) {
					e.preventDefault()

					// label
						const children = e.target.parentNode.parentNode.children
						const ar_label = []
						for (let i = 0; i < children.length; i++) {
							if(children[i].textContent.length>0) {
								ar_label.push(children[i].textContent)
							}
						}
						const label = ar_label.join(', ')

					const changed_data = [Object.freeze({
						action	: 'remove',
						key		: JSON.parse(e.target.dataset.key),
						value	: null
					})]

					const changed = self.change_value({
						changed_data	: changed_data,
						label			: label,
						refresh			: false,
						build_autoload	: false
					})
					changed.then(async (api_response)=>{

						// update pagination offset
							self.update_pagination_values('remove')

						// refresh
							await self.refresh({
								build_autoload : false
							})

						// check if the caller has active a tag_id
							if(self.active_tag){
								// filter component data by tag_id and re-render content
								self.filter_data_by_tag_id(self.active_tag)
							}

						// event to update the DOM elements of the instance
							event_manager.publish('remove_element_'+self.id, e.target.dataset.key)
					})

					return true
				}//end if(e.target.matches('.button.remove'))
		}//end fn_wrapper_click


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
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
				  for (let i = 0; i < ar_section_record_length; i++) {

					const section_record = values[i]

					fragment.appendChild(section_record)
				  }
				});
			}//end if (ar_section_record_length===0)

	// content_data
		const content_data = ui.component.build_content_data(self,{button_close: null})
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_records
* @param object self
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

	// button_remove column
		if (self.permissions>1) {
			columns_map.push({
				id			: 'remove',
				label		: '', // get_label.delete || 'Delete',
				width		: 'auto',
				callback	: render_column_remove
			})
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
