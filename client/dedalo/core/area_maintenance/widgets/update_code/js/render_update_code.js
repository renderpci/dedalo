// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {login} from '../../../../login/js/login.js'
	import {render_servers_list} from '../../update_ontology/js/render_update_ontology.js'



/**
* RENDER_UPDATE_CODE
* Client-side render module for the `update_code` maintenance widget.
*
* Provides the visual layout for downloading and installing a new Dédalo code
* release from a configured code server (CODE_SERVERS in config.php). The
* typical flow is:
*
*   1. The area_maintenance page calls `update_code.prototype.list` (aliased
*      here as `render_update_code.prototype.list`).
*   2. `get_content_data_edit` builds the main panel:
*        - Displays the current running version / build from `page_globals`.
*        - Renders the server-selection grid (imported from update_ontology).
*        - Shows the local source-version directory path.
*        - Checks IndexedDB for a still-running update process and resumes its
*          SSE status stream if found.
*        - Presents a "Update Dédalo code" submit button.
*   3. On click the button calls `self.get_code_update_info` (defined in
*      update_code.js) to ask the selected remote server which ZIP files are
*      available for the client's current version.
*   4. `render_info_modal` opens a modal for the administrator to choose an
*      available version, the update mode (incremental | clean), and confirm;
*      then calls `self.update_code` (also in update_code.js) to execute the
*      server-side update.
*   5. After a successful update `force_quit` forces a logout so the new JS
*      module files are loaded from scratch on the next login.
*
* On code-server installations (IS_A_CODE_SERVER or entity === 'development'),
* `render_build_version` appends buttons that trigger a `git archive` of the
* master or developer branch, generating the distributable ZIP files.
*
* Dependencies (from update_code.js prototype assignments):
*   - `self.get_code_update_info(server)` — remote API call
*   - `self.update_code(options)` — remote API call
*   - `self.caller.init_form(...)` — area_maintenance form builder
*   - `self.beta_update` {boolean} — whether development builds are shown
*   - `self.update_mode` {string} — 'incremental' | 'clean'
*
* Exports:
*   render_update_code — constructor (prototype-only; no instance state)
*/
export const render_update_code = function() {

	return true
}//end render_update_code



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
*		render_mode : "list"
*   }
* @returns {HTMLElement} wrapper
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
* Builds and returns the full content panel for the update_code widget.
*
* Responsibilities:
*   - Shows the running Dédalo version and build from `page_globals`.
*   - Renders the server-selection grid (via render_servers_list from
*     render_update_ontology.js).
*   - Displays `dedalo_source_version_local_dir` (the local filesystem path
*     where downloaded ZIP files are temporarily stored).
*   - Polls IndexedDB ('process_update_code' key) to resume an in-progress
*     update's SSE status stream automatically on widget open.
*   - Renders the "Update Dédalo code to the latest version" submit button
*     which orchestrates the full update workflow (get info → show modal).
*   - On code-server environments appends the GIT build buttons via
*     `render_build_version`.
*
* Value shape consumed from `self.value` (set by area_maintenance.get_value
* from update_code.get_value on the server):
*   {
*     servers: [{
*       name: string, url: string, code: string,
*       response_code: number, result: object|false
*     }],
*     dedalo_source_version_local_dir: string,   // e.g. '/srv/tmp/dedalo_update'
*     is_a_code_server: boolean
*   }
*
* @param {Object} self - update_code widget instance (this inside list())
* @returns {Promise<HTMLElement>} content_data div ready to be embedded
*/
const get_content_data_edit = async function(self) {

	// value
		const value = self.value || {}

	// short vars
		const dedalo_source_version_local_dir	= value.dedalo_source_version_local_dir
		const is_a_code_server					= value.is_a_code_server
		const local_db_id						= 'process_update_code'
		const servers							= value.servers || []

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
		// If a previous update was started (browser was closed or page refreshed
		// during the long-running server process), IndexedDB may still hold its
		// PID + pfile. Resume the SSE stream immediately so the user can see
		// the current status on widget open.
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
			// A server must be selected (radio button active in servers_list)
			// before proceeding. The alert message is intentional UI feedback.
			// (!) FLAG: alert() used for UX feedback — not a bug, but
			// consider replacing with a DOM error node for consistency.
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
			// Lock the button while the remote API call is in flight
				e.target.classList.add('lock')
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				body_response.prepend(spinner)

			// Code information. Call selected remote server API to get updates list
			// This contacts the server's dd_utils_api -> get_code_update_info and
			// returns the list of available ZIP files for the client's current version.
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
				// `result` matches the server response shape:
				// { info: { entity_label, version, ... }, files: [{version, url, date, force_update_mode?}] }
					render_info_modal( self, result )

				// remove spinner
				e.target.classList.remove('lock')
				spinner.remove()
		}
		button_submit.addEventListener('click', click_event)

	// build code version
	// Only rendered on code-server instances or the 'development' entity.
	// These buttons invoke build_version_from_git_master on the server side to
	// produce the distributable ZIP archives from the GIT repository.
		if(is_a_code_server || page_globals.dedalo_entity==='development'){
			render_build_version(self, content_data, body_response)
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* FORCE_QUIT
* Forces a Dédalo logout after a successful code update.
*
* After the server files are replaced the browser still holds the old ES
* module cache (Dédalo JS files have no Cache-Control max-age and
* query-string version busting cannot bust already-imported modules).
* The only reliable way to force the browser to load the new code is to
* fully reload the page — which happens automatically on the next login.
*
* The user is warned via alert() before the session is destroyed.
* (!) FLAG: alert() is intentional here to ensure the user reads the
* message before being logged out. A modal alternative could be considered.
*
* @see login.quit for the actual session-destruction logic.
* @returns {Promise<boolean>} Resolves true once login.quit() resolves.
*/
const force_quit = async function () {

	alert('You must exit and login again to continue.');

	// force exit Dédalo (login quit)
	await login.quit()

	return true
}//end force_quit



/**
* RENDER_BUILD_VERSION
* Appends GIT build action buttons to the widget panel.
*
* Only rendered when `self.caller.init_form` is available (i.e. when the
* widget is hosted inside an area_maintenance page that provides the form
* builder). Each button calls the server-side API action
* `build_version_from_git_master` with the selected branch name.
*
* Two buttons are rendered:
*   - "Build Dédalo code master branch"   → branch: 'master'
*   - "Build Dédalo code developer branch" → branch: 'developer'
*
* The confirm text is computed once via an IIFE that reads the running
* version from `page_globals.dedalo_version`.
*
* When either build completes, the `on_done` callback publishes the
* 'build_code_done' event so the data-version widget (update_data_version)
* can refresh automatically.
*
* `event_manager` is imported at the top of this file (mirroring
* render_update_ontology.js) so the `build_code_done` publish below resolves.
*
* @see login.run_service_worker, login.run_worker_cache
* @param {Object} self - update_code widget instance
* @param {HTMLElement} content_data - the main content container to append to
* @param {HTMLElement} body_response - the response area passed to init_form
* @returns {boolean|undefined} Returns nothing meaningful; side-effects only.
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
* Opens a modal dialog that lets the administrator select a code version and
* update mode, then executes the update via `self.update_code`.
*
* Modal structure:
*   - Header: server entity label from versions_info.info.entity_label.
*   - Body:
*       - "Beta updates" checkbox — when checked, '.development' file rows
*         are shown; otherwise they are hidden.
*       - files_container — one radio-button row per available ZIP file
*         (version label, URL, build date). The first non-development entry
*         is pre-selected.
*   - Footer:
*       - update_mode radio group: 'incremental' | 'clean'.
*         If `force_update_mode === 'clean'` is set on the selected file,
*         the mode container is locked and 'clean' is forced automatically.
*       - "Update" button — triggers the actual update API call.
*       - response area for success / error feedback.
*
* versions_info shape (from update_code.prototype.get_code_update_info →
*   dd_utils_api -> get_code_update_info on the code server):
*   {
*     info: {
*       entity_label: string,   // e.g. "Dédalo master"
*       version: string,
*       date: string,
*       entity_id: number,
*       entity: string,
*       host: string,
*       tool_names: string[]
*     },
*     files: [{
*       version: string,            // e.g. "6.4.1" or "development"
*       url: string,                // HTTPS URL to the .zip file
*       date: string,               // file mtime
*       force_update_mode?: string  // "clean" if this release requires it
*     }]
*   }
*
* Side effects:
*   - Mutates `files[i].active` to track the currently selected version.
*   - Mutates `self.update_mode` on radio-group change.
*   - Mutates `self.beta_update` on close (reset to false).
*   - Calls `force_quit()` asynchronously after a successful update (1 s delay).
*
* SEC-XSS-009: API error strings and update messages are written via
* `textContent` / `createTextNode`, never via `innerHTML`, to prevent
* injection of shell/git output that may contain HTML metacharacters.
*
* @param {Object} self - update_code widget instance
* @param {Object} versions_info - result object from get_code_update_info
* @returns {HTMLElement} modal element (already attached to the DOM)
*/
const render_info_modal = function( self, versions_info ) {

	// store nodes pointers
	// Shared reference object so inner closures (set_update_mode, click_handler)
	// can reach the dynamically created radio inputs without closure capture issues.
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
	// Toggle visibility of '.development' file rows in the files_container.
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

		/**
		* SET_UPDATE_MODE
		* Inspects a version entry and locks the update-mode radio group to
		* 'clean' when the release mandates it (force_update_mode === 'clean').
		* Called when the user selects a different file radio button.
		* @param {Object|undefined} current_version - the currently active file entry
		*/
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
		// valid_files collects every rendered entry for later length check
		// (if 0, the "no updates available" branch is shown instead of the
		// update-mode / button UI).
		const valid_files = []
		for (let i = 0; i < files_length; i++) {

			const current_version = files[i];

			// Each file gets its own container; '.development' class lets the
			// beta-updates toggle show/hide it via CSS.
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
			// Activates the selected version: marks it on the `files` array,
			// highlights the label / value nodes, and triggers forced-mode check.
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
			// The files array is ordered newest-first by the server (see
			// get_code_update_info in class.update_code.php). Index 0 is
			// pre-selected unless it is the development/beta entry.
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
			// This branch is shown when the server has no ZIP files newer
			// than the client version. The full server response is dumped
			// as JSON for diagnostic purposes.

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
			// incremental → rsync-based overlay (preserves existing files not in ZIP)
			// clean       → full directory swap: backup old, copy new, migrate media/local
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

					// Validate that a version file and an update mode are both chosen
					// before calling the API; guard the 'development' entity from
					// accidental overwrites.
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

					if (page_globals.dedalo_entity==='development') {
						// message development
						// (!) Safety guard: 'development' installations must never be
						// auto-updated to prevent accidental code overwrites during dev work.
						// Checked before mutating the UI so the button/mode stay visible.
						alert('To avoid accidental overwrites, the development installation does not allow updating the code.');
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

					// SEC-XSS-009: static text; textContent avoids unnecessary HTML parsing.
					response.textContent = 'Updating. Please wait'

					// update_code
					// Delegates to update_code.prototype.update_code (update_code.js)
					// which calls dd_area_maintenance_api -> widget_request -> update_code.
					// The timeout is set to 1 hour because downloading + extracting a
					// ZIP can be very slow on limited-bandwidth servers.
					const api_response = await self.update_code({
						info		: versions_info.info,
						file_active	: file_active,
						update_mode	: self.update_mode
					})

					body.classList.remove('loading')

					// spinner
					spinner.remove()

					if (!api_response.result || api_response.errors?.length) {

						// SEC-XSS-009: api_response.errors may contain shell/git output with
						// HTML metacharacters. Build the DOM: each error becomes a text
						// node separated by <br>, so content is never HTML-parsed.
						response.replaceChildren()
						if (api_response.errors.length) {
							api_response.errors.forEach((err, idx) => {
								if (idx > 0) response.appendChild(document.createElement('br'))
								response.appendChild(document.createTextNode(String(err)))
							})
						} else {
							response.textContent = api_response.msg || 'Unknown error on API update_code'
						}

						button_update.classList.remove('hide')
						update_mode_container.classList.remove('hide')

					}else{

						// SEC-XSS-009
						response.textContent = api_response.msg || 'OK'

						// force quit to clean browser cache
						// The 1-second delay gives the response text time to render
						// before the page is redirected to the login screen.
						setTimeout(function(){
							force_quit()
						}, 1000)
					}
				}
				button_update.addEventListener('click', click_handler)
				// Focus the Update button immediately so keyboard users can confirm
				// without moving focus away from the modal.
				dd_request_idle_callback(
					() => {
						button_update.focus()
					}
				)

				// fire the check if the active has a forced update mode
				// Applies any forced-mode lock for the pre-selected (index 0) version.
				set_update_mode( nodes.current_version_active  )
		}

	// response add at end (after buttons)
		footer.appendChild(response)

	// modal
	// Size override: 65rem wide to accommodate the long ZIP URLs in the file list.
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer,
			size		: 'normal',
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '65rem'
			},
			on_close : () => {
				// Reset beta_update so development rows are hidden again if the
				// modal is re-opened.
				self.beta_update = false
			}
		})
		modal.classList.add('widget_update_code_modal')


	return modal
}//end render_info_modal



// @license-end
