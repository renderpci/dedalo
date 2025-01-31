// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {quit} from '../../../../login/js/login.js'
	import {render_servers_list} from '../../update_ontology/js/render_update_ontology.js'



/**
* RENDER_UPDATE_CODE
* Manages the component's logic and appearance in client side
*/
export const render_update_code = function() {

	return true
}//end render_update_code



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
*		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_update_code.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
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
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// value
		const value = await self.get_value() || {}

	// short vars
		const dedalo_source_version_local_dir	= value.dedalo_source_version_local_dir
		const is_a_code_server					= value.is_a_code_server
		const local_db_id						= 'process_update_code'
		const servers							= value.servers

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		const text = `Current version: <b>${page_globals.dedalo_version}</b><br>
					  Current build: <b>${page_globals.dedalo_build}</b>`
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: content_data
		})

	// servers. Show the possible servers to synchronize the ontology.
		const servers_list = render_servers_list( value )
		content_data.appendChild(servers_list)

		// dedalo_source_version_local_dir
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'dedalo_source_version_local_dir: ' + dedalo_source_version_local_dir,
			class_name		: 'info_text light',
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

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
						id				: local_db_id,
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

						// force quit to reload JS files
						force_quit()
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
				local_db_id,
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

	// button_submit
		const button_label = 'Update Dédalo code to the latest version';
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: button_label,
			parent			: content_data
		})
		// click event
		const click_event = async (e) => {
			e.stopPropagation()

			// server to be used
				const server = servers.find(el => el.active === true )
				if( !server ){
					alert("Error: any server was selected");
					return
				}

			// clean body_response nodes
				while (body_response.firstChild) {
					body_response.removeChild(body_response.firstChild);
				}

			// loading add
				e.target.classList.add('lock')
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				body_response.prepend(spinner)

			// Code information. Call selected remote server API to get updates list
				const server_code_api_response = await self.get_code_update_info(server)

				// result check
					const result = server_code_api_response?.result
					const errors = server_code_api_response?.errors || []
					if(!result || errors.length){
						// remove spinner
						e.target.classList.remove('lock')
						spinner.remove()
						// error message node add
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'error',
							inner_html		: server_code_api_response.msg || 'Error connecting server',
							parent			: body_response
						})
						// additional errors
						const errors_length = errors.length
						for (let i = 0; i < errors_length; i++) {
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: errors[i],
								parent			: body_response
							})
						}
						return
					}

				// show info modal
					render_info_modal( self, result )

				// remove spinner
				e.target.classList.remove('lock')
				spinner.remove()
		}
		button_submit.addEventListener('click', click_event)

	// build code version
		if(is_a_code_server || page_globals.dedalo_entity==='development'){
			render_build_version(self, content_data, body_response)
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* FORCE_QUIT
* Force log out to clean cache of Dédalo main JS files
* @see login.quit
* @return bool
*/
const force_quit = async function () {

	alert('You must exit and login again to continue.');

	// force exit Dédalo (login quit)
	await quit()

	return true
}//end force_quit



/**
* RENDER_BUILD_VERSION
* Render buttons
* @see login.run_service_worker, login.run_worker_cache
* @return bool
*/
const render_build_version = function(self, content_data, body_response){

	if (self.caller?.init_form) {

		// build_version_group
		const build_version_group = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'build_version_group',
			parent			: content_data
		})

		// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label bold',
			inner_html		: 'Code builders from GIT',
			parent			: build_version_group
		})

		// on_done. On button press, execute this function
		const on_done = () => {

			// event publish
			// listen by widget update_data_version.init
			event_manager.publish('build_code_done', self)
		}

		// button Build Dédalo code MASTER branch
		self.caller.init_form({
			submit_label	: 'Build Dédalo code master',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: build_version_group,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'widget_request',
				source	: {
					type	: 'widget',
					model	: 'update_code',
					action	: 'build_version_from_git_master'
				},
				options	: {
					branch : 'master'
				}
			},
			on_done : on_done
		})

		// button Build Dédalo code DEVELOPER branch
		self.caller.init_form({
			submit_label	: 'Build Dédalo code developer',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: build_version_group,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'widget_request',
				source	: {
					type	: 'widget',
					model	: 'update_code',
					action	: 'build_version_from_git_master'
				},
				options	: {
					branch : 'developer'
				}
			},
			on_done : on_done
		})

		// button Build Dédalo code beta 6.4 branch
		self.caller.init_form({
			submit_label	: 'Build Dédalo code beta 6.4',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: build_version_group,
			body_response	: body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'widget_request',
				source	: {
					type	: 'widget',
					model	: 'update_code',
					action	: 'build_version_from_git_master'
				},
				options	: {
					branch : 'v6.4.0_beta'
				}
			},
			on_done : on_done
		})
	}
}//end render_build_version



/**
* RENDER_INFO_MODAL
* Render modal with the options list
* @param object self
* 	widget instance
* @param object versions_info
* @return HTMLElement modal
*/
const render_info_modal = function( self, versions_info ){

	// blur any selection
		document.activeElement.blur();

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_node		: versions_info.info.entity_label
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body widget_update_code'
		})

	// beta updates on/off
		const beta_updates_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'beta_updates_container',
			parent			: body
		})
		const beta_updates_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'version_label',
			text_node		: 'Beta updates',
			parent			: beta_updates_container
		})
		const beta_update_radio = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			name			: 'beta_updates',
			value			: true
		})
		// change event
		const change_handler = (e) => {
			// fix checked value
			self.beta_update = beta_update_radio.checked
			// hide/show available development versions (betas)
			body.querySelectorAll('.development')
			.forEach( el => {
				if (self.beta_update) {
					el.classList.remove('hide')
				}else{
					el.classList.add('hide')
				}
			})
		}
		beta_update_radio.addEventListener('change', change_handler)
		beta_updates_label.prepend(beta_update_radio)

	// files_container
		const files_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_container',
			parent			: body
		})

	// files
		const files = versions_info.files
		const files_length = files.length
		const valid_files = []
		for (let i = 0; i < files_length; i++) {

			const current_version = files[i];

			const file_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_container ' + current_version.version,
				parent			: files_container
			})
			if (current_version.version==='development' && !self.beta_update) {
				file_container.classList.add('hide')
			}

			const label = current_version.version
			const version_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'version_label unselectable',
				text_node		: label,
				parent			: file_container
			})

			// input checkbox
			const input_radio = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				name			: 'version',
				id				: i+1,
				value			: current_version.url
			})

			// by default, the newer version is selected
			if(i===0 && current_version.version!=='development'){
				input_radio.checked = true
				current_version.active = true
			}
			// change event handler
			const change_handler = (e) => {
				files.forEach( el => delete el.active )
				current_version.active = input_radio.checked
				body.querySelectorAll('.label, .value').forEach( el => el.classList.remove('active') )
				version_label.classList.add('active')
				value_node.classList.add('active')
			}
			input_radio.addEventListener('change', change_handler)
			input_radio.addEventListener('click', (e) => {
				e.stopPropagation()
			})

			// value
			const value_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: current_version.url,
				parent			: file_container
			})

			version_label.prepend(input_radio)

			// add to valid_files
			valid_files.push(current_version)
		}//end for (let i = 0; i < files_length; i++)

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'content'
		})

		// response
		const response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response content'
		})

		if (valid_files.length===0) {

			// No updated found

			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content',
				inner_html		: 'There are no valid updates available for your version.',
				parent			: response
			})

			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'content',
				inner_html		: JSON.stringify(versions_info, null, 2),
				parent			: response
			})

		}else{

			// button_update
				const button_update = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'success',
					inner_html		: get_label.update || 'Update',
					parent			: footer
				})
				// click event
				const click_handler = async (e) => {
					e.stopPropagation()

					const file_active = files.find(el => el.active === true)
					if (!file_active) {
						alert(get_label.empty_selection || 'Empty selection');
						return
					}

					if (!confirm(get_label.sure || 'Sure?')) {
						return
					}

					if (page_globals.dedalo_entity==='development') {
						// message development
						alert('To avoid accidental overwrites, the development installation does not allow updating the code.');
						return
					}

					button_update.classList.add('hide')
					body.classList.add('loading')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: 'spinner',
						parent			: footer
					})

					response.innerHTML = 'Updating. Please wait'

					// update_code
					const api_response = await self.update_code(file_active)

					body.classList.remove('loading')

					// spinner
					spinner.remove()

					if (!api_response.result || api_response.errors?.length) {

						response.innerHTML = api_response.errors.length
							? api_response.errors.join('<br>')
							: api_response.msg || 'Unknown error on API update_code'

						button_update.classList.remove('hide')

					}else{

						response.innerHTML = api_response.msg || 'OK'

						// force quit to clean browser cache
						setTimeout(function(){
							force_quit()
						}, 1000)
					}
				}
				button_update.addEventListener('click', click_handler)
				dd_request_idle_callback(
					() => {
						button_update.focus()
					}
				)
		}

	// response add at end (after buttons)
		footer.appendChild(response)

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer,
			size		: 'normal',
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '60rem'
			},
			on_close : () => {
				self.beta_update = false
			}
		})
		modal.classList.add('widget_update_code_modal')


	return modal
}//end render_info_modal



// @license-end
