// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {set_element_css} from '../../../../core/page/js/css.js'
	import {get_section_records} from '../../../../core/section/js/section.js'
	import {ui} from '../../../../core/common/js/ui.js'
	import {view_default_time_machine_list} from './view_default_time_machine_list.js'
	import {view_mini_time_machine_list} from './view_mini_time_machine_list.js'
	import {view_tool_time_machine_list} from './view_tool_time_machine_list.js'
	import {view_history_time_machine_list} from './view_history_time_machine_list.js'



/**
* RENDER_SERVICE_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const render_service_time_machine_list = function() {

	return true
}//end render_service_time_machine_list



/**
* LIST
* Render node for use in list
* @param object options
* @return HTMLElement wrapper
*/
render_service_time_machine_list.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.view || 'default'

	switch(view) {

		case 'mini':
			// used by inspector
			return view_mini_time_machine_list.render(self, options)

		case 'history':
			// used by inspector
			return view_history_time_machine_list.render(self, options)

		case 'tool':
			// used by tool_time_machine
			return view_tool_time_machine_list.render(self, options)

		case 'default':
		default:
			return view_default_time_machine_list.render(self, options)
	}
}//end list



/**
* COMMON_RENDER
* Renders main element wrapper for current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
export const common_render = async function(self, options) {

	// options
		const render_level	= options.render_level || 'full'
		const no_header		= options.no_header || false

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initialized and built)
		const ar_section_record	= await get_section_records({
			caller : self,
			mode : 'tm',
			view : 'line'
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

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
		self.paginator.mode = 'mini'
		await self.paginator.build()
		self.paginator.render()
		.then(paginator_wrapper =>{
			paginator_div.appendChild(paginator_wrapper)
		})

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
		if (ar_section_record.length>0 && no_header!==true) {
			const list_header_node = ui.render_list_header(columns_map, self)
			list_body.appendChild(list_header_node)
		}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_${self.model} ${self.model} ${self.config.id} ${self.section_tipo+'_'+self.tipo} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data


	return wrapper
}//end common_render



/**
* GET_CONTENT_DATA
* Render previously built section_records into a content_data div container
* Note that self here is a service_time_machine instance
* @param array ar_section_record
* 	Array of section_record instances
* @param object self
* 	service_time_machine instance
* @return HTMLElement content_data
*/
export const get_content_data = async function(ar_section_record, self) {

	// fragment
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {

			// no records found case

			const no_records_found_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'no_records',
				inner_html		: get_label.no_records || 'No records found'
			})
			fragment.appendChild(no_records_found_node)
		}else{

			// rows

			// parallel render
			const ar_promises = ar_section_record.map(record => record.render())
            const section_record_nodes = await Promise.all(ar_promises)

            // once rendered, append it preserving the order
            section_record_nodes.forEach(node => {
                fragment.appendChild(node)
            })
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
export const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// columns base
		const base_columns_map = await self.columns_map

	// ignore_columns
		const ignore_columns = (self.config.ignore_columns
			? self.config.ignore_columns
			: [
				'matrix_id' // matrix_id dd1573
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

			// short label (for small width columns)
				switch (el.tipo) {
					case 'dd201':
						el.label = 'Date'
						break;
					case 'dd197':
						el.label = 'User'
						break;
				}

			columns_map.push(el)
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
