/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../core/common/js/ui.js'
	import {get_ar_instances} from '../../../../core/section/js/section.js'
	import {set_element_css} from '../../../../core/page/js/css.js'
	// import {event_manager} from '../../../../core/common/js/event_manager.js'
	// import {
	// 	rebuild_columns_map
	// } from './render_service_time_machine_list.js'



/**
* VIEW_MINI_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const view_mini_time_machine_list = function() {

	return true
}//end view_mini_time_machine_list



/**
* RENDER
* Renders main element wrapper for current view
* @param object self
* @param object options
* @return DOM node wrapper
*/
view_mini_time_machine_list.render = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initialized and built)
		const ar_section_record	= await get_ar_instances(self)
		self.ar_instances		= ar_section_record

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
		// change paginator mode on the fly. Note that by default, is initialized with the caller mode (time_machine))
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
		const template_columns = '1fr 1fr 1fr 2fr';
		const css_object = {
			'.list_body' : {
				'grid-template-columns': template_columns
			}
		}
		const selector = `${self.section_tipo}_${self.tipo}.${self.tipo}.${self.mode}`
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
			class_name		: `wrapper_${self.model} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.list_body		= list_body
		wrapper.content_data	= content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render previously built section_records into a content_data div container
* Note that self here is a service_time_machine instance
* @param array ar_section_record
* 	Array of section_record instances
* @param object self
* 	service_time_machine instance
* @return DOM node content_data
*/
const get_content_data = async function(ar_section_record, self) {

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
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise_node = ar_section_record[i].render()
					ar_promises.push(render_promise_node)
				}

			// once rendered, append it preserving the order
				await Promise.all(ar_promises)
				.then(function(section_record_nodes) {
					for (let i = 0; i < ar_section_record_length; i++) {
						const section_record_node = section_record_nodes[i]
						fragment.appendChild(section_record_node)
					}
				});
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
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// columns base
		const base_columns_map = await self.columns_map

	// modify list and labels
		const base_columns_map_length = base_columns_map.length
		for (let i = 0; i < base_columns_map_length; i++) {
			const el = base_columns_map[i]

			// // ignore matrix_id column
				if (el.tipo==='dd1573') {
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


	return columns_map
}//end rebuild_columns_map
