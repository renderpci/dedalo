// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_UPDATE_ONTOLOGY
* Manages the component's logic and appearance in client side
*/
export const render_update_ontology = function() {

	return true
}//end render_update_ontology



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
render_update_ontology.prototype.list = async function(options) {

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
* Creates the content nodes for the widget
* @param object self
* 	widget instance
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// value
		const value = await self.get_widget_value()

	// short vars
		const current_ontology		= value.current_ontology
		const servers				= value.servers
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Current Ontology version: <b>${current_ontology}</b>`,
			parent			: content_data
		})

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// dedalo_entity check
		const server_vars_node = render_server_vars(value)
		content_data.appendChild(server_vars_node)

	// servers. Show the possible servers to synchronize the ontology.
		const servers_list = render_servers_list(value)
		content_data.appendChild(servers_list)

	// form init
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Update Dédalo Ontology to the latest version',
				confirm_text	: confirm_text,
				body_info		: content_data,
				body_response	: body_response,
				inputs			: [{
					type		: 'text',
					name		: 'dedalo_prefix_tipos',
					label		: 'TLD list to update',
					mandatory	: true,
					value		: prefix_tipos
				}],
				on_submit		: async (e, values) => {

					// ar_dedalo_prefix_tipos
						// sample value:
						// [{
						// 	name : "dedalo_prefix_tipos",
						// 	value : "dd,rsc,hierarchy,actv,aup,dmm"
						// }]
						const dedalo_prefix_tipos		= values[0]?.value
						const ar_dedalo_prefix_tipos	= dedalo_prefix_tipos.split(',')
							.map(el => el.trim())
							.filter(el => el.length>1)

						if (!ar_dedalo_prefix_tipos.length) {
							alert("Error: no prefix are selected");
							return
						}

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

					// Ontology information
						const server_ontology_api_response = await data_manager.request({
							url		: server.url,
							body	: {
								dd_api	: 'dd_utils_api',
								action	: 'get_ontology_update_info',
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

					// files_filtered. Only selects math files with user tld section
						const files_filtered = result.files.filter( el => ar_dedalo_prefix_tipos.find(item => item === el.tld) )
						const files_filtered_length = files_filtered.length
						for (let i = 0; i < files_filtered_length; i++) {
							const file_item = files_filtered[i]
							const found = result.info.active_ontologies.find(el => el.tld===file_item.tld)
							if (found) {
								file_item.typology_id	= found.typology_id
								file_item.name_data		= found.name_data
							}
						}

					// API call
						const api_response = await data_manager.request({
							body		: {
								dd_api	: 'dd_area_maintenance_api',
								action	: 'class_request',
								source	: {
									action	: 'update_ontology',
								},
								options : {
									server	: server,
									files	: files_filtered,
									info 	: result.info
								}
							}
						})
						// debug
						if(SHOW_DEBUG===true) {
							console.log('debug update_ontology api_response:', api_response);
						}

					// loading  remove
						spinner.remove()
						e.target.classList.remove('lock')

					// fail case
						if(!api_response){
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: server_ontology_api_response.msg || 'Error connecting server',
								parent			: body_response
							})
							return
						}

					// version compatibility check
						const required_version = api_response.root_info?.properties?.version
						if (!required_version) {
							api_response.errors.push('Unable to get required_version from Ontology')
						}else{
							const version_is_supported = self.supported_code_version(required_version)
							if (!version_is_supported) {
								ui.create_dom_element({
									element_type	: 'h3',
									class_name		: 'warning',
									inner_html		: `
										Warning.
										Your Dédalo code version is too old to work with current Ontology.
										You need code version >= ${required_version}
										Please update Dédalo code ASAP to prevent incompatibility issues!
									`,
									parent			: body_response
								})
							}
						}

					// errors node
						if (api_response.errors.length>0) {
							ui.create_dom_element({
								element_type	: 'pre',
								class_name		: 'error',
								inner_html		: api_response.errors.join('<br />'),
								parent			: body_response
							})
						}

					// message
						const msg = api_response.msg.replace(/\n/g, '<br />');
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'response_node msg',
							inner_html		: msg,
							parent			: body_response
						})

					// remove annoying rqo_string from object
						if (api_response.debug && api_response.debug.rqo_string) {
							delete api_response.debug.rqo_string
						}

					// JSON response PRE
						const response_string = JSON.stringify(api_response, null, 2)
							.replace(/\\n/g, '<br />');
						ui.create_dom_element({
							element_type	: 'pre',
							class_name		: 'response_node_json',
							inner_html		: response_string,
							parent			: body_response
						})

					// menu force to update (server cache files are deleted previously)
						dd_request_idle_callback(
							() => {
								const page = self.caller.caller
								if (page) {
									const menu = page.ar_instances.find(el => el.model==='menu')
									if (menu) {
										menu.refresh({
											build_autoload : true
										})
									}
								}
							}
						)
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)

	// render_rebuild_lang_files
		const rebuild_lang_files_container = render_rebuild_lang_files()
		content_data.appendChild(rebuild_lang_files_container)


	return content_data
}//end get_content_data_edit



/**
* RENDER_SERVERS_LIST
* Creates the list of the available servers to select one
* @param object value
* @return HTMLElment servers_grid
*/
const render_servers_list = function (value) {

	// short vars
	const servers = value.servers || []

	const servers_grid = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'config_grid servers_grid'
	})

	// Servers label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label bold',
		inner_html		: 'Servers',
		parent			: servers_grid
	})
	ui.create_dom_element({
		element_type	: 'div',
		parent			: servers_grid
	})

	const server_len = servers.length;
	for (let i = 0; i < server_len; i++) {

		const current_server = servers[i]

		// server_label
			const server_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label',
				inner_html		: current_server.name,
				title			: current_server.name,
				parent			: servers_grid
			})

		// input checkbox
			const input_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				name 			: 'ontology_server',
				id				: i+1,
				value			: current_server.url
			})
			// change event handler
			const change_handler = (e) => {
				servers.forEach( el => delete el.active )
				current_server.active = input_checkbox.checked
				servers_grid.querySelectorAll('.label, .value').forEach( el => el.classList.remove('active') )
				server_label.classList.add('active')
				value_node.classList.add('active')
			}
			input_checkbox.addEventListener('change', change_handler)
			input_checkbox.addEventListener('click', (e) => {
				e.stopPropagation()
			})

		// value
			const value_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'value',
				inner_html		: current_server.url,
				parent			: servers_grid
			})
			// set the check box and if the status is available and URI is reachable
			if (current_server.response_code === 200) {
				// input_checkbox.checked = true
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button icon check success',
					parent			: value_node
				})
			}else{
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button icon cancel error',
					parent			: value_node
				})
				input_checkbox.disabled = 'disabled'
			}
			server_label.prepend(input_checkbox)
	}


	return servers_grid
}//end render_servers_list



/**
* RENDER_SERVER_VARS
* Creates the list of server constants defined in config related to the
* update of the Ontology
* @param object value
* @return HTMLElement config_grid
*/
const render_server_vars = function (value) {

	// short vars
		const structure_from_server	= value.structure_from_server
		const prefix_tipos			= value.prefix_tipos || []

	// config_grid
		const config_grid = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'config_grid'
		})

	// Config label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label bold',
			inner_html		: 'Config',
			parent			: config_grid
		})
		ui.create_dom_element({
			element_type	: 'div',
			parent			: config_grid
		})

	// add vars
		const add_to_grid = (label, value, grid_container) => {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'label',
				inner_html		: label,
				parent			: grid_container
			})
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'value',
				inner_html		: value,
				parent			: grid_container
			})
		}

		add_to_grid('STRUCTURE_FROM_SERVER', structure_from_server, config_grid)
		add_to_grid('DEDALO_PREFIX_TIPOS', prefix_tipos.join(', '), config_grid)


	return config_grid
}//end render_server_vars



/**
* RENDER_REBUILD_LANG_FILES
* Renders text and button to allow to call API dd_area_maintenance_api->rebuild_lang_files
* @return HTMLElement rebuild_lang_files_container
*/
const render_rebuild_lang_files = function () {

	// rebuild_lang_files_container
		const rebuild_lang_files_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'rebuild_lang_files_container'
		})

	// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Re-builds all Dédalo javascript lang files used to resolve labels like '/dedalo/core/common/js/lang/lg-cat.js'`,
			parent			: rebuild_lang_files_container
		})

	// button submit (make backup)
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: 'Re-build lang label files',
			parent			: rebuild_lang_files_container
		})
		// click event
		const click_handler = async (e) => {
			e.stopPropagation()

			// blur button
			document.activeElement.blur()

			// clean up container
			while (body_response.firstChild) {
				body_response.removeChild(body_response.firstChild);
			}

			// spinner
			const spinner = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'spinner',
				parent			: body_response
			})

			// call API to fire process and get PID
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'rebuild_lang_files'
					},
					options	: {}
				}
			})

			spinner.remove()

			if (!api_response || !api_response.result) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: 'Error: failed make_backup',
					parent			: body_response
				})
				return
			}

			// result_value pre JSON
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'result_value',
				inner_html		: JSON.stringify(api_response, null, 2),
				parent			: body_response
			})
		}
		button_submit.addEventListener('click', click_handler)

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response',
			parent			: rebuild_lang_files_container
		})


	return rebuild_lang_files_container
}//end render_rebuild_lang_files



// @license-end
