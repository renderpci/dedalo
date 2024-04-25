// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_update_cache */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_stream} from '../../../core/common/js/render_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'



/**
* RENDER_TOOL_UPDATE_CACHE
* Manages the component's logic and appearance in client side
*/
export const render_tool_update_cache = function() {

	return true
}//end render_tool_update_cache



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_update_cache.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_update_cache.prototype.edit = async function(options) {

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

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.caller.refresh()
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// short vars
		const section_tipo		= self.caller.section_tipo
		const component_list	= self.component_list
		const config			= self.config || {}
		const hilite_tipos		= config.hilite_tipos || {}
		const process_id		= 'process_update_cache'

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

	// components list checkbox
		const options_nodes = []
		const components_list_length = component_list.length
		for (let i = 0; i < components_list_length; i++) {

			const item = component_list[i]

 			// checkbox label
				const option_label = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: item.label,
					parent			: components_list_container
				})
				// info
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: `${item.model} - ${item.tipo}`,
					parent			: option_label
				})

			// input checkbox
				const option = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					id				: section_tipo + '_' +  item.tipo,
					value			: item.tipo
				})
				if (item.model==='component_section_id') {
					option.disabled = true
				}
				option_label.prepend(option)

			// hilite
				if (hilite_tipos.value && hilite_tipos.value.includes(item.tipo)) {
					option_label.classList.add('hilite')
				}

			// add
				options_nodes.push(option)
		}

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// button_apply
		const button_apply = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success button_apply',
			inner_html		: (get_label.update || 'Update') +' '+ (self.get_tool_label('records') || 'Records') + ': ' + self.caller.total,
			parent			: buttons_container
		})
		button_apply.addEventListener('click', async function(e){
			e.stopPropagation()
			e.preventDefault()

			// selection
				const checked_list			= options_nodes.filter(el => el.checked===true)
				const checked_list_length	= checked_list.length
				// empty case
				if (checked_list_length<1) {
					alert(get_label.empty_selection || 'Empty selection');
					return
				}

			// confirm update_cache
				if (!confirm(get_label.sure || 'Sure?')) {
					return
				}

			// loading styles and clean
				// components_list_container.classList.add('loading')
				button_apply.classList.add('loading')
				// blur button
				document.activeElement.blur()

			// API request
				const ar_component_tipo	= checked_list.map(el => el.value)
				const api_response		= await self.update_cache(ar_component_tipo)

			// response error case
				if (api_response.result===false) {
					button_apply.classList.remove('loading')
					response_message.innerHTML = api_response.msg || 'Unknown error. Perhaps a timeout occurred'
					return
				}

			// fire update_process_status
				update_process_status({
					pid							: api_response.pid,
					pfile						: api_response.pfile,
					process_id					: process_id,
					container					: response_message,
					button						: button_apply,
					components_list_container	: components_list_container,
					self						: self
				})
		})//end button_apply.addEventListener('click', async function(e)

	// response_message
		const response_message = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_message',
			parent			: fragment
		})

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				process_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status({
						pid							: local_data.value.pid,
						pfile						: local_data.value.pfile,
						process_id					: process_id,
						container					: response_message,
						button						: button_apply,
						components_list_container	: components_list_container,
						self						: self
					})
				}
			})
		}
		check_process_data()


	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* UPDATE_PROCESS_STATUS
* Call API get_process_status and render the info nodes
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const pid						= options.pid
	const pfile						= options.pfile
	const button					= options.button
	const process_id				= options.process_id
	const container					= options.container
	const components_list_container	= options.components_list_container
	const self						= options.self

	// locks the button submit
	button.classList.add('loading')
	components_list_container.classList.add('loading')

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
			update_rate	: 150, // int milliseconds
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
			display_json	: false
		})

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(sse_response, (info_node) => {

				const is_running = sse_response?.is_running ?? true

				if (is_running===false && sse_response.data) {
					container.appendChild(
						render_response_report(self, sse_response.data)
					)
				}

				const compound_msg = (sse_response) => {
					const data = sse_response.data
					const parts = []
					parts.push(data.msg)
					if (data.counter && data.total) {
						parts.push(data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
					}
					if (data.n_components) {
						parts.push('n components: ' + data.n_components)
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
			// unlocks the button submit
			button.classList.remove('loading')
			container.classList.remove('loading')
			components_list_container.classList.remove('loading')

			// render_response()
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)
	})
}//end update_process_status



/**
* RENDER_RESPONSE_REPORT
* @param object api_response
* @return HTMLElement report_node
*/
const render_response_report = function (self, api_response) {

	const report_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'report_node'
	})

	// Updated text
	{
		const label = (self.get_tool_label('updated') || 'Updated')
			+ ': '
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'msg_detail',
			inner_html		: label,
			parent			: report_node
		})
	}


	// response n_components
	if (api_response.n_components) {
		const label = (self.get_tool_label('components') || 'Components')
			+ ': '
			+ (api_response.n_components || 'Unknown')
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'msg_detail',
			inner_html		: label,
			parent			: report_node
		})
	}

	// response counter (n_records)
	if (api_response.counter) {
		const label = (self.get_tool_label('records') || 'Records')
			+ ': '
			+ (api_response.counter || 'Unknown')
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'msg_detail',
			inner_html		: label,
			parent			: report_node
		})
	}


	return report_node
}//end render_response_report



// @license-end
