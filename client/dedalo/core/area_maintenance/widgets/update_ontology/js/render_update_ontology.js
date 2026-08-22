// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* RENDER_UPDATE_ONTOLOGY
* Client-side rendering module for the `update_ontology` maintenance widget.
*
* View layer only — data transport lives in `update_ontology.js`, the import
* pipeline in `src/core/ontology/ontology_update.ts`. The panel does ONE job:
* pull an ontology snapshot from a master server and overwrite the local one.
*
* Layout (top → bottom)
* ---------------------
*   a. Danger callout — the overwrite is irreversible.
*   b. Installed ontology — a labelled readout (version / source / date / entity)
*      from `self.value.current_ontology` (the dd1 root-node properties).
*   c. Master server — radio picker (`render_servers_list`) with a reachability
*      pill; unreachable servers are disabled. Selecting one fires
*      `ontology_server_select_change` so the TLD input auto-fills. Below it, a
*      two collapsed admin notes: `build_client_info` (the ONTOLOGY_SERVERS key
*      that populates the picker) and `build_serving_info` (whether THIS install
*      can serve its ontology to others, and the .env keys that decide it).
*   d. Update form — the TLD list to import + the destructive submit button. On
*      submit: Phase 1 `get_ontology_update_info` (discover files) → show the
*      installed→incoming version change → Phase 2 `update_ontology` (import) →
*      one status line + a collapsible import log + a collapsed raw-JSON detail.
*
* Removed at the v7 redesign (were dead or redundant): the STRUCTURE_FROM_SERVER
* / ACTIVE_ONTOLOGY_TLDS config grid, the raw current-ontology JSON dump, the
* duplicated response message + always-expanded JSON envelope, and the
* "rebuild lang files" and "export to translate" panels (both engine_denied in
* v7 — labels are DB-derived and the CSV workflow is unported).
*
* Public exports
* --------------
*   render_update_ontology  — prototype constructor (`list`/`edit` assigned in
*                             update_ontology.js).
*   render_servers_list     — exported for reuse by the server-picker.
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {request_failed, response_data, response_extension} from '../../../../common/js/api_error.js'
	import {handle_api_error} from '../../../../common/js/error_dispatch.js'



/**
* RENDER_UPDATE_ONTOLOGY
* No-op constructor; all logic lives in the prototype `list` method (assigned as
* both `list` and `edit` in update_ontology.js). Never instantiate directly.
*/
export const render_update_ontology = function() {

	return true
}//end render_update_ontology



/**
* LIST
* Entry-point render method. Builds the panel and wraps it in the standard
* widget shell.
*
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' | 'content'
* @returns {Promise<HTMLElement>} wrapper (full) or content_data (content)
*/
render_update_ontology.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* BUILD_READOUT
* Two-tone key/value readout using the shared widget_kit grid
* (`.dd_readout` > `.dd_row` > `.dd_k` + `.dd_v`).
*
* @param {Array<{k:string, v:string, mono?:boolean}>} rows
* @returns {HTMLElement}
*/
const build_readout = function (rows) {

	const readout = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout'
	})
	rows.forEach(row => {
		const tr = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_row',
			parent			: readout
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_k',
			inner_html		: row.k,
			parent			: tr
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: row.mono ? 'dd_v mono' : 'dd_v',
			text_content	: (row.v===null || row.v===undefined || row.v==='') ? '—' : String(row.v),
			parent			: tr
		})
	})

	return readout
}//end build_readout



/**
* BUILD_DETAILS
* Collapsible `<details>` holding a monospace console `<pre>`.
*
* @param {string} summary_text
* @param {string} pre_content
* @param {Object} [opts]
* @param {boolean} [opts.open=false]
* @param {string}  [opts.pre_class='']
* @returns {HTMLElement}
*/
const build_details = function (summary_text, pre_content, opts) {

	const options = opts || {}
	const details = ui.create_dom_element({
		element_type	: 'details',
		class_name		: 'response_detail'
	})
	if (options.open===true) {
		details.setAttribute('open', 'open')
	}
	ui.create_dom_element({
		element_type	: 'summary',
		inner_html		: summary_text,
		parent			: details
	})
	// pre_content is SERVER text (import log, warnings, raw JSON): TEXT, never a sink
	ui.create_dom_element({
		element_type	: 'pre',
		class_name		: options.pre_class || '',
		text_content	: String(pre_content ?? ''),
		parent			: details
	})

	return details
}//end build_details



/**
* BUILD_VERSION_CHANGE
* installed → incoming transition cards, shown once the manifest is fetched so
* the operator sees the target version before the import lands.
*
* @param {Object} installed  - self.value.current_ontology
* @param {Object} incoming    - result.info from get_ontology_update_info
* @returns {HTMLElement}
*/
const build_version_change = function (installed, incoming) {

	const fmt_date = (d) => (typeof d==='string' && d.length>=10) ? d.slice(0,10) : '—'

	const wrap = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'version_change'
	})

	// installed card
		const from = ui.create_dom_element({ element_type:'div', class_name:'vcard', parent:wrap })
		ui.create_dom_element({ element_type:'div', class_name:'lbl', inner_html:'Installed now', parent:from })
		ui.create_dom_element({ element_type:'div', class_name:'num', text_content:String(installed.version || '—'), parent:from })
		ui.create_dom_element({ element_type:'div', class_name:'src', text_content:`${installed.host || '—'} · ${fmt_date(installed.date)}`, parent:from })

	// arrow
		ui.create_dom_element({ element_type:'div', class_name:'arrow', inner_html:'→', parent:wrap })

	// incoming card
		const to = ui.create_dom_element({ element_type:'div', class_name:'vcard incoming', parent:wrap })
		ui.create_dom_element({ element_type:'div', class_name:'lbl', inner_html:'Incoming', parent:to })
		ui.create_dom_element({ element_type:'div', class_name:'num', text_content:String((incoming && incoming.version) || '—'), parent:to })
		ui.create_dom_element({ element_type:'div', class_name:'src', text_content:`${(incoming && incoming.host) || '—'} · ${fmt_date(incoming && incoming.date)}`, parent:to })

	return wrap
}//end build_version_change



/**
* BUILD_CLIENT_INFO
* Admin help for the PULL side: which servers this installation may pull from
* comes from ONE config key, so the panel names it, reports how many entries it
* holds, and shows the exact `../private/.env` line to add. The `code` must be
* the `ONTOLOGY_SERVER_CODE` of the server being contacted.
*
* @param {Array} servers - value.servers (already probed server-side)
* @returns {HTMLElement} collapsed <details>
*/
const build_client_info = function (servers) {

	const total = servers.length

	const details = ui.create_dom_element({
		element_type	: 'details',
		class_name		: 'serving_info client_info'
	})
	if (total===0) {
		details.setAttribute('open', 'open')
	}
	const summary = ui.create_dom_element({
		element_type	: 'summary',
		parent			: details
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'ttl',
		inner_html		: 'Connect to a remote ontology server',
		parent			: summary
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: total>0 ? 'dd_badge pill_ok' : 'dd_badge pill_warning',
		inner_html		: total>0 ? `${total} configured` : 'None configured',
		parent			: summary
	})

	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'serving_body',
		parent			: details
	})
	ui.create_dom_element({
		element_type	: 'p',
		class_name		: 'dd_note',
		inner_html		: 'The list above is built from <code>ONTOLOGY_SERVERS</code> in <code>../private/.env</code> (one JSON array, one object per master). Add the servers you are authorized to pull from and restart the server.',
		parent			: body
	})
	ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'env_sample',
		text_content	: 'ONTOLOGY_SERVERS=[{"name":"Dédalo Ontology server","url":"https://myserverdomain.org/dedalo/core/api/v1/json/","code":"xx-myspecialcode-xxx"}]',
		parent			: body
	})
	const fields = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'serving_checks',
		parent			: body
	})
	;[
		{ k:'name', d:'Free label, only shown in the list above.' },
		{ k:'url',  d:'The master’s JSON API endpoint, ending in <code>/dedalo/core/api/v1/json/</code>.' },
		{ k:'code', d:'The <code>ONTOLOGY_SERVER_CODE</code> configured on THAT server. A wrong or missing code makes it answer as unreachable.' }
	].forEach(field => {
		const row = ui.create_dom_element({ element_type:'div', class_name:'chk field', parent:fields })
		ui.create_dom_element({ element_type:'span', class_name:'mark', inner_html:'·', parent:row })
		const txt = ui.create_dom_element({ element_type:'div', class_name:'txt', parent:row })
		const head = ui.create_dom_element({ element_type:'div', class_name:'hd', parent:txt })
		ui.create_dom_element({ element_type:'code', text_content:field.k, parent:head })
		ui.create_dom_element({ element_type:'div', class_name:'desc', inner_html:field.d, parent:txt })
	})

	return details
}//end build_client_info



/**
* BUILD_SERVING_INFO
* Admin help: what makes THIS installation able to SERVE its ontology to other
* installs (the mirror image of this panel — a remote client lists us under its
* own ONTOLOGY_SERVERS). Three settings decide it, so each is shown as a live
* checklist row plus the exact `../private/.env` lines to add.
*
* `serving` comes from update_ontology.ts getValue:
* `{ enabled, has_server_code, cors_enabled, url }` — the access code itself is
* never sent, only whether one is configured.
*
* @param {Object} serving
* @returns {HTMLElement} collapsed <details>
*/
const build_serving_info = function (serving) {

	const ready = serving.enabled===true && serving.has_server_code===true && serving.cors_enabled===true

	const details = ui.create_dom_element({
		element_type	: 'details',
		class_name		: 'serving_info'
	})
	const summary = ui.create_dom_element({
		element_type	: 'summary',
		parent			: details
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'ttl',
		inner_html		: 'Serve this ontology to other installations',
		parent			: summary
	})
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: ready ? 'dd_badge pill_ok' : 'dd_badge pill_warning',
		inner_html		: ready ? 'Enabled' : 'Not configured',
		parent			: summary
	})

	const body = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'serving_body',
		parent			: details
	})
	ui.create_dom_element({
		element_type	: 'p',
		class_name		: 'dd_note',
		inner_html		: 'This panel PULLS an ontology. To let other installations pull <i>from here</i> — they add this server to their own <code>ONTOLOGY_SERVERS</code> — configure <code>../private/.env</code> with at least these keys and restart the server.',
		parent			: body
	})

	// live checklist
	const checks = [
		{
			ok	: serving.enabled===true,
			k	: 'IS_AN_ONTOLOGY_SERVER',
			v	: serving.enabled===true ? 'true' : 'not set',
			d	: 'Opens the ontology JSON endpoint and adds the “Local files” source here.'
		},
		{
			ok	: serving.has_server_code===true,
			k	: 'ONTOLOGY_SERVER_CODE',
			v	: serving.has_server_code===true ? 'configured' : 'not set',
			d	: 'Shared access code a client must present. Pick your own; clients store it in their ONTOLOGY_SERVERS entry.'
		},
		{
			ok	: serving.cors_enabled===true,
			k	: 'DEDALO_CORS_ALLOWED_ORIGINS',
			v	: serving.cors_enabled===true ? 'configured' : 'not set',
			d	: 'Clients call this server from their browser, so their origin must be allowed. <code>["*"]</code> opens it to any origin; list the client origins instead when you know them.'
		}
	]
	const list = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'serving_checks',
		parent			: body
	})
	checks.forEach(check => {
		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: check.ok ? 'chk on' : 'chk off',
			parent			: list
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'mark',
			inner_html		: check.ok ? '✓' : '•',
			parent			: row
		})
		const txt = ui.create_dom_element({ element_type:'div', class_name:'txt', parent:row })
		const head = ui.create_dom_element({ element_type:'div', class_name:'hd', parent:txt })
		ui.create_dom_element({ element_type:'code', text_content:check.k, parent:head })
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'val',
			text_content	: check.v,
			parent			: head
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'desc',
			inner_html		: check.d,
			parent			: txt
		})
	})

	// the literal .env block
	ui.create_dom_element({
		element_type	: 'pre',
		class_name		: 'env_sample',
		text_content	: [
			'IS_AN_ONTOLOGY_SERVER=true',
			'ONTOLOGY_SERVER_CODE=xx-myspecialcode-xxx',
			'DEDALO_CORS_ALLOWED_ORIGINS=["*"]'
		].join('\n'),
		parent			: body
	})

	// the URL clients must register
	if (serving.url) {
		const url_row = ui.create_dom_element({ element_type:'div', class_name:'serve_url', parent:body })
		ui.create_dom_element({ element_type:'span', class_name:'dd_k', inner_html:'Endpoint clients register', parent:url_row })
		ui.create_dom_element({ element_type:'code', text_content:String(serving.url), parent:url_row })
	}

	return details
}//end build_serving_info



/**
* GET_CONTENT_DATA_EDIT
* Builds the full inner content DOM for the update_ontology widget and wires the
* two-phase submit flow.
*
* `self.value` shape (from `update_ontology.ts` getValue):
* ```
* {
*   current_ontology : { version, date, host, entity, entity_label },
*   servers          : [{ name, url, code, tld?, response_code, result? }],
*   active_ontology_tlds : string[],
*   confirm_text     : string
* }
* ```
*
* @param {Object} self - the update_ontology widget instance
* @returns {Promise<HTMLElement>}
*/
const get_content_data_edit = async function(self) {

	// value
		const value = self.value || {}
		const current_ontology		= value.current_ontology || {}
		const servers				= value.servers || []
		const active_ontology_tlds	= value.active_ontology_tlds || []
		const confirm_text			= value.confirm_text || 'Sure?'
		const serving				= value.serving || {}

	// content_data (own class — the wrapper's content node is otherwise classless,
	// so styles must hang off this, not a non-existent `.content_data` class)
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data update_ontology_content'
		})

	// a. danger callout — the overwrite is irreversible
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note state_danger overwrite_note',
			inner_html		: '<b>Overwrites the local ontology.</b> Imports a snapshot from the selected master over the live ontology. Local ontology edits are lost, and this can’t be undone.',
			parent			: content_data
		})

	// b. installed ontology readout
		const installed_section = ui.create_dom_element({ element_type:'div', class_name:'section', parent:content_data })
		ui.create_dom_element({ element_type:'span', class_name:'dd_eyebrow', inner_html:'Installed ontology', parent:installed_section })
		installed_section.appendChild(build_readout([
			{ k:'Version', v:current_ontology.version, mono:true },
			{ k:'Source',  v:current_ontology.host },
			{ k:'Installed', v:(typeof current_ontology.date==='string' ? current_ontology.date.slice(0,10) : null) },
			{ k:'Entity',  v:current_ontology.entity_label || current_ontology.entity }
		]))

	// c. master server picker
		const servers_section = ui.create_dom_element({ element_type:'div', class_name:'section', parent:content_data })
		ui.create_dom_element({ element_type:'span', class_name:'dd_eyebrow', inner_html:'Master server', parent:servers_section })
		servers_section.appendChild(render_servers_list(value))
		servers_section.appendChild(build_client_info(servers))
		servers_section.appendChild(build_serving_info(serving))

	// body_response: result surface, declared before init_form so on_submit can close over it
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// d. update form
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Overwrite local ontology',
				confirm_text	: confirm_text,
				body_info		: content_data,
				body_response	: body_response,
				inputs			: [{
					type		: 'text',
					name		: 'active_ontology_tlds',
					label		: 'Ontologies to update',
					mandatory	: true,
					value		: active_ontology_tlds
				}],
				on_render : (nodes) => {
					const input_nodes = nodes.input_nodes || []
					const tlds_input = input_nodes.find(el => el.name === 'active_ontology_tlds')

					// auto-fill the TLD input from the selected server's TLD list
					const render_handler = function( server_selected ){
						tlds_input.value = !server_selected
							? active_ontology_tlds
							: server_selected.join(',')
					}
					self.events_tokens.push(
						event_manager.subscribe('ontology_server_select_change', render_handler)
					)
				},
				on_submit : async (e, values) => {

					// parse the TLD list
						const active_ontology_tlds_value	= values[0]?.value
						const ar_active_ontology_tlds		= active_ontology_tlds_value.split(',')
							.map(el => el.trim())
							.filter(el => el.length>1)

						if (!ar_active_ontology_tlds.length) {
							alert('Select at least one ontology to update.')
							return
						}

					// the server marked active by the radio handler
						const server = servers.find(el => el.active === true )
						if( !server ){
							alert('Select a master server first.')
							return
						}

					// reset the response surface
						while (body_response.firstChild) {
							body_response.removeChild(body_response.firstChild)
						}

					// Phase 1: discover available files + version info on the master
						const server_ontology_api_response = await data_manager.request({
							url		: server.url,
							body	: {
								dd_api			: 'dd_utils_api',
								action			: 'get_ontology_update_info',
								prevent_lock	: true,
								source			: { action : 'update_ontology' },
								options : {
									version	: page_globals.dedalo_version,
									code	: server.code
								}
							},
							retries : 1,
							timeout : 3600 * 1000
						})
						if(SHOW_DEBUG===true) {
							console.log('))) get_ontology_update_info:', server_ontology_api_response)
						}

						const result = response_data(server_ontology_api_response)
						if(request_failed(server_ontology_api_response) || !result){
							if (request_failed(server_ontology_api_response)) {
								// ONE error model: policy + renderer decide the surface
								await handle_api_error(server_ontology_api_response.error, {wrapper: body_response})
							} else {
								ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'error',
									text_content	: String(response_extension(server_ontology_api_response, 'msg') || 'Could not reach the master server.'),
									parent			: body_response
								})
							}
							return
						}

					// show installed → incoming before the import completes
						body_response.appendChild(build_version_change(current_ontology, result.info))

					// build the file list: user-selected TLDs, enriched, with matrix_dd always first
						const files_filtered = result.files.filter( el => ar_active_ontology_tlds.find(item => item === el.tld) )
						files_filtered.forEach(file_item => {
							const found = result.info.active_ontologies.find(el => el.tld===file_item.tld)
							if (found) {
								file_item.typology_id	= found.typology_id
								file_item.name_data		= found.name_data
							}
						})
						const selected_files = []
						const matrix_dd = result.files.find( el => el.tld==='matrix_dd' )
						if(matrix_dd){
							selected_files.push(matrix_dd)
						}
						selected_files.push(...files_filtered)

					// Phase 2: import
						const api_response = await self.update_ontology({
							server	: server,
							files	: selected_files,
							info	: result.info
						})

					// fail case
						if(request_failed(api_response) || !response_data(api_response)){
							if (request_failed(api_response)) {
								// ONE error model: policy + renderer decide the surface
								await handle_api_error(api_response.error, {wrapper: body_response})
							} else {
								ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'error',
									text_content	: String(response_extension(api_response, 'msg') || 'The ontology import failed.'),
									parent			: body_response
								})
							}
							return
						}

					// status line
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'ok',
							inner_html		: 'Ontology updated.',
							parent			: body_response
						})

					// version compatibility warning
						const required_version = api_response.root_info?.properties?.version || null
						if (required_version && !self.supported_code_version(required_version)) {
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'warning',
								text_content	: `Your Dédalo code is older than this ontology needs (≥ ${required_version}). Update the code soon to avoid incompatibilities.`,
								parent			: body_response
							})
						}

					// non-fatal import errors
						const errors = (response_extension(api_response, 'errors') || []).filter(Boolean)
						if (errors.length>0) {
							body_response.appendChild(
								build_details('Import warnings ('+errors.length+')', errors.join('\n'), { open:true, pre_class:'warning' })
							)
						}

					// collapsible import log (the per-file messages)
						const import_log = response_extension(api_response, 'msg')
						if (import_log) {
							body_response.appendChild(
								build_details('Import log', import_log, { open:true, pre_class:'log' })
							)
						}

					// collapsed raw response for developers
						if (api_response.debug && api_response.debug.rqo_string) {
							delete api_response.debug.rqo_string
						}
						body_response.appendChild(
							build_details('Developer response (raw JSON)', JSON.stringify(api_response, null, 2), { open:false, pre_class:'dev_json' })
						)

					// refresh the menu (server rebuilt its nav cache during the update)
						dd_request_idle_callback(
							() => {
								const page = self.caller.caller
								if (page) {
									const menu = page.ar_instances.find(el => el.model==='menu')
									if (menu) {
										menu.refresh({ build_autoload : true })
									}
								}
							}
						)
				}
			})
		}

	// append the response surface last
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* RENDER_SERVERS_LIST
* Radio picker for `value.servers`. Each row shows the server name + URL and a
* reachability pill; unreachable servers are disabled. Selecting a row publishes
* `ontology_server_select_change` (the server's TLD list, or null) and marks
* `server.active = true` so the submit handler can find the chosen server.
*
* Reachability is pre-probed server-side (`update_ontology.ts` getValue →
* `checkRemoteServer`); the client only reads `response_code` + `result`.
*
* @param {Object} value - widget value; `value.servers` is the descriptor list
* @param {string} [env_key='ONTOLOGY_SERVERS'] - config key named in the empty
*   notice; `update_code` reuses this picker over CODE_SERVERS
* @returns {HTMLElement} the `.server_picker` container
*/
export const render_servers_list = function (value, env_key='ONTOLOGY_SERVERS') {

	const servers = value.servers || []

	const picker = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'server_picker'
	})

	if (!servers.length) {
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_note empty',
			text_content	: `No master servers are configured (${env_key}).`,
			parent			: picker
		})
		return picker
	}

	const server_len = servers.length
	for (let i = 0; i < server_len; i++) {

		const current_server	= servers[i]
		// `current_server.result` is the REMOTE's decoded body (a nested probe key,
		// not our envelope): its own payload says whether it answered ready.
		const reachable			= current_server.response_code === 200 && !!response_data(current_server.result)

		// row = clickable <label> wrapping the radio, meta and pill
			const server_row = ui.create_dom_element({
				element_type	: 'label',
				class_name		: reachable ? 'server_row' : 'server_row off',
				title			: reachable ? current_server.name : (current_server.msg || 'Unreachable'),
				parent			: picker
			})

		// radio
			const input_radio = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				name 			: 'ontology_server',
				id				: i+1,
				value			: current_server.url,
				parent			: server_row
			})
			if (!reachable) {
				input_radio.disabled = 'disabled'
			}
			const change_handler = () => {
				servers.forEach( el => delete el.active )
				current_server.active = input_radio.checked
				picker.querySelectorAll('.server_row').forEach( el => el.classList.remove('on') )
				server_row.classList.add('on')
				event_manager.publish('ontology_server_select_change', current_server.tld || null )
			}
			input_radio.addEventListener('change', change_handler)
			input_radio.addEventListener('click', (e) => { e.stopPropagation() })

		// meta: name + url
			const meta = ui.create_dom_element({ element_type:'span', class_name:'meta', parent:server_row })
			ui.create_dom_element({ element_type:'span', class_name:'nm', text_content:String(current_server.name ?? ''), parent:meta })
			ui.create_dom_element({ element_type:'span', class_name:'url', text_content:String(current_server.url ?? ''), parent:meta })

		// reachability pill
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: reachable ? 'dd_badge pill_ok' : 'dd_badge pill_danger',
				inner_html		: reachable ? 'Reachable' : 'Unreachable',
				parent			: server_row
			})
	}


	return picker
}//end render_servers_list



// @license-end
