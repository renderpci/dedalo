// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {normalize_stream_error, request_failed, response_data, response_extension} from '../../../../common/js/api_error.js'
	import {handle_api_error} from '../../../../common/js/error_dispatch.js'
	import {login} from '../../../../login/js/login.js'
	import {render_servers_list} from '../../update_ontology/js/render_update_ontology.js'
	import {error_text} from '../../../../common/js/render_api_error.js'
	import {render_code_server_status, render_consumer_status} from './render_update_status.js'
	import {
		UPDATE_PHASES,
		init_phase_state,
		apply_phase_frame,
		resolve_health_outcome
	} from './update_code_phases.js'



/**
* RENDER_UPDATE_CODE
* Client-side render module for the `update_code` maintenance widget.
*
* Flow:
*   1. `list` builds the panel: a `dd_readout` with the running version/build,
*      the shared server picker (render_servers_list over CODE_SERVERS), and
*      the "check available updates" button.
*   2. The button calls `self.get_code_update_info(server)` and opens
*      `render_info_modal` with the manifest the code server answered.
*   3. Picking a version and accepting the `ui.confirm` dialog calls
*      `self.update_code({info, file_active})`, which submits a BACKGROUND JOB
*      and answers immediately with `{pid, pfile}` extension keys.
*   4. `track_process` follows the job: `update_process_status` streams the
*      job's frames (each carries the phase track — see update_code_phases.js),
*      and when the stream dies at/after the `swap` phase — the server restart
*      kills it BY DESIGN — the tracker deletes the resume key and polls
*      `GET /health` until the new version answers (or the deadline declares
*      the server gone / rolled back).
*   5. On success the panel shows the updated state FIRST, then offers a
*      reload (`login.quit`) via `ui.confirm`; a dismissed dialog leaves a
*      persistent "reload pending" note with its own button.
*
* On code-server installations (is_a_code_server or entity === 'development'),
* `render_build_version` appends buttons that trigger a `git archive` build of
* the master (`<v>.zip`) or developer (`<v>-dev.zip`) release.
*
* The 'development' entity REFUSES to update itself: the refusal renders in
* the panel (disabled button + warning note) BEFORE any picker opens.
*
* Exports:
*   render_update_code — constructor (prototype-only; no instance state)
*/
export const render_update_code = function() {

	return true
}//end render_update_code



// process resume key (IndexedDB 'status' table) — written by render_stream on
// job start, cleared by it on stream end, and cleared HERE before health
// polling (the old pid/pfile mean nothing to the restarted process).
const LOCAL_DB_ID = 'process_update_code'

// per-modal radio group sequence: a radio group is document-wide by name, so
// each modal instance owns its own group (mirrors the picker_seq pattern of
// render_update_ontology.js).
let modal_seq = 0



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
* BUILD_READOUT
* Two-tone key/value readout using the shared widget_kit grid
* (`.dd_readout` > `.dd_row` > `.dd_k` + `.dd_v`).
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
* GET_CONTENT_DATA_EDIT
* Builds and returns the full content panel for the update_code widget.
*
* Value shape consumed from `self.value` (update_code.get_value on the server):
*   {
*     servers: [{
*       name: string, url: string, code: string,
*       response_code: number, result: object|false
*     }],
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
		const is_a_code_server	= value.is_a_code_server
		const servers			= value.servers || []
		const is_development	= page_globals.dedalo_entity==='development'

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div',
			class_name	 : 'content_data'
		})

	// STATUS: what is running, whether an update can even proceed, what
	// happened last time, and what could be rolled back to. Replaces the old
	// two-row version/build readout — same facts, plus every gate the pipeline
	// would refuse on (before 2026-08-24 those were discoverable only by
	// pressing the button and reading the failure). Server: value.consumer,
	// core/update/status.ts. Falls back to the two-row readout when an older
	// server answers without the status halves.
		if (value.consumer) {
			render_consumer_status(content_data, value.consumer)
		} else {
			content_data.appendChild(build_readout([
				{ k : (get_label.update_code_current_version || 'Current version'), v : page_globals.dedalo_version, mono : true },
				{ k : (get_label.update_code_current_build || 'Current build'), v : page_globals.dedalo_build, mono : true }
			]))
		}

	// servers. The shared picker over CODE_SERVERS with its OWN storage key:
	// remembering the choice must not collide with the ontology picker's.
		const servers_list = render_servers_list( value, 'CODE_SERVERS', 'dedalo.update_code.server' )
		content_data.appendChild(servers_list)

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// resume a running update
	// If a previous update was started (browser closed or page refreshed during
	// the long-running server process), IndexedDB still holds its PID + pfile.
	// Resume the stream so the user sees live phase status on widget open —
	// routed through the SAME tracker (and the same ending) as a fresh start.
		const check_process_data = () => {
			data_manager.get_local_db_data(
				LOCAL_DB_ID,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					// resume path: the expected version was lost with the page, the
					// /health comparison degrades honestly (see resolve_health_outcome)
					track_process(local_data.value.pid, local_data.value.pfile, body_response, null)
				}
			})
		}
		check_process_data()

	// development refusal — BEFORE any picker/modal: ask nothing, refuse first.
		if (is_development) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_warning',
				text_content	: get_label.update_code_dev_refused || 'To avoid accidental overwrites, the development installation does not allow updating the code.',
				parent			: content_data
			})
		}

	// button_submit (check available updates)
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_submit',
			inner_html		: get_label.update_code_check_updates || 'Check available updates',
			parent			: content_data
		})
		if (is_development) {
			button_submit.disabled = true
		}
		// click event
		const click_event = async (e) => {
			e.stopPropagation()

			// clean previous inline feedback
				body_response.querySelectorAll('.error').forEach(el => el.remove())
				servers_list.classList.remove('empty')

			// busy guard: a running update owns the panel (make_backup pattern)
				const running = await data_manager.get_local_db_data(LOCAL_DB_ID, 'status')
				if (running && running.value) {
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'error',
						text_content	: get_label.update_code_busy || 'An update is already running.',
						parent			: body_response
					})
					return
				}

			// server to be used: a radio must be active in the picker. Inline
			// error + mandatory-field marking, never a blocking dialog.
				const server = servers.find(el => el.active === true )
				if( !server ){
					servers_list.classList.add('empty')
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'error',
						text_content	: get_label.update_code_no_server_selected || 'Select a code server first.',
						parent			: body_response
					})
					const first_radio = servers_list.querySelector('input[type="radio"]:not(:disabled)')
					if (first_radio) {
						first_radio.focus()
					}
					return
				}

			// clean body_response nodes
				while (body_response.firstChild) {
					body_response.removeChild(body_response.firstChild);
				}

			// loading add. Lock the button while the remote API call is in flight
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
					const result = response_data(server_code_api_response)
					const errors = response_extension(server_code_api_response, 'errors') || []
					if(request_failed(server_code_api_response) || !result || errors.length){
						// remove spinner
						e.target.classList.remove('lock')
						spinner.remove()
						if (request_failed(server_code_api_response)) {
							// ONE error model: policy + renderer decide the surface
							await handle_api_error(server_code_api_response.error, {wrapper: body_response})
						} else {
							// error message node add (server text as TEXT, never an HTML sink)
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								text_content	: String(response_extension(server_code_api_response, 'msg') || 'Error connecting server'),
								parent			: body_response
							})
						}
						// additional errors (remote shell/git output — TEXT only)
						const errors_length = errors.length
						for (let i = 0; i < errors_length; i++) {
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								text_content	: String(errors[i] ?? ''),
								parent			: body_response
							})
						}
						return
					}

				// show info modal
				// `result` shape: { info: {version, date, entity_id, entity, host},
				//                   files: [{version, url, date}] }
					render_info_modal( self, result, body_response )

				// remove spinner
				e.target.classList.remove('lock')
				spinner.remove()
		}
		button_submit.addEventListener('click', click_event)

	// build code version
	// Only rendered on code-server instances or the 'development' entity.
	// These buttons invoke build_version_from_git_master on the server side to
	// produce the distributable ZIP archives from the GIT repository.
		if(is_a_code_server || is_development){
			// The publish-side status BEFORE the builders: role and dirs through
			// planCodeBuild itself, the commit a release would be built from,
			// the archives already on disk, and what a consumer at this version
			// is actually offered (an empty manifest over a published zip is the
			// catalog's doing — the panel shows both instead of leaving the
			// operator to infer it). Null on a non-code-server.
			render_code_server_status(content_data, value.code_server)
			render_build_version(self, content_data, body_response)
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



/**
* RENDER_PHASE_TRACK
* The visual phase track: a shared-kit progress bar plus one row per phase
* with a state chip. Returns a paint(state) function fed by the reducer.
* @param {HTMLElement} parent
* @returns {{node:HTMLElement, paint:Function}}
*/
const render_phase_track = function(parent) {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'phase_track',
		parent			: parent
	})

	// progress bar (widget_kit)
	const bar = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_bar',
		parent			: node
	})
	const bar_fill = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_bar_fill',
		parent			: bar
	})
	const bar_note = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_bar_note',
		parent			: node
	})

	// one row per phase
	const readout = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'dd_readout',
		parent			: node
	})
	const chips = {}
	// status words are labels too, same style as the phase names
	const status_text = (status) => get_label['update_code_status_'+status] || status
	UPDATE_PHASES.forEach(phase_id => {
		const row = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_row',
			parent			: readout
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_k',
			text_content	: get_label['update_code_phase_'+phase_id] || phase_id,
			parent			: row
		})
		const v = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'dd_v',
			parent			: row
		})
		chips[phase_id] = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'dd_badge',
			text_content	: status_text('pending'),
			parent			: v
		})
	})

	const chip_class = (status) => {
		switch (status) {
			case 'done'		: return 'dd_badge state_ok'
			case 'running'	: return 'dd_badge state_warning'
			case 'failed'	: return 'dd_badge state_danger'
			default			: return 'dd_badge'
		}
	}

	const paint = (state) => {
		let done_count = 0
		let running = false
		state.phases.forEach(p => {
			const chip = chips[p.id]
			if (!chip) return
			chip.className = chip_class(p.status)
			chip.textContent = status_text(p.status)
			if (p.status==='done' || p.status==='skipped') done_count++
			if (p.status==='running') running = true
		})
		bar_fill.style.width = Math.round(done_count / state.phases.length * 100) + '%'
		bar.classList.toggle('indeterminate', running || state.mode==='polling')
		if (state.mode==='failed') {
			bar_fill.classList.add('state_danger')
		} else if (state.mode==='rolled_back') {
			bar_fill.classList.add('state_warning')
		}
		if (state.message) {
			bar_note.textContent = state.message
		}
	}

	return { node : node, paint : paint }
}//end render_phase_track



/**
* TRACK_PROCESS
* Follows a running update job: streams its status via update_process_status
* (which also persists/cleans the IndexedDB resume key), feeds every frame to
* the pure reducer, and paints the phase track. When the stream dies at/after
* `swap` — the restart kills it by design — the tracker deletes the resume key
* itself and polls GET /health until the new version answers.
*
* Used by BOTH paths: the modal's fresh start and the panel-mount resume.
*
* @param {string|number} pid
* @param {string} pfile
* @param {HTMLElement} body_response - panel response surface
* @param {string|null} expected_version - version the job installs (null on resume)
* @returns {void}
*/
const track_process = function(pid, pfile, body_response, expected_version) {

	// clean previous surface
		while (body_response.firstChild) {
			body_response.removeChild(body_response.firstChild);
		}

	// phase track + reducer state
		const track = render_phase_track(body_response)
		let state = init_phase_state(expected_version)
		track.paint(state)

	// stream surface (render_stream owns this node)
		const stream_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'update_stream',
			parent			: body_response
		})

	// frame feed. update_process_status/render_stream expose no per-chunk hook
	// to the caller (common.js is shared surface), but render_stream ALWAYS
	// mirrors each raw SSE chunk into `.display_json_box` (display_json:true).
	// Observe that mirror, parse the chunk, feed the reducer.
	// LOAD-BEARING COUPLING to two common.js behaviours — mechanically pinned by
	// test/unit/client_update_code_render.test.ts ("stream-mirror coupling"):
	//   1. update_process_status calls render_stream with display_json:true;
	//   2. render_stream writes JSON.stringify(sse_response) into that box.
	// A change to either goes red THERE, not silently blank here. The raw <pre>
	// mirror is reducer feed, not operator surface: update_code.less hides it.
		let stream_final = false	// a final frame (is_running:false) arrived
		let final_error = null		// its normalized ApiError, when it carried one
		const observer = new MutationObserver(() => {
			const box = stream_node.querySelector('.display_json_box')
			if (!box) return
			let sse_response = null
			try {
				sse_response = JSON.parse(box.textContent)
			} catch (_error) {
				return
			}
			if (sse_response && typeof sse_response==='object' && sse_response.is_running===false) {
				// the JOB ended (which is not the same as the stream dying)
				stream_final = true
				final_error = normalize_stream_error(sse_response)
			}
			const frame = sse_response?.data
			if (frame && typeof frame==='object') {
				state = apply_phase_frame(state, frame)
				track.paint(state)
			}
		})
		observer.observe(stream_node, { subtree:true, childList:true, characterData:true })

	// endings

		const finish_success = async (version) => {
			state = { ...state, mode:'done' }
			track.paint(state)
			// success state FIRST…
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_ok update_done',
				text_content	: (get_label.update_code_updated || 'Code updated to version %s.')
					.replace('%s', String(version || state.expected_version || '')),
				parent			: body_response
			})
			// …then the reload prompt: the browser still holds the OLD ES modules
			// and only a full re-login reloads them.
			const accepted = await ui.confirm({
				header			: get_label.update || 'Update',
				body			: get_label.update_code_reload_required || 'Reload required: log in again to load the new code.',
				accept_label	: get_label.update_code_reload_now || 'Reload now'
			})
			if (accepted===true) {
				await login.quit()
				return
			}
			// dismissed: a persistent "reload pending" chip with its own button
			const pending = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_warning reload_pending',
				text_content	: get_label.update_code_reload_required || 'Reload required: log in again to load the new code.',
				parent			: body_response
			})
			const reload_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light',
				inner_html		: get_label.update_code_reload_now || 'Reload now',
				parent			: pending
			})
			reload_button.addEventListener('click', (e) => {
				e.stopPropagation()
				login.quit()
			})
		}

		const finish_failed = (message) => {
			track.paint(state)
			// a PRE-PHASE refusal (bad checksum, no supervisor, image channel…)
			// starts no phase at all: the track is all-pending, so the refusal
			// sentence IS the whole story — render it prominently.
			const is_refusal = state.last_phase===null
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: is_refusal ? 'dd_note state_danger update_refusal' : 'dd_note state_danger',
				text_content	: String(message || state.message || (get_label.update_code_failed || 'The update failed.')),
				parent			: body_response
			})
		}

		// the stream died pre-swap: INDETERMINATE — the server-side job is not
		// tied to the SSE connection and may still swap and restart later.
		// render_stream's teardown already deleted the resume key, so RESTORE it:
		// reopening the panel re-attaches to the (possibly still running) job.
		const finish_interrupted = () => {
			track.paint(state)
			data_manager.set_local_db_data(
				{ id : LOCAL_DB_ID, value : { pid : pid, pfile : pfile } },
				'status'
			)
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'dd_note state_warning connection_lost',
				text_content	: get_label.update_code_connection_lost || 'Connection lost — the update may still be running on the server. Reopen this panel to re-attach, and do not start another update.',
				parent			: body_response
			})
		}

		const poll_health = () => {
			const deadline = Date.now() + 120000
			const tick = async () => {
				let version = null
				try {
					const health_response = await fetch('/health')
					if (health_response.ok) {
						const health = await health_response.json()
						version = health?.version ?? null
					}
				} catch (_error) {
					// server still restarting: keep polling until the deadline
				}
				if (version!==null) {
					const ending = resolve_health_outcome(state, version)
					if (ending.outcome==='updated') {
						finish_success(version)
						return
					}
					// the server is back on the OLD version → the job rolled back
					state = { ...state, mode:'rolled_back' }
					track.paint(state)
					const rolled_back_text = (get_label.update_code_rolled_back || 'The update was rolled back — the server is running the previous version.')
						+ (ending.message ? (' ' + ending.message) : '')
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'dd_note state_warning',
						text_content	: rolled_back_text,
						parent			: body_response
					})
					return
				}
				if (Date.now() >= deadline) {
					state = { ...state, mode:'failed' }
					finish_failed(get_label.update_code_server_gone || 'The server did not come back — check the logs.')
					return
				}
				setTimeout(tick, 2000)
			}
			setTimeout(tick, 2000)
		}

	// on_done: the stream closed (final frame OR connection death)
		const on_done = () => {
			observer.disconnect()
			if (state.mode==='done') {
				finish_success(state.version)
				return
			}
			if (state.mode==='rolled_back') {
				finish_failed((get_label.update_code_rolled_back || 'The update was rolled back — the server is running the previous version.')
					+ (state.message ? (' ' + state.message) : ''))
				return
			}
			if (state.mode==='failed') {
				finish_failed(state.message)
				return
			}
			// the JOB itself ended (final frame seen) without a failed-phase
			// frame: a pre-phase refusal (code_update.ts refuses before any
			// phase starts) reports its sentence only in the final error —
			// render THAT, never "connection lost".
			if (stream_final) {
				state = { ...state, mode:'failed' }
				finish_failed(final_error ? error_text(final_error) : state.message)
				return
			}
			// the stream died mid-job: let the reducer decide
			// (post-swap → polling; pre-swap → indeterminate 'interrupted')
			state = apply_phase_frame(state, { interrupted : true })
			track.paint(state)
			if (state.mode==='polling') {
				// the old pid/pfile are meaningless to the restarted process:
				// delete the resume key BEFORE polling
				data_manager.delete_local_db_data(LOCAL_DB_ID, 'status')
				poll_health()
			} else {
				finish_interrupted()
			}
		}

	// stream the job (persists the resume key, renders msg/stop, cleans up)
		update_process_status(LOCAL_DB_ID, pid, pfile, stream_node, 1000, on_done)
}//end track_process



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
*   - "Build master release"    → branch: 'master'   → `<v>.zip`
*   - "Build developer release" → branch: 'v7'       → `<v>-dev.zip`
* The developer build has its OWN filename and never overwrites the master
* build of the same version.
*
* When either build completes, the `on_done` callback publishes the
* 'build_code_done' event so the data-version widget (update_data_version)
* can refresh automatically.
*
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
			inner_html		: get_label.update_code_git_builders || 'Code builders from GIT',
			parent			: build_version_group
		})

		// on_done. On button press, execute this function
		const on_done = () => {

			// event publish
			// listen by widget update_data_version.init
			event_manager.publish('build_code_done', self)
		}

		// version parts (shared by both confirm texts)
		const ar_version	= page_globals.dedalo_version.split('.')
		const major_version	= ar_version[0]
		const version		= [ar_version[0],ar_version[1],ar_version[2]].join('.')
		const release_dir	= `<DEDALO_CODE_FILES_DIR>/${major_version}/${ar_version[0]}.${ar_version[1]}/`

		// button Build Dédalo code MASTER branch
		self.caller.init_form({
			submit_label	: get_label.update_code_build_master || 'Build master release',
			confirm_text	: (get_label.update_code_build_master_confirm || "A release of the current version (%s) will be created from branch 'master' as: %s")
				.replace('%s', version)
				.replace('%s', `\n\n${release_dir}${version}.zip\n`),
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
		// its own `<v>-dev.zip` filename: it never overwrites the master build
		self.caller.init_form({
			submit_label	: get_label.update_code_build_developer || 'Build developer release',
			confirm_text	: (get_label.update_code_build_developer_confirm || "A developer release of the current version (%s) will be created from branch 'v7' as: %s The master build of the same version is kept.")
				.replace('%s', version)
				.replace('%s', `\n\n${release_dir}${version}-dev.zip\n\n`),
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
					branch : 'v7'
				}
			},
			on_done : on_done
		})
	}
}//end render_build_version



/**
* RENDER_INFO_MODAL
* Opens a modal dialog that lets the administrator select a code version and
* start the update.
*
* Modal structure:
*   - Header: the code server's entity/host (TEXT — never markup).
*   - Body: source readout (entity/host/version) + files_container — one radio
*     row per available ZIP (version, URL, build date). The FIRST entry — the
*     server sorts ascending, so the next rung on the linear upgrade path — is
*     pre-selected; the Update button stays DISABLED until one is selected.
*   - Footer: the "Update" button (confirm-gated via ui.confirm; the version +
*     host travel in the injection-safe `note` slot) + response surface.
*
* versions_info shape (update_code.prototype.get_code_update_info):
*   {
*     info  : { version, date, entity_id, entity, host },
*     files : [{ version, url, date }]   // version is always numeric x.y.z
*   }
*
* On accept the update starts as a BACKGROUND JOB: the response's `pid` +
* `pfile` extension keys feed `track_process` on the PANEL surface and the
* modal closes.
*
* SEC-XSS-009: API error strings and update messages are written via
* `textContent` / `createTextNode`, never via `innerHTML`.
*
* @param {Object} self - update_code widget instance
* @param {Object} versions_info - result object from get_code_update_info
* @param {HTMLElement} body_response - the PANEL response surface (phase track home)
* @returns {HTMLElement} modal element (already attached to the DOM)
*/
const render_info_modal = function( self, versions_info, body_response ) {

	// blur any selection
		document.activeElement.blur();

	// info (what the server actually sends: version/date/entity_id/entity/host)
		const info = versions_info.info || {}

	// header. TEXT only: entity + host are remote data
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: [info.entity, info.host].filter(Boolean).join(' · ') || (get_label.update || 'Update')
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body widget_update_code'
		})

	// source readout
		body.appendChild(build_readout([
			{ k : (get_label.version || 'Version'), v : info.version, mono : true },
			{ k : (get_label.update_ontology_master_server || 'Master server'), v : info.host }
		]))

	// files_container
		const files_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_container',
			parent			: body
		})

	// footer + response (declared before the loop: the loop toggles the button)
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content'
		})
		const response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response content'
		})

	// files. One radio row each; the <label> WRAPS the input (no ids), the
	// group name is per-modal.
		const group_name = 'update_code_version_' + (++modal_seq)
		const files = versions_info.files || []
		const files_length = files.length
		const valid_files = []
		let button_update = null
		for (let i = 0; i < files_length; i++) {

			const current_version = files[i];

			const file_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_container',
				parent			: files_container
			})
			file_container.dataset.version = String(current_version.version ?? '')

			const version_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'version_label unselectable',
				text_node		: String(current_version.version ?? ''),
				parent			: file_container
			})

			// input radio (wrapped by the label: no id needed, exactly as the
			// shared server picker does)
			const input_radio = ui.create_dom_element({
				element_type	: 'input',
				type			: 'radio',
				name			: group_name,
				value			: current_version.url
			})

			// change event handler
			const change_handler = () => {
				files.forEach( el => delete el.active )
				current_version.active = input_radio.checked
				body.querySelectorAll('.version_label, .value').forEach( el => el.classList.remove('active') )
				version_label.classList.add('active')
				value_node.classList.add('active')
				date_node.classList.add('active')
				if (button_update) {
					button_update.disabled = false
				}
			}
			input_radio.addEventListener('change', change_handler)
			input_radio.addEventListener('click', (e) => {
				e.stopPropagation()
			})

			// value (URL)
			const value_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				text_content	: String(current_version.url ?? ''),
				parent			: version_label
			})

			// date
			const date_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value date',
				text_content	: String(current_version.date || ''),
				parent			: version_label
			})

			version_label.prepend(input_radio)

			// by default index 0 is pre-selected. The server sorts ASCENDING
			// (code_manifest.ts linearUpgradeTargets), so index 0 is the NEXT
			// rung on the linear upgrade path — the only choice the consumer's
			// assertLinearUpgrade accepts. Never "the newest": picking the last
			// entry would offer a version the install cannot legally jump to.
			if(i===0){
				input_radio.checked = true
				current_version.active = true
				version_label.classList.add('active')
			}

			// add to valid_files
			valid_files.push(current_version)
		}//end for (let i = 0; i < files_length; i++)

		if (valid_files.length===0) {

			// No updates found: the server has no ZIP newer than this version.
			// The full server response is dumped as JSON for diagnostics.
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content',
				text_content	: get_label.update_code_no_updates || 'There are no updates available for your version.',
				parent			: response
			})
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'content',
				text_content	: JSON.stringify(versions_info, null, 2),
				parent			: response
			})

		}else{

			// button_update. DISABLED until a version is selected (index 0 is
			// pre-selected, so it starts enabled with a valid selection).
				button_update = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'success',
					inner_html		: get_label.update || 'Update',
					parent			: footer
				})
				button_update.disabled = !files.some(el => el.active===true)

				// click event
				const click_handler = async (e) => {
					e.stopPropagation()

					// inline validation: a version file must be chosen
					const file_active = files.find(el => el.active === true)
					if (!file_active) {
						button_update.disabled = true
						response.textContent = get_label.empty_selection || 'Empty selection'
						response.classList.add('error')
						return
					}
					response.classList.remove('error')

					// confirm. The version + host are DATA → the `note` text slot.
					const accepted = await ui.confirm({
						header			: get_label.update || 'Update',
						note			: (get_label.update_code_confirm_note || 'install version %s from %s')
							.replace('%s', String(file_active.version ?? ''))
							.replace('%s', String(info.host ?? '')),
						body			: get_label.sure || 'Are you sure?',
						accept_label	: get_label.update || 'Update'
					})
					if (accepted!==true) {
						return
					}

					button_update.classList.add('hide')
					body.classList.add('loading')

					// spinner
					const spinner = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'spinner',
						parent			: footer
					})

					// update_code. Submits the BACKGROUND JOB; the response returns
					// immediately with `pid` + `pfile` extension keys.
					const api_response = await self.update_code({
						info		: info,
						file_active	: file_active
					})

					body.classList.remove('loading')
					spinner.remove()

					// the update's own findings: EXTENSION KEYS of the success body —
					// a FAILURE says it once, coded, through `error`.
					const update_errors = response_extension(api_response, 'errors') || []
					const pid	= response_extension(api_response, 'pid')
					const pfile	= response_extension(api_response, 'pfile')
					if (request_failed(api_response) || !response_data(api_response) || update_errors.length || !pid || !pfile) {

						// SEC-XSS-009: shell/git output may contain HTML
						// metacharacters — TEXT nodes only.
						response.replaceChildren()
						if (update_errors.length) {
							update_errors.forEach((err, idx) => {
								if (idx > 0) response.appendChild(document.createElement('br'))
								response.appendChild(document.createTextNode(String(err)))
							})
						} else {
							response.textContent = request_failed(api_response)
								? error_text(api_response.error)
								: (response_extension(api_response, 'msg') || 'Unknown error on API update_code')
						}
						button_update.classList.remove('hide')
						return
					}

					// job accepted: close the modal, follow it on the panel surface
					if (typeof modal.close==='function') {
						modal.close()
					}
					track_process(pid, pfile, body_response, String(file_active.version ?? '') || null)
				}
				button_update.addEventListener('click', click_handler)
				// Focus the Update button immediately so keyboard users can confirm
				// without moving focus away from the modal.
				dd_request_idle_callback(
					() => {
						button_update.focus()
					}
				)
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
			}
		})
		modal.classList.add('widget_update_code_modal')


	return modal
}//end render_info_modal



// @license-end
