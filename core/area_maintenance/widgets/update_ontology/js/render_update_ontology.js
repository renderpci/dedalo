// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_UPDATE_ONTOLOGY
* Client-side rendering module for the `update_ontology` maintenance widget.
*
* This module builds every DOM subtree shown inside the "Update Ontology" card of
* `area_maintenance`.  It is the view layer only — data fetching, version checking,
* and the actual server-side import are delegated to the widget instance
* (`update_ontology.js`) and to `class.update_ontology.php` on the server.
*
* Widget workflow (high-level)
* ----------------------------
* 1. `list()` (entry point) calls `get_content_data_edit()` to build the full UI
*    and wraps it in the standard `ui.widget.build_wrapper_edit` shell.
* 2. `get_content_data_edit()` assembles four distinct sub-panels in order:
*    a. **Current ontology info** — displays the version/date/host from `dd1` properties
*       (supplied by the server in `self.value.current_ontology`).
*    b. **Config panel** (`render_server_vars`) — reads-only display of the two PHP
*       constants that control ontology source: `STRUCTURE_FROM_SERVER` and
*       `DEDALO_PREFIX_TIPOS`.
*    c. **Server selector** (`render_servers_list`, also exported) — radio buttons for
*       each entry in `self.value.servers`.  Selecting a server fires the
*       `ontology_server_select_change` event carrying the server's TLD list; the
*       form input for prefix tipos updates accordingly.
*    d. **Main update form** (via `self.caller.init_form`) — collects the TLD prefix
*       list, then on submit:
*         i.  Calls `dd_utils_api::get_ontology_update_info` on the selected remote
*             server to discover available ontology files.
*         ii. Filters files to only those matching the chosen TLDs, always prepending
*             `matrix_dd` (the shared private-list file).
*         iii. Dispatches `self.update_ontology()` (→ `dd_area_maintenance_api::
*              widget_request` → `class.update_ontology::update_ontology`) which
*              downloads, imports, and rebuilds lang files server-side.
*         iv. Checks the new ontology's required code version against the running
*             Dédalo version and warns if the code is too old.
*    e. **Rebuild lang files** (`render_rebuild_lang_files`) — standalone button that
*       calls `dd_area_maintenance_api::class_request::rebuild_lang_files` without
*       needing a full ontology update.
*    f. **Export to translate** (`render_export_to_translate`) — generates a CSV of
*       all ontology term records for the selected TLDs and languages, filtered by a
*       user-supplied model-exclusion regex list.  The CSV is downloaded directly via a
*       programmatically clicked `<a>` element.
*
* Public exports
* --------------
*   render_update_ontology  — prototype constructor; `edit` and `list` are assigned
*                             onto `update_ontology` in `update_ontology.js`.
*   render_servers_list     — exported so other modules can reuse the server-picker
*                             UI (e.g. for future wizard steps).
*
* Caller contract
* ---------------
* `self` (the `update_ontology` widget instance) is expected to have:
*   - `self.value`           {Object}  payload from `class.update_ontology::get_value()`
*   - `self.events_tokens`   {Array}   accumulates event subscription tokens for cleanup
*   - `self.caller`          {Object}  the parent widget_common instance; must expose
*                                      `init_form(config)` (≡ `build_form` from
*                                      `render_area_maintenance.js`)
*   - `self.update_ontology` {Function} prototype method (from `update_ontology.js`)
*   - `self.supported_code_version` {Function} version comparator (from `update_ontology.js`)
*
* Server peer:  core/area_maintenance/widgets/update_ontology/class.update_ontology.php
* Instance:     core/area_maintenance/widgets/update_ontology/js/update_ontology.js
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_UPDATE_ONTOLOGY
* Prototype constructor for the update_ontology render module.
*
* This is a no-op constructor; all rendering logic lives in the prototype methods
* `list` and `edit` below.  In `update_ontology.js` both methods are assigned onto
* the `update_ontology` prototype so that the standard `widget_common` lifecycle
* (init → build → render) invokes them through `self`.
*
* Never instantiate `render_update_ontology` directly; use an `update_ontology`
* instance obtained through `area_maintenance`'s dynamic widget loader.
*/
export const render_update_ontology = function() {

	return true
}//end render_update_ontology



/**
* LIST
* Entry-point render method for the update_ontology widget.
*
* Builds the complete maintenance UI for the Ontology update workflow and returns a
* standard wrapper element ready to be inserted into the `area_maintenance` card body.
*
* Two execution paths are controlled by `options.render_level`:
*   - `'content'` — returns only the inner `content_data` node (used by callers that
*     supply their own outer wrapper, e.g. partial refreshes).
*   - `'full'` (default) — wraps `content_data` in the standard `ui.widget.build_wrapper_edit`
*     shell and attaches a `wrapper.content_data` reference for external access.
*
* This method is assigned onto both `update_ontology.prototype.edit` and
* `update_ontology.prototype.list` so the standard widget lifecycle calls it for
* both edit and list render modes.
*
* @param {Object} options - Render options
* @param {string} [options.render_level='full'] - `'full'` or `'content'`
* @returns {Promise<HTMLElement>} The wrapper (full) or content_data (content) node
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
* Builds the full inner content DOM for the update_ontology widget.
*
* Assembles all sub-panels in document order and wires up all event subscriptions.
* This is a private function (not exported); it is called only by `list()`.
*
* `self.value` shape (from `class.update_ontology::get_value()`):
* ```
* {
*   current_ontology : { version, date, host, entity, entity_label },
*   servers          : [{ name, url, code, tld?, response_code, result? }],
*   prefix_tipos     : string[],   // e.g. ['dd','ontology','rsc']
*   structure_from_server : boolean|null,
*   confirm_text     : string      // destructive-action warning shown in confirm dialog
* }
* ```
*
* The `on_render` callback of `init_form` subscribes to `ontology_server_select_change`
* so the TLD prefix input auto-fills from whichever server the user picks.  The token
* is pushed into `self.events_tokens` so `widget_common::destroy()` can unsubscribe.
*
* The `on_submit` callback performs a two-phase async operation:
*   Phase 1 — `get_ontology_update_info` on the remote server (up to 1 hour timeout).
*   Phase 2 — `self.update_ontology()` with the filtered file list (same timeout).
* Both phases display inline spinners and results inside `body_response`.
*
* After a successful update, `dd_request_idle_callback` triggers a menu refresh so
* the navigation cache (rebuilt on the server as part of the update) is reloaded
* without a full page reload.
*
* @param {Object} self - The `update_ontology` widget instance (`this` from `list()`)
* @returns {Promise<HTMLElement>} The assembled `content_data` container
*/
const get_content_data_edit = async function(self) {

	// value
		const value = self.value || {}

	// short vars
		const current_ontology		= value.current_ontology || {}
		const servers				= value.servers || []
		const prefix_tipos			= value.prefix_tipos || []
		const confirm_text			= value.confirm_text || 'Sure?'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info_text: display the installed ontology's version badge and the source location
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Current Ontology info <b>${current_ontology.version}</b> <span class="note">(extracted from dd_ontology > dd1 > properties)</span>`,
			parent			: content_data
		})
		// pretty-print the full current_ontology object for quick inspection
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'pre_clean',
			inner_html		: JSON.stringify(current_ontology, null, 2),
			parent			: content_data
		})

	// body_response: shared response panel for the main update form.
	// It is declared here (before init_form) so the on_submit closure can reference it.
	// The node is appended to content_data AFTER init_form (below) to ensure document order.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// server config vars (STRUCTURE_FROM_SERVER, DEDALO_PREFIX_TIPOS)
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
					// The user can edit this comma-separated list of TLDs before submitting.
					// It is pre-filled from server config and overwritten when a server is selected.
					label		: 'TLD list to update',
					mandatory	: true,
					value		: prefix_tipos
				}],
				on_render : (nodes) => {
					// make persistent the values
					const input_nodes = nodes.input_nodes || []
					const dedalo_prefix_tipos = input_nodes.find(el => el.name === 'dedalo_prefix_tipos')

					// When the user selects a server via the radio buttons, update the TLD prefix
					// input to reflect that server's available TLD list.
					// server_selected is the tld array published by render_servers_list, or null
					// when no server is active (reset to default).
					const render_handler = function( server_selected ){
						dedalo_prefix_tipos.value = !server_selected
						 ? prefix_tipos
						 : server_selected.join(',')
					}
					// Store the token so destroy() can clean up this subscription
					self.events_tokens.push(
						event_manager.subscribe('ontology_server_select_change', render_handler)
					)

				},
				on_submit : async (e, values) => {

					// ar_dedalo_prefix_tipos: parse the comma-separated TLD input into a clean array.
					// values[0] is always the first (and only) input: 'dedalo_prefix_tipos'.
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

					// server to be used: find the server marked active by the radio-button handler
						const server = servers.find(el => el.active === true )
						if( !server ){
							alert("Error: any server was selected");
							return
						}

					// clean body_response nodes
						while (body_response.firstChild) {
							body_response.removeChild(body_response.firstChild);
						}

					// loading add: lock submit button and show spinner while waiting for Phase 1
						e.target.classList.add('lock')
						const spinner = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'spinner'
						})
						body_response.prepend(spinner)

					// Phase 1: query the remote ontology server for available files and version info.
					// 'server.url' points to a remote Dédalo installation acting as the ontology master.
					// The response carries: result.files (array of ontology file descriptors),
					// result.info (date, host, entity, active_ontologies array).
					// Timeout is 1 hour because this is a maintenance-only action and servers may be slow.
						const server_ontology_api_response = await data_manager.request({
							url		: server.url,
							body	: {
								dd_api			: 'dd_utils_api',
								action			: 'get_ontology_update_info',
								prevent_lock	: true,
								source			: {
									action : 'update_ontology',
								},
								options : {
									version	: page_globals.dedalo_version,
									code	: server.code
								}
							},
							retries : 1, // one try only
							timeout : 3600 * 1000 // 1 hour waiting response
						})
						// debug
						if(SHOW_DEBUG===true) {
							console.log('))) get_ontology_update_info server_api_response:', server_ontology_api_response)
						}

						const result = server_ontology_api_response?.result
						if(!result){
							// Phase 1 failed: show error and abort; do not proceed to Phase 2
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

					// OK get_ontology_update_info: Phase 1 succeeded; show status before Phase 2
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'ok',
							inner_html		: 'Get ontology update_info: ' + (server_ontology_api_response.msg || 'success'),
							parent			: body_response
						})

					// Build the list of files to import:
					// 1. Filter result.files to only those whose tld matches the user's prefix list.
					// 2. Enrich each matched file with typology_id and name_data from active_ontologies.
					// 3. Always prepend matrix_dd (private reference lists) regardless of user TLD selection,
					//    because all TLD-specific files depend on the matrix_dd value tables.
						const selected_files = []
					// files_filtered. Only selects math files with user tld section
						const files_filtered = result.files.filter( el => ar_dedalo_prefix_tipos.find(item => item === el.tld) )
						const files_filtered_length = files_filtered.length
						for (let i = 0; i < files_filtered_length; i++) {
							const file_item = files_filtered[i]
							// Enrich the file descriptor with ontology metadata if available
							const found = result.info.active_ontologies.find(el => el.tld===file_item.tld)
							if (found) {
								file_item.typology_id	= found.typology_id
								file_item.name_data		= found.name_data
							}
						}
						// matrix_dd has the shared list of values with the typologies of ontology definitions
						// it needs always be updated
						const matrix_dd = result.files.find( el => el.tld==='matrix_dd' )
						if(matrix_dd){
							selected_files.push(matrix_dd)
						}

						// add all ontology filtered
						selected_files.push(...files_filtered)

					// Phase 2: dispatch the actual ontology update to the server.
					// This calls class.update_ontology::update_ontology which downloads the
					// selected files, imports them, rebuilds dd_ontology, and regenerates lang files.
						const api_response = await self.update_ontology({
							server	: server,
							files	: selected_files,
							info	: result.info
						})

					// loading  remove
						spinner.remove()
						e.target.classList.remove('lock')

					// fail case
						if(!api_response?.result){
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: 'Updating Ontology: ' + api_response.msg || 'Error updating from server',
								parent			: body_response
							})
							return
						}

					// errors node: render any non-fatal errors that occurred during import
						const errors = api_response.errors || [api_response.error] || []
						if (errors.length>0) {
							ui.create_dom_element({
								element_type	: 'pre',
								class_name		: 'error',
								inner_html		: errors.join('<br />'),
								parent			: body_response
							})
						}

					// version compatibility check: the server returns the minimum code version
					// required by the newly installed ontology (stored in dd1 > properties > version).
					// Warn the user if their running Dédalo code is too old to support the new ontology.
						const required_version = api_response.root_info?.properties?.version || null
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

					// message: replace server-side newlines with HTML line breaks for display
						const msg = api_response.msg
							? api_response.msg.replace(/\n/g, '<br />')
							: '';
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'response_node msg',
							inner_html		: msg,
							parent			: body_response
						})

					// remove annoying rqo_string from object: the debug.rqo_string field
					// contains the full serialized search query and is very large; strip it
					// before rendering the debug JSON to avoid cluttering the output.
						if (api_response.debug && api_response.debug.rqo_string) {
							delete api_response.debug.rqo_string
						}

					// JSON response PRE: show the full API response object for developer inspection.
					// Double-clicking the pre element removes it to reduce clutter.
						const response_string = JSON.stringify(api_response, null, 2)
							.replace(/\\n/g, '<br />');
						const response_node_json = ui.create_dom_element({
							element_type	: 'pre',
							class_name		: 'response_node_json',
							inner_html		: response_string,
							parent			: body_response
						})
						const dblclick_handler = (e) => {
							e.stopPropagation()
							response_node_json.remove()
						}
						response_node_json.addEventListener('dblclick', dblclick_handler)

					// menu force to update (server cache files are deleted previously)
					// The ontology update regenerates server-side menu cache files.
					// Refreshing the menu instance at idle priority ensures the new navigation
					// tree is loaded without requiring a full page reload.
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

	// render export to translate
		const export_to_translate_container = render_export_to_translate(self, prefix_tipos)
		content_data.appendChild(export_to_translate_container)


	return content_data
}//end get_content_data_edit



/**
* RENDER_SERVERS_LIST
* Builds the server-selection radio-button grid for the update form.
*
* Renders a two-column CSS grid (class `config_grid servers_grid`) with one row per
* server in `value.servers`.  Each row contains:
*   - A `<label>` with the server name and a prepended radio `<input>` (name
*     `'ontology_server'`).  The radio value is the server's URL.
*   - A `<div class="value">` showing the URL plus an availability icon:
*       ✓ (class `check success`) if the server responded with HTTP 200 and `result.result === true`
*       ✗ (class `cancel error`) otherwise — and the radio is disabled.
*
* Server availability is pre-checked server-side by `class.update_ontology::get_value()`
* (via `ontology_data_io::check_remote_server()`), so the client only reads the
* cached `response_code` and `result` from the value payload.
*
* Event contract
* --------------
* Selecting a radio publishes `ontology_server_select_change` via `event_manager`
* with the selected server's `tld` value (a string, or `null` if the server has no
* `tld` property).  The `on_render` callback in `get_content_data_edit` subscribes
* to this event to update the TLD prefix input.
*
* Selection also marks `current_server.active = true` on the in-memory `servers`
* array (shared by reference with `get_content_data_edit`'s closure) so that the
* `on_submit` handler can do `servers.find(el => el.active === true)`.
*
* This function is exported so that other modules (e.g. future wizard steps) can
* reuse the server-picker UI.
*
* @param {Object} value - Widget value object from `class.update_ontology::get_value()`
* @param {Array}  value.servers - Array of server descriptor objects
* @returns {HTMLElement} The assembled `servers_grid` container (not yet in DOM)
*/
export const render_servers_list = function (value) {

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

		// server_label: the <label> acts as the clickable row for both the radio and the URL column
			const server_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label',
				inner_html		: current_server.name,
				title			: current_server.name,
				parent			: servers_grid
			})

		// input checkbox
			const input_radio = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				name 			: 'ontology_server',
				id				: i+1,
				value			: current_server.url
			})
			// change event handler: update active flag, highlight row, publish event
			const change_handler = (e) => {
				// Reset the active flag on all servers before setting the new one
				servers.forEach( el => delete el.active )
				current_server.active = input_radio.checked
				// Remove active highlight from all rows, then re-apply to the selected one
				servers_grid.querySelectorAll('.label, .value').forEach( el => el.classList.remove('active') )
				server_label.classList.add('active')
				value_node.classList.add('active')
				// Publish the selected server's TLD (or null) so the prefix input can update.
				// (!) value_node is declared after this handler — safe because the handler
				// is only invoked on user interaction, never synchronously here.
				const current_server_tld = current_server.tld || null
				event_manager.publish('ontology_server_select_change', current_server_tld )

			}
			input_radio.addEventListener('change', change_handler)
			input_radio.addEventListener('click', (e) => {
				e.stopPropagation()
			})

		// value: URL display column, also receives the availability status icon
			const value_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'value',
				inner_html		: current_server.url,
				parent			: servers_grid
			})

			// set the check box and if the status is available and URI is reachable
			if (current_server.response_code === 200 && current_server.result?.result) {
				// input_radio.checked = true
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button icon check success',
					parent			: value_node
				})
			}else{
				// Server unavailable: show error icon and prevent selection
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button icon cancel error',
					parent			: value_node
				})
				input_radio.disabled = 'disabled'
			}
			// Prepend the radio to the label so the label click activates the input
			server_label.prepend(input_radio)
	}


	return servers_grid
}//end render_servers_list



/**
* RENDER_SERVER_VARS
* Renders a read-only display of the two PHP constants that govern the ontology
* source configuration for this Dédalo installation.
*
* The two constants shown are:
*   - `STRUCTURE_FROM_SERVER` — boolean (or null) indicating whether this instance
*     fetches its ontology structure from a remote server.  Comes from
*     `class.update_ontology::get_value()` → `value.structure_from_server`.
*   - `DEDALO_PREFIX_TIPOS` — comma-joined list of the TLD prefixes (e.g.
*     `"dd, ontology, rsc"`) configured for this installation.  This is the default
*     set fed into the update form's prefix input.
*
* The output is a two-column CSS grid (class `config_grid`) with a bold "Config"
* header spanning both columns.  Each constant occupies one label/value row.
*
* This function is intentionally read-only display; the `DEDALO_PREFIX_TIPOS` value
* is editable in the update form's text input, not here.
*
* @param {Object}  value                       - Widget value from `get_value()`
* @param {boolean|null} value.structure_from_server - Current value of `STRUCTURE_FROM_SERVER`
* @param {Array}   value.prefix_tipos           - Current value of `DEDALO_PREFIX_TIPOS`
* @returns {HTMLElement} The assembled `config_grid` container
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

	// add vars: local helper that appends a label/value row pair to the config grid
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
* Renders a standalone panel that lets the user regenerate all Dédalo JavaScript
* label/lang files (e.g. `/dedalo/core/common/js/lang/lg-cat.js`) without performing
* a full ontology update.
*
* This is useful when labels have drifted out of sync (e.g. after a DB restore or
* direct ontology record edit) but the ontology data itself is already current.
*
* The panel contains:
*   - An info text explaining what the action does.
*   - A "Re-build lang label files" button that calls
*     `dd_area_maintenance_api::class_request::rebuild_lang_files`.
*   - A `body_response` container that shows a spinner while the request is in
*     flight and the JSON API response on completion.
*
* Implementation note — forward reference
* ----------------------------------------
* `body_response` is declared with `const` AFTER `button_submit` and its
* `click_handler` in source order.  The handler closes over `body_response` by
* name.  This is safe because `click_handler` is only invoked asynchronously on
* user interaction (never immediately at definition time), so by the time any click
* occurs `body_response` is fully initialised.  However this ordering is a code smell
* and the `const` TDZ rule means that if the handler were ever called synchronously
* it would throw a ReferenceError.
* (!) Flag: `body_response` is referenced before its declaration in source order.
*
* (!) The error message on API failure reads `'Error: failed make_backup'` — this is
* a copy-paste residue from a sibling widget (`make_backup`); the action being executed
* is `rebuild_lang_files`.  Do not fix (doc-only).
*
* @returns {HTMLElement} The assembled `rebuild_lang_files_container` node
*/
const render_rebuild_lang_files = function () {

	// rebuild_lang_files_container
		const rebuild_lang_files_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'rebuild_lang_files_container container'
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
		// click event: call rebuild_lang_files API, show result in body_response
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
			// use_worker:true offloads the request to a background worker so the
			// main thread remains responsive during the long-running rebuild.
			const api_response = await data_manager.request({
				use_worker	: true,
				body		: {
					dd_api			: 'dd_area_maintenance_api',
					action			: 'class_request',
					prevent_lock	: true,
					source			: {
						action : 'rebuild_lang_files'
					},
					options	: {}
				},
				retries : 1, // one try only
				timeout : 3600 * 1000 // 1 hour waiting response
			})

			spinner.remove()

			if (!api_response || !api_response.result) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: 'Error: failed make_backup', // (!) copy-paste residue: action is rebuild_lang_files, not make_backup
					parent			: body_response
				})
				return
			}

			// result_value pre JSON: display the full API response for developer inspection
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'result_value',
				inner_html		: JSON.stringify(api_response, null, 2),
				parent			: body_response
			})
		}
		button_submit.addEventListener('click', click_handler)

	// body_response: declared after click_handler but safely referenced by closure
	// (see function doc-block for the forward-reference note)
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response',
			parent			: rebuild_lang_files_container
		})


	return rebuild_lang_files_container
}//end render_rebuild_lang_files



/**
* RENDER_EXPORT_TO_TRANSLATE
* Renders a form panel for exporting ontology records as a CSV file suitable for
* external translation workflows.
*
* The export calls `dd_area_maintenance_api::widget_request` →
* `class.update_ontology::export_to_translate`, which queries all ontology records
* matching the selected TLDs, resolves term labels in every requested language, and
* returns a 2-D array (rows × columns).  The client then encodes the array as CSV
* and triggers a browser download via a programmatically clicked `<a>` element.
*
* Three configurable inputs are shown (all persist across sessions via `localStorage`):
*   1. `export_ontology_langs`          — comma-separated BCP-47 language codes to include
*                                         as columns (pre-filled from `page_globals.dedalo_projects_default_langs`).
*   2. `export_ontology_tld_list`       — comma-separated TLD prefixes to export
*                                         (pre-filled from `prefix_tipos`).
*   3. `export_ontology_exclude_models` — comma-separated glob patterns for ontology models
*                                         to exclude (e.g. `'field_*,table*,box*'`).
*
* CSV format
* ----------
* Server returns `result` as `Array<Array<string>>` (header row + data rows).
* The client wraps each cell in double quotes, escaping internal double quotes by
* doubling them (`"` → `""`), then joins rows with `\n`.
*
* localStorage persistence
* ------------------------
* The `on_render` callback reads each input's stored value from `localStorage` on
* render and writes it back on every `change` event.  Key = the input's `name`
* attribute.  This allows the user's last-used export settings to survive page reloads.
*
* (!) The `@return` annotation in the original doc-block said `rebuild_lang_files_container` —
* this was a copy-paste error from the sibling `render_rebuild_lang_files` function.
* The actual return is `export_to_translate_container`.
*
* (!) The data URI on the download link (line ~819) contains a literal TAB character
* between `data` and `:text/csv`, producing a malformed URI scheme `"data\t:text/csv"`.
* This may silently fail in some browsers or cause the download to open as a blank page.
* Do not fix (doc-only flag).
*
* @param {Object} self          - The `update_ontology` widget instance (needs `self.caller.init_form`)
* @param {Array}  prefix_tipos  - Default TLD list from `class.update_ontology::get_value()`
* @returns {HTMLElement} The assembled `export_to_translate_container` node
*/
const render_export_to_translate = function (self, prefix_tipos) {

	// Derive the default language list from the project configuration
	const langs = page_globals.dedalo_projects_default_langs.map(el => el.value)

	// export_to_translate_container
		const export_to_translate_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_to_translate_container container'
		})

	// info_text
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: `Export Ontology records to translate. Creates an CSV file including selected langs and TLDs excluding selected models by regex`,
			parent			: export_to_translate_container
		})

	// body_response: holds spinner and result output; appended to container at the end
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Export Ontology records',
				body_info		: export_to_translate_container,
				body_response	: body_response,
				inputs			: [
					{
						type		: 'text',
						name		: 'export_ontology_langs',
						label		: 'Languages list to export',
						mandatory	: true,
						value		: langs
					},
					{
						type		: 'text',
						name		: 'export_ontology_tld_list',
						label		: 'TLD list to export',
						mandatory	: true,
						value		: prefix_tipos
					},
					{
						type		: 'text',
						name		: 'export_ontology_exclude_models',
						label		: 'Exclude models regex',
						mandatory	: false,
						// Default exclusion patterns cover structural/meta ontology models that
						// have no translatable content (layout boxes, RDF/OWL mappings, etc.)
						value		: 'field_*,table*,box*,rdf,rdf:*,owl:*,xml,relation_list,section_list,section_map,diffusion*,database*,edit_view,exclude_elements'
					}
				],
				on_render : (nodes) => {
					// make persistent the values: restore any previously stored values and
					// wire change events to keep localStorage in sync with the inputs.
					const input_nodes = nodes.input_nodes || []
					input_nodes.forEach(el => {
						const name = el.name
						// localStorage check for value
						const local_value = localStorage.getItem(name)
						if (local_value) {
							// assign the stored value
							el.value = local_value
						}
						// add event listener
						const change_handler = (e) => {
							// store the new value
							localStorage.setItem(name, el.value);
						}
						el.addEventListener('change', change_handler)
					})
				},
				on_submit : async (e, values) => {

					// export_ontology_langs: split comma-separated language codes into a clean array
						const export_ontology_langs_item	= values.find(el => el.name==='export_ontology_langs')
						const export_ontology_langs			= export_ontology_langs_item?.value.split(',')
							.map(el => el.trim())

					// export_ontology_tld_list: parse and validate the TLD prefix list
						// sample value:
						// [{
						// 	name : "export_ontology_tld_list",
						// 	value : "dd,rsc,hierarchy,actv,aup,dmm"
						// }]
						const export_ontology_tld_list_item	= values.find(el => el.name==='export_ontology_tld_list')
						const export_ontology_tld_list		= export_ontology_tld_list_item?.value.split(',')
							.map(el => el.trim())
							.filter(el => el.length>1)

						if (!export_ontology_tld_list.length) {
							alert("Error: no TLDs are selected");
							return
						}

					// export_ontology_exclude_models: parse the exclusion glob pattern list
						// sample value:
						// [{
						// 	name : "export_ontology_exclude_models",
						// 	value : "field_*,table*,box*,rdf:*,xml,owl:*,relation_list,section_list,section_map,diffusion*"
						// }]
						const export_ontology_exclude_models_item	= values.find(el => el.name==='export_ontology_exclude_models')
						const export_ontology_exclude_models		= export_ontology_exclude_models_item?.value.split(',')
							.map(el => el.trim())

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

					// API request: call export_to_translate on the server.
					// The server returns result as Array<Array<string>> (rows × columns).
					// use_worker:true prevents the request from blocking the main thread.
						const api_response = await data_manager.request({
							use_worker	: true,
							body		: {
								dd_api			: 'dd_area_maintenance_api',
								action			: 'widget_request',
								prevent_lock	: true,
								source			: {
									type	: 'widget',
									model	: 'update_ontology',
									action	: 'export_to_translate'
								},
								options	: {
									export_ontology_langs			: export_ontology_langs,
									export_ontology_tld_list		: export_ontology_tld_list,
									export_ontology_exclude_models	: export_ontology_exclude_models
								}
							},
							retries : 1, // one try only
							timeout : 3600 * 1000 // 1 hour waiting response
						})
						// debug
						if(SHOW_DEBUG===true) {
							console.log('))) export_to_translate server_api_response:', api_response)
						}

						const result = api_response?.result

					// loading remove
						e.target.classList.remove('lock')
						spinner.remove()

					// Error case
						if(!result){
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: api_response.msg || 'Error connecting server',
								parent			: body_response
							})
							return
						}

					// OK case
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'ok',
							inner_html		: 'export_to_translate: ' + (api_response.msg || 'success'),
							parent			: body_response
						})

					// create CSV string: encode the server's 2-D array as RFC-4180 CSV.
					// Each cell is double-quoted; internal double-quotes are escaped by doubling.
						const ar_row_csv = []
						const result_length = result.length
						for (let i = 0; i < result_length; i++) {

							const line = result[i]

							const row_csv = line.map(item => {
								return '"'+item.toString().replace(/\"/g, '""') +'"'
							})

							ar_row_csv.push(row_csv)
						}
						const csv_string = ar_row_csv.join("\n")

					// Download it: create a temporary <a> with a data URI, click it, then remove it.
					// (!) The href value contains a literal TAB character between "data" and ":text/csv"
					// which produces a malformed data URI. This is a pre-existing bug — do not fix here.
						const filename = 'ontology_translations'
						const file	= filename + '.csv';
						const link	= document.createElement('a');
						link.style.display = 'none';
						link.setAttribute('target', '_blank');
						link.setAttribute('href', 'data	:text/csv;charset=utf-8,' + encodeURIComponent(csv_string));
						link.setAttribute('download', file);
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
				}
			})
		}

	// body_response append at end
		export_to_translate_container.appendChild(body_response)


	return export_to_translate_container
}//end render_export_to_translate



// @license-end
