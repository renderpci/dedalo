// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../core/common/js/ui.js'
	import {get_section_records} from '../../../../core/section/js/section.js'
	import {set_element_css} from '../../../../core/page/js/css.js'
	import {event_manager} from '../../../../core/common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../../../core/common/js/events.js'
	import {
		get_content_data
	} from './render_service_time_machine_list.js'



/**
* VIEW_TOOL_TIME_MACHINE_LIST
* Manages the service's appearance in client side
*/
export const view_tool_time_machine_list = function() {

	return true
}//end view_tool_time_machine_list



/**
* RENDER
* Renders main element wrapper for current view
* @param object self
* 	service instance
* @param object options
* @return HTMLElement wrapper
*/
view_tool_time_machine_list.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initialized and built)
		const ar_section_record	= await get_section_records({
			caller	: self, // service_time_machine instance
			mode	: 'list'
		})
		self.ar_instances = ar_section_record

	// content_data
		const content_data = await get_content_data(ar_section_record, self)
		if (render_level==='content') {
			return content_data
		}

	// fragment
		const fragment = new DocumentFragment()

	// paginator container node
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent			: fragment
		})
		if (self.paginator) {
			self.paginator.build()
			.then(()=>{
				self.paginator.render()
				.then(paginator_wrapper =>{
					paginator_div.appendChild(paginator_wrapper)
				})
			})
		}else{
			console.error('Error: paginator not found in current service_time_machine instance: ', self);
		}

	// list_body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// flat columns create a sequence of grid widths taking care of sub-column space
		// like 1fr 1fr 1fr 3fr 1fr
		const items				= ui.flat_column_items(columns_map)
		const template_columns	= self.config.template_columns
			? self.config.template_columns
			: items.join(' ')
		const css_object = {
			'.list_body' : {
				'grid-template-columns': template_columns
			}
		}
		const selector = `${self.config.id}.${self.section_tipo+'_'+self.tipo}.view_${self.view}`
		set_element_css(selector, css_object)

	// list_header_node. Create and append if ar_instances is not empty
		if (ar_section_record.length>0) {
			const list_header_node = ui.render_list_header(columns_map, self)
			list_body.appendChild(list_header_node)
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_${self.model} ${self.model} ${self.config.id} ${self.section_tipo+'_'+self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data


	return wrapper
}//end render



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* 	service instance
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

	// columns base
		const base_columns_map = await self.columns_map

	// ignore_columns
		const ignore_columns = (self.config.ignore_columns
			? self.config.ignore_columns
			: [
				'dd1573', // matrix_id
				'dd547', // when
				'dd543', // who
				'dd546' // where
			  ])
			// map names to tipo (columns already parse id for another uses)
			.map(el => {
				switch (el) {
					case 'matrix_id'		: return 'dd1573';
					case 'bulk_process_id'	: return 'dd1371';
					case 'when'				: return 'dd547';
					case 'who'				: return 'dd543';
					case 'where'			: return 'dd546';
					default					: return el;
				}
			})

	// modify list and labels
		const base_columns_map_length = base_columns_map.length
		for (let i = 0; i < base_columns_map_length; i++) {

			const el = base_columns_map[i]

			// ignore some columns
				if (ignore_columns.includes(el.tipo)) {
					continue;
				}

			columns_map.push(el)
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* Creates the column id DOM nodes and events
* @param object options
* @return DocumentFragment
*/
const render_column_id = async function(options) {

	// options
		const service_time_machine	= options.caller
		const section_id			= options.section_id
		const section_tipo			= options.section_tipo
		const matrix_id				= options.matrix_id
		const modification_date		= options.modification_date
		const bulk_process_id		= options.locator.bulk_process_id

	// short vars
		const tool			= service_time_machine.caller
		const main_caller	= tool.caller
		const fragment		= new DocumentFragment()

	// button_view
		const button_view = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_view',
			parent			: fragment
		})
		const click_handler = (e) => {
			e.stopPropagation()

			if (main_caller.model==='section') {

				// section case
				// user confirmation
					const msg = tool.get_tool_label('recover_section_alert') || '*Are you sure you want to restore this section?'
					if (!confirm(msg)) {
						return
					}

				// apply recover record
					tool.apply_value({
						section_id		: section_id,
						section_tipo	: section_tipo,
						tipo			: section_tipo,
						lang			: page_globals.dedalo_data_nolan,
						matrix_id		: matrix_id
					})
					.then(function(response){
						if (response.result===true) {
							main_caller.refresh()
							.then(function(){
								service_time_machine.refresh()
							})
						}else{
							// error case
							console.warn("response:",response);
							alert(response.msg || 'Error. Unknown error on apply tm value');
						}
					})
			}else{

				// component case

				// publish event
					const data = {
						tipo			: section_tipo,
						section_id		: section_id,
						matrix_id		: matrix_id,
						date			: modification_date || null,
						bulk_process_id	: bulk_process_id || null,
						mode			: 'tm',
						caller			: options
					}
					event_manager.publish('tm_edit_record', data)
					// reset buttons
					const dom_buttons_view			= document.querySelectorAll('.button_view')
					const dom_buttons_view_length	= dom_buttons_view.length
					for (let i = dom_buttons_view_length - 1; i >= 0; i--) {
						dom_buttons_view[i].classList.remove('warning')
					}
					button_view.classList.add('warning')
			}
		}
		button_view.addEventListener('mousedown', click_handler)
		// siblings can use click too to easy set preview value
		dd_request_idle_callback(
			() => {
				const children			= button_view.parentNode.parentNode.children
				const children_length	= children.length
				for (let i = children_length - 1; i >= 0; i--) {
					if(children[i]!==button_view) {
						children[i].classList.add('link')
						children[i].addEventListener('mousedown', click_handler)
					}
				}
			}
		)

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			text_content	: section_id,
			class_name		: 'section_id',
			parent			: button_view
		})

	// icon eye time machine preview (eye)
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon ' + (main_caller.model==='section' ? 'history' : 'eye'),
			parent			: button_view
		})


	return fragment
}//end render_column_id



// @license-end
