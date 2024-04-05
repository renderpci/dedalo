// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_diffusion */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {object_to_url_vars} from '../../../core/common/js/utils/index.js'
	import {render_stream} from '../../../core/common/js/render_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_dom} from '../../../core/common/js/events.js'



/**
* RENDER_TOOL_DIFFUSION
* Manages the component's logic and appearance in client side
*/
export const render_tool_diffusion = function() {

	return true
}//end render_tool_diffusion



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_diffusion.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_diffusion.prototype.edit = async function(options) {

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
		// const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// const modal		= ui.attach_to_modal(header, wrapper, null)
		// modal.on_close	= () => {
		// 	self.caller.refresh()
		// 	// when closing the modal, common destroy is called to remove tool and elements instances
		// 	self.destroy(true, true, true)
		// }

	// focus first publish button
		when_in_dom(
			wrapper,
			function() {
				const publication_button = wrapper.querySelector('.publication_button')
				if (publication_button) {
					publication_button.focus()
				}
			}
		)


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
		const diffusion_info = self.diffusion_info


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


	// diffusion_info_container
		const diffusion_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_info_container',
			parent			: fragment
		})

	// resolve_levels
		const resolve_levels_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resolve_levels_container',
			parent			: diffusion_info_container
		})
		// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			inner_html		: get_label.levels || 'Levels',
			parent			: resolve_levels_container
		})
		// resolve_levels_input
		const resolve_levels_node = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'resolve_levels_input',
			value			: self.resolve_levels,
			parent			: resolve_levels_container
		})
		resolve_levels_node.addEventListener('change', function(e) {
			e.preventDefault()
			// fix self levels value
			self.resolve_levels = parseInt(this.value)
			if (self.resolve_levels<1) {
				self.resolve_levels	= 1
				this.value	= 1
			}
		})
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			inner_html		: self.get_tool_label('depth_levels') || 'Depth levels to solve',
			parent			: resolve_levels_container
		})

	// info
		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info',
			parent			: diffusion_info_container
		})
		const info_div = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'info_div hide',
			inner_html		: 'info: ' + JSON.stringify(diffusion_info, null, 2),
			parent			: diffusion_info_container
		})
		ui.collapse_toggle_track({
			toggler			: button_info,
			container		: info_div,
			collapsed_id	: 'collapsed_tool_diffusion_info',
			default_state 	: 'closed'
		})

	// skip_publication_state_check
		const skip_publication_state_check_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('skip_publication_state_check') || 'Ignore temporarily the publication status when publishing',
			parent			: resolve_levels_container
		})
		const skip_publication_state_check_node = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'skip_publication_state_check_input',
			name			: 'skip_publication_state_check',
			value			: 1
		})
		skip_publication_state_check_label.prepend(skip_publication_state_check_node)
		if (self.diffusion_info.skip_publication_state_check===1) {
			skip_publication_state_check_node.checked = true
		}
		skip_publication_state_check_node.addEventListener('change', function(e) {
			e.preventDefault()
			// fix self levels value
			self.skip_publication_state_check = this.checked ? 1 : 0
		})

	// publication items
		const publication_items = render_publication_items(self)
		fragment.appendChild(publication_items)

	// info_text
		const total = self.caller.mode==='edit'
			? 1
			: await self.caller.get_total()
		const locale		= 'es-ES' // (page_globals.locale ?? 'es-CL').replace('_', '-')
		const total_label	= new Intl.NumberFormat(locale, {}).format(total);
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: self.get_tool_label('publish_selected_records', total_label),
			parent			: diffusion_info_container
		})

	// buttons_container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'buttons_container',
		// 	parent			: fragment
		// })

	// button_apply
		// const button_apply = ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'success button_apply',
		// 	inner_html		: 'OK',
		// 	parent			: buttons_container
		// })
		// button_apply.addEventListener('click', function(e){
		// 	e.preventDefault()
		// })

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_PUBLICATION_ITEMS
* @param object self
* @return HTMLElement publication_items
*/
export const render_publication_items = function(self) {

	// short vars
		const diffusion_map	= self.diffusion_info.diffusion_map
		const ar_data		= self.diffusion_info.ar_data

	// publication_items container
		const publication_items = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'publication_items'
		})

	let diffusion_group_key = 0;
	for(const diffusion_group_tipo in diffusion_map) {

		const current_diffusion_map = diffusion_map[diffusion_group_tipo] // array

		const current_diffusion_map_length = current_diffusion_map.length
		for (let i = 0; i < current_diffusion_map_length; i++) {

			const item		= current_diffusion_map[i]
			const data_item	= ar_data[diffusion_group_key]

			// process_id like 'process_diffusion_mht2_rsc170'
			const process_id = 'process_diffusion_' + item.element_tipo + '_' + self.caller.section_tipo

			const current_diffusion_element_tipo = item.element_tipo

			// publication_item_label
				const publication_item_label = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'publication_item_label label icon_arrow up',
					inner_html		: item.name,
					parent			: publication_items
				})

			// publication_item_body
				const publication_item_body = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'publication_item_body',
					parent			: publication_items
				})

			// collapse body
				ui.collapse_toggle_track({
					toggler				: publication_item_label,
					container			: publication_item_body,
					collapsed_id		: 'collapsed_diffusion_item_'+current_diffusion_element_tipo,
					collapse_callback	: collapse,
					expose_callback		: expose,
					default_state		: 'opened'
				})
				function collapse() {
					publication_item_label.classList.remove('up')
				}
				function expose() {
					publication_item_label.classList.add('up')
				}

			// publication_items_grid
				const publication_items_grid = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'publication_items_grid',
					parent			: publication_item_body
				})

			// name
				const name_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.name || 'Name',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const name_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// type
				const type_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.type || 'Type',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const type_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.class_name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// diffusion_element
				const diffusion_element_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: 'Diffusion element',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const diffusion_element_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: current_diffusion_element_tipo,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// database
				const database_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.database || 'Database',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const database_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.database_name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// table
				const table_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.table || 'Table',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const table_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: data_item.table,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// fields
				const fields_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.fields || 'Fields',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				if (data_item.table_fields_info && data_item.table_fields_info.length>0) {
					const fields_value = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value link icon_arrow',
						inner_html		: get_label.show || 'Show',
						parent			: publication_items_grid
					})
					fields_value.addEventListener('click', function(e) {
						ar_fields_nodes.map(el => {
							el.classList.toggle('hide')
						})
						this.classList.toggle('up')
					})

					// table_fields_info
					const ar_fields_nodes = []
					const table_fields_info_length = data_item.table_fields_info.length
					for (let i = 0; i < table_fields_info_length; i++) {

						const item = data_item.table_fields_info[i]

						// field (MySQL target)
						const field_node = ui.create_dom_element({
							element_type	: 'span',
							inner_html		: item.label,
							class_name		: 'fields_grid_value label hide',
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(field_node)

						// related (Dédalo source)
						const related_item = ui.create_dom_element({
							element_type	: 'div',
							inner_html		: item.related_label,
							class_name		: 'fields_grid_value label link hide',
							title			: item.related_tipo + ' - ' + item.related_model,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(related_item)
						related_item.addEventListener('click', function(e) {
							e.stopPropagation()
							const url = DEDALO_CORE_URL + '/ontology/dd_list.php?' + object_to_url_vars({
								modo			: 'tesauro_edit',
								terminoID		: item.tipo,
								terminoIDlist	: item.tipo,
								n				: 1,
								total			: 'form',
								max				: 1
							})
							const window_width	= 1001
							const screen_width	= window.screen.width
							const screen_height	= window.screen.height
							window.docu_window	= window.open(
								url,
								'docu_window',
								`left=${screen_width-window_width},top=0,width=${window_width},height=${screen_height}`
							)
						})
						const model_node = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'fields_grid_value_obs label light hide',
							inner_html		: item.model + ' | ' + item.tipo,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(model_node)
						const related_info_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'fields_grid_value_obs label light hide',
							inner_html		: item.related_model + ' | ' + item.related_tipo,
							parent			: publication_items_grid
						})
						ar_fields_nodes.push(related_info_node)
					}
				}else{
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value',
						inner_html		: 'not used',
						parent			: publication_items_grid
					})
				}

			// DB connection_status
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.connection_status || 'Connection status',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				if (item.connection_status) {
					const class_status = item.connection_status.result===true
						? 'success'
						: 'fail'
					ui.create_dom_element({
						element_type	: 'div',
						inner_html		: item.connection_status.msg,
						class_name		: 'value ' + class_status,
						parent			: publication_items_grid
					})
				}else{
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value',
						inner_html		: 'not used',
						parent			: publication_items_grid
					})
				}

			// container_bottom
				const container_bottom = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container_bottom',
					parent			: publication_items_grid
				})

				// response_message
				const response_message = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_message',
					parent			: container_bottom
				})

				// publication_button
				const publication_button = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning publication_button',
					inner_html		: get_label.publish || 'Publish',
					parent			: container_bottom
				})
				publication_button.addEventListener('click', (e) => {
					e.stopPropagation()

					// user confirmation
					if (!confirm(get_label.sure || 'Sure?')) {
						return
					}

					// publish content exec
					publish_content(self, {
						response_message		: response_message,
						publication_button		: publication_button,
						diffusion_element_tipo	: current_diffusion_element_tipo,
						process_id				: process_id
					})
				})
				// disable cases :
						if (item.connection_status) {
							if (item.connection_status.result===false) {
								publication_button.classList.add('not_ready')
							}
						}
						if (item.class_name==='diffusion_mysql' && !data_item.table) {
							publication_button.classList.add('loading')
						}

				// check process status always
				const check_process_data = () => {
					data_manager.get_local_db_data(
						process_id,
						'status'
					)
					.then(function(local_data){
						if (local_data && local_data.value) {
							update_process_status({
								pid                    : local_data.value.pid,
								pfile				: local_data.value.pfile,
								process_id			: process_id,
								container			: response_message,
								publication_button	: publication_button
							})
						}
					})
				}
				check_process_data()
		}//end for (let i = 0; i < current_diffusion_map_length; i++)

		diffusion_group_key++
	}


	return publication_items
}//end render_publication_items



/**
* PUBLISH_CONTENT
* Trigger the publish records action against the API
* @param object self
* @param object options
*/
const publish_content = async (self, options) => {

	// options
		const response_message			= options.response_message
		const publication_button		= options.publication_button
		const diffusion_element_tipo	= options.diffusion_element_tipo
		const process_id				= options.process_id

	// clean previous messages
		response_message.classList.remove('error')
		publication_button.classList.add('loading')
		// while (response_message.firstChild) {
		// 	response_message.removeChild(response_message.firstChild);
		// }

	// export API call
		const api_response = await self.export({
			diffusion_element_tipo : diffusion_element_tipo
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log('export api_response:', api_response);
		}

	// main response msg print
		response_message.innerHTML = api_response.msg || 'Unknown error'
		if (api_response.result===false) {
			response_message.classList.add('error')
			publication_button.classList.remove('loading')
			return
		}

	// fire update_process_status
		update_process_status({
			pid					: api_response.pid,
			pfile				: api_response.pfile,
			process_id			: process_id,
			container			: response_message,
			publication_button	: publication_button
		})

		/* DES
			// update_record_response
				if (api_response.update_record_response) {

					const detail_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'detail_container',
						parent			: response_message
					})
					const update_record_response		= api_response.update_record_response
					const update_record_response_length	= update_record_response.length
					for (let i = 0; i < update_record_response_length; i++) {

						const item = update_record_response[i]

						const class_add = item.result===true ? 'green' : 'red'
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: class_add,
							inner_html		: item.msg,
							parent			: detail_container
						})
					}
				}

			// time
				if (api_response.time) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'detail_container',
						inner_html		: 'Total secs: ' + api_response.time,
						parent			: response_message
					})
				}

			spinner.remove()
			publication_button.classList.remove('hide')
			*/
}//end publish_content



/**
* UPDATE_PROCESS_STATUS
* Call API get_process_status and render the info nodes
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const pid					= options.pid
	const pfile					= options.pfile
	const publication_button	= options.publication_button
	const process_id			= options.process_id
	const container				= options.container

	// locks the button submit
	publication_button.classList.add('loading')

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
			display_json	: true
		})

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(sse_response, () => {
				console.log('sse_response.data:', sse_response.data);

				const is_running = sse_response?.is_running ?? true

				const compound_msg = (sse_response) => {
					const data = sse_response.data
					const parts = []
					parts.push(data.msg +' '+ data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
					parts.push(data.section_label + ' ' + data.current?.section_id)
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

				return ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'msg_node' + (is_running===false ? ' done' : ''),
					inner_html		: msg
				})
			})
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlocks the button submit
			publication_button.classList.remove('loading')
			// render_response.process_status_node
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)
	})
}//end update_process_status



/**
* RENDER_PROCESS_REPORT
* @return
*/
const render_process_report = function(options) {

}//end render_process_report



// @license-end
