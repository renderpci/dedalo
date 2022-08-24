/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {get_ar_instances} from '../../../core/section/js/section.js'
	import {set_element_css} from '../../../core/page/js/css.js'
	// import {tool_label} from '../../../tools/tool_common/js/tool_common.js'



/**
* RENDER_TIME_MACHINE_VIEW
*
* Used by time_machine to render by itself in the same way that portals views
* the tool assign the name of this method when it create the time_machine instance in self.time_machine.view
* the time_machine call here when the render() is fired
*
* @param instance self
* 	The time_machine instance (here the instance is not the tool)
* @param instance options
* 	The generic options, used for assign render_level
* @return DOM node wrapper
*/
export const render_time_machine_view = async function(self, options) {

	// options
		const render_level 	= options.render_level || 'full'

	const fragment = new DocumentFragment()

	// columns_map
		const columns_map = await rebuild_columns_map(self)
		self.columns_map = columns_map

	// ar_section_record. section_record instances (initied and builded)
		const ar_section_record	= await get_ar_instances(self)
		self.ar_instances		= ar_section_record

	// content_data
		const content_data = await get_content_data(self.ar_instances, self)
		if (render_level==='content') {
			return content_data
		}

	// paginator container node
		const paginator_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator',
			parent			: fragment
		})
		self.paginator.build()
		.then(function(){
			self.paginator.render().then(paginator_wrapper =>{
				paginator_div.appendChild(paginator_wrapper)
			})
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
		const template_columns	= items.join(' ')
		// Object.assign(
		// 	list_body.style,
		// 	{
		// 		"grid-template-columns": template_columns
		// 	}
		// )
		const css_object = {
			'.list_body' : {
				'grid-template-columns': template_columns
			}
		}
		const selector = `${self.section_tipo}_${self.tipo}.${self.tipo}.tm`
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
			element_type	: 'section',
			//class_name	: self.model + ' ' + self.tipo + ' ' + self.mode
			// class_name	: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo+'_'+self.tipo} ${self.tipo} ${self.mode}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render_time_machine_view




/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(ar_section_record, self) {

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
			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise_node = ar_section_record[i].render()
					ar_promises.push(render_promise_node)
				}
				await Promise.all(ar_promises).then(function(values) {
				  for (let i = 0; i < ar_section_record_length; i++) {
				  	const section_record_node = values[i]
					fragment.appendChild(section_record_node)
				  }
				});
		}

	// content_data
		const content_data = ui.tool.build_content_data(self)
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
		columns_map.push(...base_columns_map)


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* @param object options
* @return DOM DocumentFragment
*/
const render_column_id = function(options) {

	// options
		const service_time_machine	= options.caller
		const section_id			= options.section_id
		const section_tipo			= options.section_tipo
		// const offset				= options.offset
		const matrix_id				= options.matrix_id
		const modification_date		= options.modification_date

	// short vars
		// const permissions	= service_time_machine.permissions
		const tool				= service_time_machine.caller
		const main_caller		= tool.caller
		const fragment			= new DocumentFragment()

	// button_view
		const button_view = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_view',
			parent			: fragment
		})
		button_view.addEventListener("click", function(){

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
								// success case
								// if (window.opener) {
								// 	// close this window when was opened from another
								// 	window.close()
								// }
							})
						}else{
							// error case
							console.warn("response:",response);
							alert(response.msg || 'Error. Unknow error on apply tm value');
						}
					})
			}else{
				// component case

				// publish event
					event_manager.publish('tm_edit_record', {
						tipo		: section_tipo,
						section_id	: section_id,
						matrix_id	: matrix_id,
						date		: modification_date || null,
						mode		: 'tm'
					})
			}
		})

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
}//end render_column_id()
