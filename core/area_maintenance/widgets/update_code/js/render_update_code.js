// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {login} from '../../../../login/js/login.js'
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
* Renders content data div
* @param object self
* 	widget instance
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

		// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				local_db_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_db_id,
						local_data.value.pid,
						local_data.value.pfile,
						body_response,
						1000,
						() => {
							// force quit to reload JS files
							force_quit()
						}
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
				if(SHOW_DEBUG===true) {
					console.log('))) get_content_data_edit server_code_api_response:', server_code_api_response);
				}

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
	await login.quit()

	return true
}//end force_quit



/**
* RENDER_BUILD_VERSION
* Render GIT build buttons for versions: master|developer
* @see login.run_service_worker, login.run_worker_cache
* @param object self
* 	widget instance
* @param HTMLElement content_data
* @param HTMLElement body_response
* @return bool
*/
const render_build_version = function(self, content_data, body_response) {

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
			submit_label	: 'Build Dédalo code master branch',
			confirm_text	: (()=>{
								const ar_version	= page_globals.dedalo_version.split('.')
								const major_version	= ar_version[0]
								const version		= [ar_version[0],ar_version[1],ar_version[2]].join('.')
								return `A file using current version (${version}) will be created as: \n\n/dedalo/code/${major_version}/${version}/${version}_dedalo.zip\n`
							  })(),
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
			submit_label	: 'Build Dédalo code developer branch',
			confirm_text	: (()=>{
								const ar_version	= page_globals.dedalo_version.split('.')
								const major_version	= ar_version[0]
								const version		= [ar_version[0],ar_version[1],ar_version[2]].join('.')
								return `A file will be created as: \n\n/dedalo/code/development/dedalo_development.zip\n`
							  })(),
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
const render_info_modal = function( self, versions_info ) {

	// store nodes pointers
		const nodes = {}

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
			class_name		: 'beta_updates_container unselectable',
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

		const set_update_mode = function ( current_version ){
			// check if current version is active (if the update has not new updates it will be undefined)
			if(!current_version){
				return false
			}
			// check if the file force to use clean.
			if( current_version.force_update_mode && current_version.force_update_mode ==='clean'){
				nodes.update_mode_container.classList.add('lock');
				// nodes.incremental_radio.classList.add('hide');
				nodes.clean_radio.checked = true;
				self.update_mode = 'clean';
			}else{
				nodes.update_mode_container.classList.remove('lock');
			}
		}

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

			// change event handler
			const change_handler = (e) => {
				set_update_mode( current_version )
				files.forEach( el => delete el.active )
				current_version.active = input_radio.checked
				body.querySelectorAll('.label, .value').forEach( el => el.classList.remove('active') )
				version_label.classList.add('active')
				value_node.classList.add('active')
				date_node.classList.add('active')
			}
			input_radio.addEventListener('change', change_handler)
			input_radio.addEventListener('click', (e) => {
				e.stopPropagation()
			})

			// value (URL)
			const value_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: current_version.url,
				parent			: version_label
			})

			// date
			const date_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value date',
				inner_html		: current_version.date || '',
				parent			: version_label
			})

			version_label.prepend(input_radio)

			// by default, the newer version is selected
			if(i===0 && current_version.version!=='development'){
				input_radio.checked = true
				current_version.active = true
				// save the pointer to be called
				nodes.current_version_active = current_version
			}

			// add to valid_files
			valid_files.push(current_version)
		}//end for (let i = 0; i < files_length; i++)

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content'
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

			// update_mode: incremental | clean
				const update_mode_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'update_mode_container',
					parent			: footer
				})
				const change_mode_handler = (e)=> {
					self.update_mode = e.target.value;
				}
				// save the pointer to be called
				nodes.update_mode_container = update_mode_container
				// option incremental
				const incremental_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'incremental_label unselectable',
					text_node		: get_label.incremental || 'Incremental',
					parent			: update_mode_container
				})
				const incremental_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'update_mode',
					value			: 'incremental'
				})
				incremental_radio.addEventListener('change', change_mode_handler)
				incremental_label.prepend(incremental_radio)

				// save the pointer to be called
				nodes.incremental_radio = incremental_radio

				// option clean
				const clean_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'clean_label unselectable',
					text_node		: get_label.clean || 'Clean',
					parent			: update_mode_container
				})
				const clean_radio = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					name			: 'update_mode',
					value			: 'clean'
				})
				clean_radio.addEventListener('change', change_mode_handler)
				clean_label.prepend(clean_radio)

				// save the pointer to be called
				nodes.clean_radio = clean_radio

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

					if (!self.update_mode) {
						alert(get_label.update_mode_mandatory || 'Update mode is mandatory');
						return
					}

					if (!confirm(get_label.sure || 'Sure?')) {
						return
					}

					button_update.classList.add('hide')
					update_mode_container.classList.add('hide')
					body.classList.add('loading')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'spinner',
						parent			: footer
					})

					response.innerHTML = 'Updating. Please wait'

					if (page_globals.dedalo_entity==='development') {
						// message development
						alert('To avoid accidental overwrites, the development installation does not allow updating the code.');
						return
					}

					// update_code
					const api_response = await self.update_code({
						info		: versions_info.info,
						file_active	: file_active,
						update_mode	: self.update_mode
					})

					body.classList.remove('loading')

					// spinner
					spinner.remove()

					if (!api_response.result || api_response.errors?.length) {

						response.innerHTML = api_response.errors.length
							? api_response.errors.join('<br>')
							: api_response.msg || 'Unknown error on API update_code'

						button_update.classList.remove('hide')
						update_mode_container.classList.remove('hide')

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

				// fire the check if the active has a forced update mode
				set_update_mode( nodes.current_version_active  )
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
				dd_modal.modal_content.style.width = '65rem'
			},
			on_close : () => {
				self.beta_update = false
			}
		})
		modal.classList.add('widget_update_code_modal')


	return modal
}//end render_info_modal



// @license-end
