// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



// import
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { agent_stream } from './agent_stream.js'
	import { handle_api_error } from '../../../core/common/js/error_dispatch.js'
	// api_error: the ONE client error model (envelope v2). `request_failed` is the
	// failure test on a data_manager envelope and `response_data` the payload
	// accessor — this tool never reads `.msg` / `.errors` / `.result`.
	import { ApiError, CLIENT_ERROR, request_failed, response_data } from '../../../core/common/js/api_error.js'
	import { error_text } from '../../../core/common/js/render_api_error.js'
	import { chat_render } from './chat_render.js'
	import { client_context } from './client_context.js'
	import { conversation_store } from './conversation_store.js'
	import { set_label_resolver, t } from './tool_labels.js'



/**
 * ASSISTANT_CONTROLLER
 * The server-driven controller for the Dédalo AI assistant chat (WC-013).
 *
 * Replaces the former in-browser engine (ai_assistant.js + model_engine.js +
 * mcp_client.js + client_tools.js): the agent loop, the system prompt, model
 * access, tool execution, and the egress policy all live SERVER-SIDE behind
 * `dd_mcp_api` (agent_models / agent_chat_stream / agent_apply). This class
 * is a thin turn driver:
 *
 *   send → assemble {question, history, context, model, mode, images}
 *        → agent_stream (SSE) → render deltas + tool chips
 *        → final: persist the server-returned history (the server is
 *          stateless — the client is the conversation state holder)
 *        → change_plan? → inline confirm card → agent_apply → report.
 *
 * Capabilities come from `agent_models` at boot: the model catalog (id,
 * label, egress class, vision — never endpoints or keys) and whether write
 * mode is available to this user. A fail-closed server
 * (DEDALO_AGENT_HTTP_ENABLED=false) renders a permanently disabled panel.
 *
 * State kept here: the display messages of the active thread (for replay),
 * the server-returned wire `history` (resent verbatim next turn), pending
 * image attachments, and the per-thread model choice. Persistence:
 * conversation_store (localStorage, v2 blob).
 *
 * @module assistant_controller
 */



const PREFS_KEY				= 'dedalo_assistant_pref_v1'
const IMAGE_MAX_BYTES		= 5 * 1024 * 1024
const IMAGE_MEDIA_TYPES		= ['image/jpeg', 'image/png', 'image/webp', 'image/gif']



export const assistant_controller = class assistant_controller {



	/**
	 * CONSTRUCTOR
	 * @param {Object} options
	 * @param {Object} [options.tool_config] - dd1633 tool config (empty since WC-013; kept as an escape hatch)
	 * @param {Object} [options.tool_self]   - the tool_assistant instance; supplies
	 *   `get_tool_label` to the shared label resolver (tool_labels.js)
	 */
	constructor(options={}) {

		this._tool_config		= options.tool_config || {}
		this._tool_self			= options.tool_self || null

		// Wire this tool's own labels (register.json misc.dd1372) into the `t()`
		// helper shared by this module and chat_render.
		set_label_resolver(this._tool_self)

		/** @type {chat_render} DOM manager for the chat UI. */
		this._chat_render		= new chat_render()
		/** @type {client_context} Tracks the active section/record/component in the Dédalo UI. */
		this._client_context	= new client_context()
		/** @type {conversation_store} localStorage thread persistence (v2 blob). */
		this._store				= new conversation_store()

		/** Server capabilities (agent_models): {models:[], write_allowed:bool}|null. */
		this._capabilities		= null
		/** True when the server refused the capability call (assistant disabled). */
		this._disabled			= false

		/** The active thread id (conversation_store). */
		this._thread_id			= null
		/** Display messages of the active thread: [{role, content}]. */
		this._messages			= []
		/** The server-returned wire history, resent VERBATIM next turn. */
		this._history			= []
		/** Pending image attachments: [{media_type, data_base64, name}]. */
		this._attachments		= []

		const prefs				= assistant_controller._read_prefs()
		/** The selected catalog model id (per-thread; seeded from prefs). */
		this._model_id			= prefs.model_id || null
		/** Write-mode toggle state (effective only when server allows it). */
		this._write_mode		= prefs.mode === 'write'

		/** In-flight generation state. */
		this._is_generating		= false
		this._abort_controller	= null
		/** Tool chips of the current turn, keyed by tool_use id. */
		this._tool_nodes		= new Map()
	}//end constructor



	/**
	 * BUILD_CHAT_UI
	 * Build the chat DOM, restore the active thread, and load the server
	 * capabilities (model catalog + write availability). Returns the
	 * content_data element render_tool_assistant mounts.
	 * @returns {Promise<HTMLElement>}
	 */
	async build_chat_ui() {

		const self = this

		const content_data = this._chat_render.build({
			on_send				: (message) => self._handle_user_message(message),
			on_abort			: () => self._abort_generation(),
			on_new_conversation	: () => self._new_conversation(),
			on_load_thread		: (id) => self._load_thread(id),
			on_delete_thread	: (id) => self._delete_thread(id),
			on_list_threads		: () => self._store.list(),
			on_settings_change	: (settings) => self._apply_settings(settings),
			get_settings		: () => self._get_settings(),
			on_attach_file		: (file) => self._attach_file(file)
		})

		// restore the active thread (display replay + wire history)
		const active_id = this._store.get_active_id()
		if (active_id) {
			this._load_thread(active_id, true)
		} else {
			this._thread_id = this._store.create()
		}

		await this._load_capabilities()

		return content_data
	}//end build_chat_ui



	/**
	 * DESTROY
	 * Release listeners and abort any in-flight stream.
	 */
	destroy() {
		if (this._abort_controller) this._abort_controller.abort()
		this._client_context.destroy()
	}//end destroy



	// ----- CAPABILITIES ---------------------------------------------------------

	/**
	 * _LOAD_CAPABILITIES
	 * Fetch the model catalog + write availability (agent_models). A refusal
	 * flips the panel into the permanent disabled state — the fail-closed
	 * DEDALO_AGENT_HTTP_ENABLED=false UX.
	 * @returns {Promise<void>}
	 */
	async _load_capabilities() {

		let api_response = null
		try {
			api_response = await data_manager.request({
				body : { action: 'agent_models', dd_api: 'dd_mcp_api', options: {} }
			})
		} catch(e) {
			// a throw at the transport becomes THE client error model, so the check
			// below reads one shape whatever happened
			api_response = { ok: false, error: new ApiError({
				code	: CLIENT_ERROR.BAD_RESPONSE,
				message	: e.message
			})}
		}

		if (!api_response || request_failed(api_response) || !response_data(api_response)) {
			this._disabled = true
			this._chat_render.hide_input()
			this._chat_render.add_system_message(
				t('agent_disabled', 'The assistant is disabled on this server (DEDALO_AGENT_HTTP_ENABLED).')
			)
			return
		}

		this._capabilities = response_data(api_response)

		// resolve the active model: per-thread/pref choice if still in the
		// catalog, else the server default, else the first entry
		const models	= this._capabilities.models || []
		const chosen	= this._model_id
			? models.find((m) => m.id === this._model_id)
			: null
		const fallback	= models.find((m) => m.default === true) || models[0] || null
		const active	= chosen || fallback
		this._model_id	= active ? active.id : null

		if (!active) {
			this._disabled = true
			this._chat_render.hide_input()
			this._chat_render.add_system_message(
				t('agent_disabled', 'The assistant is disabled on this server (no models configured).')
			)
			return
		}

		this._update_model_badge(active)
		this._chat_render.set_attachments_visible(active.vision === true)
		if (this._messages.length === 0) {
			this._chat_render.add_system_message(t('assistant_ready', 'Ready. Ask about your data.'))
		}
	}//end _load_capabilities



	/**
	 * _ACTIVE_MODEL
	 * @returns {Object|null} the selected catalog model entry
	 */
	_active_model() {
		if (!this._capabilities) return null
		const models = this._capabilities.models || []
		return models.find((m) => m.id === this._model_id) || null
	}//end _active_model



	/**
	 * _UPDATE_MODEL_BADGE
	 * @param {Object} model - catalog entry {id, label, egress, vision}
	 */
	_update_model_badge(model) {
		const egress_label = model.egress === 'local'
			? t('local_private', 'local / private')
			: t('external_service', 'external service')
		this._chat_render.set_model_badge(model.label, egress_label, model.egress)
	}//end _update_model_badge



	// ----- SETTINGS ---------------------------------------------------------------

	/**
	 * _GET_SETTINGS
	 * Feeds the chat_render settings popover (model picker + write toggle).
	 * @returns {Object}
	 */
	_get_settings() {
		return {
			models			: this._capabilities ? (this._capabilities.models || []) : [],
			model_id		: this._model_id,
			write_allowed	: this._capabilities ? this._capabilities.write_allowed === true : false,
			write_mode		: this._write_mode
		}
	}//end _get_settings



	/**
	 * _APPLY_SETTINGS
	 * @param {Object} settings - {model_id, write_mode}
	 */
	_apply_settings(settings) {
		if (settings.model_id) this._model_id = settings.model_id
		this._write_mode = settings.write_mode === true
		assistant_controller._write_prefs({
			model_id	: this._model_id,
			mode		: this._write_mode ? 'write' : 'read'
		})
		const active = this._active_model()
		if (active) {
			this._update_model_badge(active)
			this._chat_render.set_attachments_visible(active.vision === true)
			// attachments for a non-vision model would be refused server-side
			if (active.vision !== true) this._attachments = []
		}
	}//end _apply_settings



	// ----- TURN LIFECYCLE ----------------------------------------------------------

	/**
	 * _HANDLE_USER_MESSAGE
	 * One full chat turn against agent_chat_stream (see module header).
	 * @param {string} message - trimmed user input
	 * @returns {Promise<void>}
	 */
	async _handle_user_message(message) {

		const self = this

		if (this._is_generating || this._disabled || !message) return
		this._is_generating		= true
		this._abort_controller	= new AbortController()
		this._tool_nodes.clear()

		this._chat_render.add_user_message(message)
		this._chat_render.hide_input()
		this._messages.push({ role: 'user', content: message })

		// assemble the wire options — the server is stateless: full history rides along
		const context	= this._build_context()
		const options	= {
			question	: message,
			history		: this._history,
			model		: this._model_id || undefined,
			mode		: (this._write_mode && this._capabilities && this._capabilities.write_allowed === true)
				? 'write'
				: 'read'
		}
		if (context) options.context = context
		if (this._attachments.length > 0) {
			options.images = this._attachments.map((a) => ({
				media_type	: a.media_type,
				data_base64	: a.data_base64
			}))
			this._attachments = []
			this._chat_render.clear_attachment_chips()
		}

		let started		= false
		let final_data	= null
		/** @type {ApiError|null} the ONE error model (api_error.js), never a hand-rolled body */
		let error_data	= null

		const ensure_started = function() {
			if (started) return
			started = true
			self._chat_render.start_assistant_message()
		}

		await agent_stream({
			options	: options,
			signal	: this._abort_controller.signal,
			on_start: function() {},
			on_thinking: function(data) {
				if (data.state === 'start') self._chat_render.show_thinking()
			},
			on_delta: function(text) {
				ensure_started()
				self._chat_render.append_token(text)
			},
			on_tool_use: function(data) {
				const node = self._chat_render.add_tool_call(
					data.name,
					'calling',
					data.summary || null,
					null
				)
				self._tool_nodes.set(data.id, node)
			},
			on_tool_result: function(data) {
				const node = self._tool_nodes.get(data.id)
				if (node) {
					self._chat_render.update_tool_call(
						node,
						data.ok ? 'done' : 'error',
						data.ok ? null : (data.code || 'error')
					)
				}
			},
			on_final: function(data) { final_data = data },
			on_error: function(api_error) { error_data = api_error }
		})

		const aborted = this._abort_controller.signal.aborted
		this._abort_controller = null
		this._is_generating = false
		this._chat_render.show_input()

		if (aborted) {
			this._chat_render.finalize_assistant_message()
			this._chat_render.add_system_message(t('generation_stopped', 'Generation stopped'))
			// the turn is NOT persisted into the wire history (no final frame)
			this._persist()
			return
		}

		if (error_data) {
			this._chat_render.finalize_assistant_message()
			// The transcript keeps the sentence — it is the record of what happened to
			// this turn, and it must survive a toast. The ACTION is the dispatcher's:
			// a session that died mid-turn raises the relogin overlay from here.
			const hint = (error_data.details && error_data.details.hint)
				? ' — ' + error_data.details.hint
				: ''
			this._chat_render.add_system_message(error_text(error_data) + hint)
			await handle_api_error(error_data, {scope:'tool_assistant'})
			this._persist()
			return
		}

		if (!final_data) {
			this._persist()
			return
		}

		// a non-streaming fallback answered without deltas: render the answer whole
		if (!started && final_data.answer) {
			this._chat_render.add_assistant_message(final_data.answer)
		} else {
			this._chat_render.finalize_assistant_message()
		}

		this._messages.push({ role: 'assistant', content: final_data.answer || '' })
		// the SERVER-returned history is the next turn's resend — verbatim
		if (Array.isArray(final_data.history)) {
			this._history = final_data.history
		}
		this._persist()

		if (final_data.change_plan) {
			await this._confirm_and_apply_plan(final_data.change_plan)
		}
	}//end _handle_user_message



	/**
	 * _ABORT_GENERATION
	 * Stop button: abort the fetch/reader; partial text stays on screen.
	 */
	_abort_generation() {
		if (this._abort_controller) this._abort_controller.abort()
	}//end _abort_generation



	/**
	 * _BUILD_CONTEXT
	 * The per-turn UI context (what the user is viewing), from client_context.
	 * @returns {Object|null}
	 */
	_build_context() {
		try {
			const ctx = this._client_context.get_context() || {}
			const out = {}
			if (ctx.section_tipo)	out.section_tipo	= ctx.section_tipo
			if (ctx.section_id)		out.section_id		= ctx.section_id
			if (ctx.component_tipo)	out.component_tipo	= ctx.component_tipo
			if (ctx.mode)			out.mode			= ctx.mode
			const summary = this._client_context.get_context_summary()
			if (summary) out.summary = summary
			return Object.keys(out).length > 0 ? out : null
		} catch(e) {
			return null
		}
	}//end _build_context



	// ----- CHANGE PLAN (propose → confirm → apply) -----------------------------------

	/**
	 * _CONFIRM_AND_APPLY_PLAN
	 * Render the inline confirm card for a proposed change plan; on Apply,
	 * POST agent_apply {plan, plan_hash} and render the report. The server
	 * re-validates EVERY gate at apply — the card is UX, not authorization.
	 * @param {Object} plan - the server-validated plan (carries plan_hash)
	 * @returns {Promise<void>}
	 */
	async _confirm_and_apply_plan(plan) {

		const confirmed = await this._chat_render.confirm_plan(plan)

		if (!confirmed) {
			this._chat_render.add_system_message(t('plan_discarded', 'Proposed changes discarded'))
			// tell the model next turn (plain user text — the history is text-only)
			this._history = this._history.concat([{ role: 'user', text: '[I declined the proposed changes.]' }])
			this._persist()
			return
		}

		let api_response = null
		try {
			api_response = await data_manager.request({
				body : {
					action	: 'agent_apply',
					dd_api	: 'dd_mcp_api',
					options	: { plan: plan, plan_hash: plan.plan_hash }
				}
			})
		} catch(e) {
			// data_manager RESOLVES on a failed call, so a rejection here is a genuine
			// client-side throw. It still becomes an ApiError: one model, one shape.
			api_response = {
				ok		: false,
				error	: new ApiError({
					code	: CLIENT_ERROR.BAD_RESPONSE,
					message	: (e && e.message) ? e.message : String(e),
					raw		: e
				})
			}
		}

		// FAILURE. A plan refused as a WHOLE throws server-side — `mcp.write_disabled`,
		// `mcp.plan_hash_mismatch`, `request.invalid`, `perm.*` (ERRORS_SPEC §5.2,
		// src/core/api/handlers/dd_mcp_api.ts agent_apply) — so it arrives as an
		// envelope-v2 failure with data_manager's ApiError under `error`. There is no
		// `msg` to read and no hand-rolled `apply_failed` body any more.
		if (request_failed(api_response)) {
			const api_error = api_response.error
			// the transcript keeps the sentence: it is the record of what this turn
			// did, and it must survive a toast being dismissed. The ACTION is the
			// dispatcher's — a session that died mid-apply raises the relogin overlay,
			// everything else deduped-toasts.
			this._chat_render.add_apply_report({
				error : {
					code	: api_error.code,
					message	: error_text(api_error),
					...(api_error.details && api_error.details.hint ? { hint: api_error.details.hint } : {})
				}
			})
			await handle_api_error(api_error, {scope:'tool_assistant'})
			this._history = this._history.concat([{ role: 'user', text: '[Applying the plan failed: ' + api_error.code + ']' }])
			this._persist()
			return
		}

		// SUCCESS. `data` is the MCP structured envelope `{ok:true, data:{applied,
		// skipped, created, failed?}}`: a plan that RAN and stopped on one op is a
		// REPORT, never a failure, and `failed` is rendered inside the card.
		const envelope	= response_data(api_response)
		const report	= (envelope && envelope.data) ? envelope.data : {}
		this._chat_render.add_apply_report(report)
		const applied_n	= Array.isArray(report.applied) ? report.applied.length : 0
		const failed	= report.failed ? 1 : 0
		this._history = this._history.concat([{
			role : 'user',
			text : '[I confirmed the plan; ' + applied_n + ' operation(s) applied' + (failed ? ', 1 failed' : '') + '.]'
		}])
		this._persist()
	}//end _confirm_and_apply_plan



	// ----- THREADS -----------------------------------------------------------------

	/**
	 * _PERSIST
	 * Save the active thread (display messages + wire history + model).
	 */
	_persist() {
		if (!this._thread_id) this._thread_id = this._store.create()
		this._store.save(this._thread_id, this._messages, {
			history		: this._history,
			model_id	: this._model_id
		})
	}//end _persist



	/**
	 * _NEW_CONVERSATION
	 */
	_new_conversation() {
		if (this._is_generating) this._abort_generation()
		this._thread_id		= this._store.create()
		this._messages		= []
		this._history		= []
		this._attachments	= []
		this._chat_render.clear_messages()
		this._chat_render.add_system_message(t('new_conversation_started', 'New conversation started'))
	}//end _new_conversation



	/**
	 * _LOAD_THREAD
	 * @param {string} id
	 * @param {boolean} [silent=false] - skip the DOM clear on first mount
	 */
	_load_thread(id, silent=false) {
		const thread = this._store.get(id)
		if (!thread) return
		this._store.set_active(id)
		this._thread_id	= id
		this._messages	= Array.isArray(thread.messages) ? thread.messages : []
		this._history	= Array.isArray(thread.history) ? thread.history : []
		if (thread.model_id) this._model_id = thread.model_id
		if (!silent) this._chat_render.clear_messages()
		this._replay_conversation()
		const active = this._active_model()
		if (active) this._update_model_badge(active)
	}//end _load_thread



	/**
	 * _DELETE_THREAD
	 * @param {string} id
	 */
	_delete_thread(id) {
		this._store.delete(id)
		if (id === this._thread_id) {
			this._new_conversation()
		}
	}//end _delete_thread



	/**
	 * _REPLAY_CONVERSATION
	 * Re-render the stored display messages of the active thread.
	 */
	_replay_conversation() {
		for (let i = 0; i < this._messages.length; i++) {
			const message = this._messages[i]
			if (message.role === 'user') {
				this._chat_render.add_user_message(message.content)
			} else if (message.role === 'assistant') {
				this._chat_render.add_assistant_message(message.content)
			} else {
				this._chat_render.add_system_message(message.content)
			}
		}
	}//end _replay_conversation



	// ----- ATTACHMENTS (vision) -------------------------------------------------------

	/**
	 * _ATTACH_FILE
	 * File-input attachment → base64 (raw, no data: prefix — the AgentImage
	 * wire shape). Shown as a chip; sent with the NEXT message.
	 * @param {File} file
	 * @returns {Promise<void>}
	 */
	async _attach_file(file) {
		if (!file) return
		if (IMAGE_MEDIA_TYPES.indexOf(file.type) === -1) {
			this._chat_render.add_system_message(t('image_type_unsupported', 'Unsupported image type'))
			return
		}
		if (file.size > IMAGE_MAX_BYTES) {
			this._chat_render.add_system_message(t('image_too_large', 'Image too large (max 5 MB)'))
			return
		}
		const data_url = await new Promise(function(resolve, reject) {
			const reader = new FileReader()
			reader.onloadend = function() { resolve(reader.result) }
			reader.onerror = reject
			reader.readAsDataURL(file)
		})
		const base64 = String(data_url).split(',')[1] || ''
		if (!base64) return
		this._attachments.push({
			media_type	: file.type,
			data_base64	: base64,
			name		: file.name
		})
		this._chat_render.add_attachment_chip(file.name)
	}//end _attach_file



	// ----- PREFS -----------------------------------------------------------------------

	/**
	 * _READ_PREFS
	 * @returns {Object} {model_id?, mode?}
	 */
	static _read_prefs() {
		try {
			const raw = window.localStorage.getItem(PREFS_KEY)
			if (!raw) return {}
			return JSON.parse(raw) || {}
		} catch(e) { return {} }
	}//end _read_prefs



	/**
	 * _WRITE_PREFS
	 * @param {Object} prefs
	 */
	static _write_prefs(prefs) {
		try {
			window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
		} catch(e) {
			console.warn('[assistant_controller] prefs write failed:', e.message)
		}
	}//end _write_prefs
}//end assistant_controller
