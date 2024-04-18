// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_propagate_component_data */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {render_stream} from '../../../core/common/js/render_common.js'
	import {is_filter_empty} from '../../../core/search/js/search.js'



/**
* RENDER_TOOL_PROPAGATE_COMPONENT_DATA
* Manages the component's logic and appearance in client side
*/
export const render_tool_propagate_component_data = function() {

	return true
}//end render_tool_propagate_component_data



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_propagate_component_data.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_propagate_component_data.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// short vars
		const section_tipo		= self.caller.section_tipo
		const component_list	= self.component_list
		const process_id		= 'process_propagate_component_data'
		const lock_items		= []; // nodes to lock on process data

	// section_info
		const section_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_info',
			parent			: fragment
		})
		// section_name
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_name',
				inner_html		: self.caller.label,
				parent			: section_info
			})
		// section_tipo
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_tipo',
				inner_html		: self.caller.tipo,
				parent			: section_info
			})

	// components_list_container
		const components_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container',
			parent			: fragment
		})
		lock_items.push(components_list_container)

	// component caller
		ui.load_item_with_spinner({
			container	: components_list_container,
			callback	: async () => {
				// await pause(2000)
				await self.get_component_to_propagate()
				const component_node = await self.component_to_propagate.render()
				return component_node
			}
		})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})
		lock_items.push(buttons_container)

	// info_text
		const section = self.caller.caller?.caller
		if (!section || section.model!=='section' || section.mode!=='edit') {
			console.error('Ignored call. Unable to get valid section. caller:', self.caller);
			console.log('section:', section);
			const content_data = ui.tool.build_content_data(self)
			let label = ''
			switch (true) {
				case !section:
					label = 'Caller section is unavailable'
					break;
				case section.model!=='section':
					label = 'Caller is ' + section.model + '. This tool only works in the context of editing sections.'
					break;
				case section.mode!=='edit':
					label = 'Sorry. Only edit mode is allowed. This tool only works in the context of editing sections.'
					break;
			}
			content_data.appendChild(ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg',
				inner_html		: label
			}))
			return content_data
		}


	// filter. Check the filter to know if the user has apply some filter or if will apply to all records
		const sqo_filter = section.rqo && section.rqo.sqo && section.rqo.sqo.filter
			? section.rqo.sqo.filter
			: null

		// check if the filter is empty
		const filter_empty = sqo_filter
			? is_filter_empty(sqo_filter)
			: true

		const total = await section.get_total()

		const tipo_label = '<strong>'+self.caller.label+'</strong>'

		const all_records_label = self.get_tool_label('all_records') || 'All'

		const total_label = (filter_empty === false)
			? '<strong>'+total+'</strong>'
			: '<strong>'+all_records_label+' - '+total+'</strong>'

		const text_string = self.get_tool_label('content_will_be_added_removed', tipo_label, total_label)
			|| 'The content will be added or removed from the field: {0} s in the {1} current records'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: text_string,
			parent			: buttons_container
		})

	// click_handler
		const click_handler = async (e) => {
			e.stopPropagation()

			// action. Get form button property 'action'
				const action = e.target.action
				if (['replace','add','delete'].includes(action)===false) {
					console.error('Invalid action (click_handler):', e.target.action);
					return
				}

			await ui.component.deactivate(self.component_to_propagate)

			// alert user before execute
				if(filter_empty === true){
					const msg = (self.get_tool_label('will_replaced_all_records') || 'All records will be replaced')
					+ ' ' + (get_label.total || 'Total') + ': '  + total
					+ '\n' + 'action: ' + action
					if (!confirm(msg)){
						return false
					}
				}

			// propagate_component_data
			const confirm_msg = 'Action to do: ' + action +'\n'+ (get_label.sure || 'Sure?')
			if (confirm(confirm_msg)) {

				// loading class
				content_data.classList.add('loading')

				// API request to propagate_component_data
				self.propagate_component_data(action)
				.then(function(api_response){

					// loading class
					content_data.classList.remove('loading')

					// response text. Old
						// const response_node = create_response(self, response_message, api_response, replace_label)
						// response_message.appendChild(response_node)

					// fire update_process_status
					update_process_status({
						pid			: api_response.pid,
						pfile		: api_response.pfile,
						process_id	: process_id,
						container	: response_message,
						lock_items	: lock_items
					})
				})
			}
		}//end click_handler

	// button_replace
		const replace_label = self.get_tool_label('do_replace') || 'Replace values'
		const button_replace = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning add button_replace',
			inner_html		: replace_label,
			parent			: buttons_container
		})
		button_replace.action = 'replace'
		button_replace.addEventListener('click', click_handler)

	// button_add
		const components_monovalue = self.config?.components_monovalue
			? self.config.components_monovalue.value
			: []
		if (!components_monovalue.includes(self.main_element.model)) {
			const add_label = self.get_tool_label('tool_do_add') || 'Add'
			const button_add = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning add button_add',
				inner_html		: add_label,
				parent			: buttons_container
			})
			button_add.action = 'add'
			button_add.addEventListener('click', click_handler)
		}

	// button_delete
		const delete_action_label = self.get_tool_label('tool_do_delete') || 'Delete'
		const button_delete = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning remove button_delete',
			inner_html		: delete_action_label,
			parent			: buttons_container
		})
		button_delete.action = 'delete'
		button_delete.addEventListener('click', click_handler)

	// response_message
		const response_message = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_message',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				process_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status({
						pid			: local_data.value.pid,
						pfile		: local_data.value.pfile,
						process_id	: process_id,
						container	: response_message,
						lock_items	: lock_items
					})
				}
			})
		}
		check_process_data()


	return content_data
}//end get_content_data



/**
* UPDATE_PROCESS_STATUS
* Call API get_process_status and render the info nodes
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const pid			= options.pid
	const pfile			= options.pfile
	const process_id	= options.process_id
	const container		= options.container
	const lock_items	= options.lock_items

	// locks lock_items
	lock_items.map(el =>{
		el.classList.add('loading')
	})

	// blur button
	document.activeElement.blur()

	// clean container
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	// get_process_status from API and returns a SEE stream
	data_manager.request_stream({
		body : {
			dd_api		: 'dd_utils_api',
			action		: 'get_process_status',
			update_rate	: 500, // int milliseconds
			options		: {
				pid		: pid,
				pfile	: pfile
			}
		}
	})
	.then(function(stream){

		// render base nodes and set functions to manage
		// the stream reader events
		const render_response = render_stream({
			container		: container,
			id				: process_id,
			pid				: pid,
			pfile			: pfile,
			display_json	: true
		})

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(sse_response, (info_node) => {

				const is_running = sse_response?.is_running ?? true

				const compound_msg = (sse_response) => {
					const data = sse_response.data
					const parts = []
					parts.push(data.msg)
					if (data.section_label) {
						parts.push(data.section_label)
					}
					if (data.counter) {
						parts.push(data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
					}
					if (data.current?.section_id) {
						parts.push('id: ' + data.current?.section_id)
					}
					parts.push(sse_response.total_time)
					return parts.join(' | ')
				}

				const msg = sse_response
							&& sse_response.data
							&& sse_response.data.msg
							&& sse_response.data.msg.length>5
					? compound_msg(sse_response)
					: is_running
						? 'Process running... please wait'
						: 'Process completed in ' + sse_response.total_time

				if(!info_node.msg_node) {
					info_node.msg_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'msg_node' + (is_running===false ? ' done' : ''),
						parent			: info_node
					})
				}
				ui.update_node_content(info_node.msg_node, msg)
			})
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlocks the lock_items
			lock_items.map(el =>{
				el.classList.remove('loading')
			})
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)
	})
}//end update_process_status



/**
* CREATE_RESPONSE
* Render a response node
* @param object self
* @param HTMLElement response_message
* @param object response
* @param string action
* @return HTMLElement response_node
*/
	// const create_response = function(self, response_message, response, action) {

	// 	// clean the previous msg
	// 	while (response_message.firstChild) {
	// 		response_message.removeChild(response_message.firstChild)
	// 	}

	// 	const response_node = new DocumentFragment()

	// 	const successfully_node = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name		: 'successfully',
	// 		inner_html		: self.get_tool_label('successfully') || 'Successfully',
	// 		parent 			: response_node
	// 	})

	// 	const count_label	= self.get_tool_label('updated_records') || 'Updated records'
	// 	const count			= response.count ||  ''

	// 	const updated_records_node = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name		: 'updated_records',
	// 		inner_html		: count_label + ": " + count + ' ('+action+')',
	// 		parent			: response_node
	// 	})


	// 	return response_node
	// }// end create_response



// @license-end
