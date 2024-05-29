// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {when_in_dom} from '../../../../common/js/events.js'
	import {render_stream} from '../../../../common/js/render_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'

	// hljs
	import hljs from '../../../../../lib/highlightjs/es/core.min.js';
	import php from '../../../../../lib/highlightjs/es/languages/php.js';
	hljs.registerLanguage('php', php);



/**
* RENDER_UPDATE_DATA_VERSION
* Manages the widget logic and appearance in client side
*/
export const render_update_data_version = function() {

	return true
}//end render_update_data_version



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_update_data_version.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const value						= self.value || {}
		const update_version			= value.update_version
		const current_version_in_db		= value.current_version_in_db
		const dedalo_version			= value.dedalo_version
		const updates					= value.updates
		const process_id				= 'process_update_data_version'

	// maintenance_mode from environment
		const maintenance_mode = page_globals.maintenance_mode

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// dedalo_db_management
		if (!update_version) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_text success_text',
				inner_html		: 'Data format is updated: ' + current_version_in_db.join('.'),
				parent			: content_data
			})
			return content_data
		}

	// info
		const text = 'To update data version: ' + current_version_in_db.join('.') + ' ---> ' + update_version.join('.')
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text error_text',
			inner_html		: text,
			parent			: content_data
		})

	// updates
		const updates_checked = {}
		if (updates) {

			const updates_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'updates_container',
				parent			: content_data
			})

			for (const [key, current_value] of Object.entries(updates)) {
				// console.log(`${key}: `, current_value);
				// if (!Array.isArray(current_value)) {
				// 	continue; // skip non array elements
				// }

				const current_value_length = current_value.length

				switch (key) {
					case 'alert_update':
						for (let i = 0; i < current_value_length; i++) {
							const item = current_value[i]
							// alert_update_node
							ui.create_dom_element({
								element_type	: 'h2',
								class_name		: 'alert_update',
								inner_html		: item.command || item.notification,
								parent			: content_data
							})
						}
						break;

					case 'SQL_update':
					case 'components_update':
					case 'run_scripts':
						for (let i = 0; i < current_value_length; i++) {

							const item = current_value[i]

							// key_name as 'components_update_1'
							const key_name = key + '_' + i

							// label as 'SQL_update', 'components_update', run_scripts'
								if (i===0) {
									ui.create_dom_element({
										element_type	: 'h6',
										class_name		: '',
										inner_html		: key,
										parent			: content_data
									})
								}

							// command container
								const command_node = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'command',
									parent			: content_data
								})

							// key as 1
								ui.create_dom_element({
									element_type	: 'span',
									class_name		: 'vkey',
									inner_html		: i+1,
									parent			: command_node
								})

							// checkbox
								const input_checkbox = ui.create_dom_element({
									element_type	: 'input',
									type			: 'checkbox',
									class_name		: 'checkbox_selector',
									parent			: command_node
								})
								input_checkbox.checked = true
								input_checkbox.addEventListener('change', function(e) {
									updates_checked[key_name] = input_checkbox.checked
									if (!input_checkbox.checked) {
										// unchecked case
										command_node.classList.add('disable')
									}else{
										command_node.classList.remove('disable')
									}
								})

							// value as 'component_3d'
								const vkey_value_node = ui.create_dom_element({
									element_type	: 'span',
									class_name		: 'vkey_value',
									inner_html		: typeof item==='string' ? item.trim() : JSON.stringify(item, null, 2),
									parent			: command_node
								})

							// updates_checked set
								updates_checked[key_name] = input_checkbox.checked // true // default
						}
						break;
				}
			}//end or (const [key, current_value] of Object.entries(updates))

			// highlight code tags inside alert_update
			when_in_dom(content_data, ()=>{
				content_data.querySelectorAll('code').forEach((el) => {
					hljs.highlightElement(el);
			  });
			})
		}

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		switch (true) {
			case (page_globals.is_root!==true):
				// message not allowed
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'warning',
					inner_html		: 'Only root user can do this action',
					parent			: body_response
				})
				break;
			case (maintenance_mode!==true):
				// message not allowed
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'warning',
					inner_html		: 'Update data is not allowed if Dédalo is not in maintenance_mode',
					parent			: body_response
				})
				break;
			default:
				// create the submit button
				self.caller.init_form({
					submit_label	: self.name,
					confirm_text	: get_label.sure || 'Sure?',
					body_info		: content_data,
					body_response	: body_response,
					on_submit	: () => {

						// check empty selection
							const empty_selection = Object.values(updates_checked).every((v) => v === false)
							if (empty_selection) {
								const msg = (get_label.empty_selection || 'Empty selection') + '. Continue?'
								if (!confirm( msg )) {
									return
								}
							}

						// update_data_version
							update_data_version()
							.then(function(response){
								update_process_status(
									response.pid,
									response.pfile,
									body_response
								)
							})
					}
				})
				break;
		}

	// update_data_version
		const update_data_version = async () => {
			if(SHOW_DEBUG===true) {
				console.log('))) updates_checked:', updates_checked);
			}

			// update_data_version process fire
			const response = await data_manager.request({
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action	: 'update_data_version',
					},
					options : {
						background_running	: true, // set run in background CLI
						updates_checked		: updates_checked
					}
				}
			})

			return response
		}//end update_data_version

	// update_process_status
		const update_process_status = function(pid, pfile, container) {

			// get_process_status from API and returns a SEE stream
				data_manager.request_stream({
					body : {
						dd_api		: 'dd_utils_api',
						action		: 'get_process_status',
						update_rate	: 1000, // int milliseconds
						options		: {
							pid		: pid,
							pfile	: pfile
						}
					}
				})
				.then(function(stream){

					// render base nodes and set functions to manage
					// the stream reader events
					const render_stream_response = render_stream({
						container		: container,
						id				: process_id,
						pid				: pid,
						pfile			: pfile,
						display_json	: true
					})

					// on_read event (called on every chunk from stream reader)
					const on_read = (sse_response) => {
						// fire update_info_node on every reader read chunk
						render_stream_response.update_info_node(sse_response)
					}

					// on_done event (called once at finish or cancel the stream read)
					const on_done = () => {
						// is triggered at the reader's closing
						render_stream_response.done()
					}

					// read stream. Creates ReadableStream that fire
					// 'on_read' function on each stream chunk at update_rate
					// (1 second default) until stream is done (PID is no longer running)
					data_manager.read_stream(stream, on_read, on_done)
				})
		}//end update_process_status

		// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				process_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data



// @license-end
