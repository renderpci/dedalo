// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {run_service_worker,run_worker_cache} from '../../../../login/js/login.js'
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
		render_mode : "list"
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
						// reload JS files
						reload_js_files()
						.then(function(){
							if( confirm('It is recommended to refresh the page to avoid cache problems. Do you wish to continue to do so?') ) {
								location.reload(true);
							}
						})
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

	// dedalo_entity check
		if (page_globals.dedalo_entity==='development') {
			// message development
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'The development site does not allow updating the code',
				class_name		: 'info_text comment',
				parent			: content_data
			})

		}else{
			// form init
			if (self.caller?.init_form) {
				self.caller.init_form({
					submit_label	: 'Update Dédalo code to the latest version',
					confirm_text	: get_label.sure || 'Sure?',
					body_info		: content_data,
					body_response	: body_response,
					trigger : {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'widget_request',
						source	: {
							type	: 'widget',
							model	: 'update_code',
							action	: 'update_code'
						},
						options	: {
							version: page_globals.dedalo_version
						}
					},
					on_submit : async (e, values) => {

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

						// Code information
							const server_ontology_api_response = await data_manager.request({
								url		: server.url,
								body	: {
									dd_api	: 'dd_utils_api',
									action	: 'get_code_update_info',
									source	: {
										action	: 'update_ontology',
									},
									options : {
										version	: page_globals.dedalo_version,
										code	: server.code
									}
								}
							})
							// debug
							if(SHOW_DEBUG===true) {
								console.log('debug server_ontology_api_response:', server_ontology_api_response)
							}
								console.log("server:",server);
							return;
							const result = server_ontology_api_response?.result
							if(!result){
								e.target.classList.remove('lock')
								spinner.remove()
								ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'error',
									inner_html		: server_ontology_api_response.msg || 'Error connecting server',
									parent			: body_response
								})
								return
							}

					},
					on_done : () => {
						// event publish
						// listen by widget update_data_version.init
						event_manager.publish('update_code_done', self)
						// clean browser cache
						reload_js_files()
					}
				})
			}
		}

	// build code version
		if(is_a_code_server){
			render_build_version(self, content_data, body_response)
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* RELOAD_JS_FILES
* Force to clean cache of Dédalo main JS files
* @see login.run_service_worker, login.run_worker_cache
* @return bool
*/
const reload_js_files = async function () {
	// REMOVED TEMPORALLY FOR DEVELOPMENT
	return false;

	const on_message = (event) => {
		switch (event.data.status) {
			case 'ready':
				console.log(`Loading total_files: ${event.data.total_files}`);
				break;
			case 'finish':
				console.log(`Updated total_files: ${event.data.total_files}`, event.data.api_response);
				break;
		}
	}

	run_service_worker({
		on_message	: on_message
	})
	.then(function(response){
		// on service worker registration error (not https support for example)
		// fallback to the former method of loading cache files
		if (response===false) {

			// notify error
				const error = location.protocol==='http:'
					? `register_service_worker fails. Protocol '${location.protocol}' is not supported by service workers. Retrying with run_worker_cache.`
					: `register_service_worker fails (${location.protocol}). Retrying with run_worker_cache.`
				console.error(error);

			// launch worker cache (uses regular browser memory cache)
				run_worker_cache({
					on_message	: on_message
				})
		}

		return true
	})
}//end reload_js_files



const render_build_version = function(self, content_data, body_response){

	if (self.caller?.init_form) {
		self.caller.init_form({
			submit_label	: 'Build Dédalo code',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
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
					branch :'master'
				}
			},
			on_done : () => {
				// event publish
				// listen by widget update_data_version.init
				event_manager.publish('build_code_done', self)
				// clean browser cache
				reload_js_files()
			}
		})
		self.caller.init_form({
			submit_label	: 'Build Dédalo code developer',
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: content_data,
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
					branch :'developer'
				}
			},
			on_done : () => {
				// event publish
				// listen by widget update_data_version.init
				event_manager.publish('build_code_done', self)
				// clean browser cache
				reload_js_files()
			}
		})
	}
}//end render_build_version

// @license-end
