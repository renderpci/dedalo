// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// import
	import { event_manager } from '../../../core/common/js/event_manager.js'
	import { mcp_client } from './mcp_client.js'
	import { model_engine } from './model_engine.js'
	import { chat_render } from './chat_render.js'
	import { conversation_store } from './conversation_store.js'



const PREFS_KEY = 'dedalo_assistant_pref_v1'

/**
 * Localized label helper.
 */
const t = function(key, fallback) {
	if (typeof get_label !== 'undefined' && get_label && get_label[key]) {
		return get_label[key]
	}
	return fallback
}//end t



/**
 * AI_ASSISTANT
 * Orchestrates the conversation loop: local model ↔ MCP tools ↔ chat UI.
 */
export const ai_assistant = class ai_assistant {



	constructor(options={}) {

		this._config			= Object.assign({}, options.tool_config || {})
		this._tool_self			= options.tool_self || null

		// merge user prefs (from localStorage) over tool defaults
		const prefs = ai_assistant._read_prefs()
		if (prefs.model_id) this._config.model_id = prefs.model_id
		if (prefs.device) this._config.device = prefs.device

		this._mcp_client		= new mcp_client()
		this._model_engine		= new model_engine(this._config)
		this._chat_render		= new chat_render()
		this._store				= new conversation_store()
		this._conversation		= []
		this._mcp_tools			= []
		this._mcp_initialized	= false
		this._model_loading		= false
		this._abort_controller	= null
		this._is_generating		= false
		this._context			= {}
		this._event_tokens		= []
		this._thread_id			= null

		this._subscribe_events()
	}//end constructor



	_subscribe_events() {

		this._event_tokens.push(
			event_manager.subscribe('activate_component', (data) => {
				if (data && data.tipo) {
					this._context.component_tipo	= data.tipo
					this._context.component_label	= data.label || data.tipo
					this._context.section_tipo		= data.section_tipo || this._context.section_tipo
					this._context.section_id		= data.section_id || this._context.section_id
				}
			})
		)

		this._event_tokens.push(
			event_manager.subscribe('render_instance', (data) => {
				if (data && (data.model === 'section' || data.model === 'area_section')) {
					this._context.section_tipo	= data.tipo || this._context.section_tipo
					this._context.section_id	= data.section_id || this._context.section_id
				}
			})
		)

		this._event_tokens.push(
			event_manager.subscribe('user_navigation', (data) => {
				if (data && data.section_tipo) {
					this._context.section_tipo	= data.section_tipo
					this._context.section_id	= data.section_id
				}
			})
		)
	}//end _subscribe_events



	_unsubscribe_events() {
		for (const token of this._event_tokens) {
			event_manager.unsubscribe(token)
		}
		this._event_tokens = []
	}//end _unsubscribe_events



	async build_chat_ui() {

		const self = this

		const content_data = this._chat_render.build({
			on_send				: (message) => self._handle_user_message(message),
			on_new_conversation	: () => self._new_conversation(),
			on_abort			: () => self._abort_generation(),
			on_load_thread		: (id) => self._load_thread(id),
			on_delete_thread	: (id) => self._delete_thread(id),
			on_settings_change	: (s) => self._apply_settings(s),
			on_list_threads		: () => self._store.list(),
			get_settings		: () => ({
				model_id		: self._config.model_id,
				device			: self._config.device,
				dtype			: self._config.dtype,
				thinking		: self._config.thinking,
				thinking_options: self._config.thinking_options,
				models			: self._collect_models()
			})
		})

		this._chat_render.set_model_badge(this._config.model_id, this._config.device)

	// restore last active thread, if any
		const active_id = this._store.get_active_id()
		if (active_id) {
			const thread = this._store.get(active_id)
			if (thread && Array.isArray(thread.messages) && thread.messages.length > 0) {
				this._thread_id = active_id
				this._conversation = thread.messages.slice()
				this._replay_conversation()
			}
		}
		if (!this._thread_id) {
			this._thread_id = this._store.create()
		}

		this._chat_render.add_system_message(t('connecting_mcp', 'Connecting to Dédalo MCP server...'))
		try {
			await this._initialize_mcp()
			this._chat_render.add_system_message(
				t('mcp_connected', 'Connected. {n} tools available.').replace('{n}', this._mcp_tools.length)
			)
		} catch (err) {
			this._chat_render.add_system_message(t('mcp_failed', 'MCP connection failed:') + ' ' + err.message)
		}

		this._model_loading = true
		this._chat_render.add_system_message(t('model_loading', 'Loading model...') + ' ' + this._model_engine.get_model_id())
		this._chat_render.show_progress(0)

		try {
			await this._model_engine.load({
				on_progress: (progress) => {
					self._chat_render.show_progress(progress)
				}
			})
			this._model_loading = false
			this._chat_render.hide_progress()
			this._chat_render.set_model_badge(this._model_engine.get_model_id(), this._model_engine.get_device())
			this._chat_render.add_system_message(t('model_ready', 'Model ready. How can I help you?'))
		} catch (err) {
			this._model_loading = false
			this._chat_render.hide_progress()
			this._chat_render.add_system_message(t('model_failed', 'Model load failed:') + ' ' + err.message)
		}

		return content_data
	}//end build_chat_ui



	_replay_conversation() {

		const self = this
		this._chat_render.clear_messages()

		this._conversation.forEach(function(msg) {
			if (msg.role === 'user' && typeof msg.content === 'string') {
				self._chat_render.add_user_message(msg.content)
			} else if (msg.role === 'assistant') {
				if (msg.tool_calls && msg.tool_calls.length > 0) {
					if (msg.content) self._chat_render.add_assistant_message(msg.content)
					msg.tool_calls.forEach(function(tc) {
						let args = tc.function && tc.function.arguments
						try { if (typeof args === 'string') args = JSON.parse(args) } catch(e) {}
						self._chat_render.add_tool_call(tc.function.name, 'done', args, null)
					})
				} else if (typeof msg.content === 'string') {
					self._chat_render.add_assistant_message(msg.content)
				}
			} else if (msg.role === 'tool') {
				// tool result already attached to previous tool_call indicator (best-effort)
			}
		})
	}//end _replay_conversation



	_collect_models() {
		// each entry is a self-contained model config: { model_id, label, dtype,
		// device, fallback_device, max_new_tokens, thinking, thinking_options }.
		if (Array.isArray(this._config.models) && this._config.models.length > 0) {
			return this._config.models.slice()
		}
		// sensible default mirroring current active config
		return [{
			model_id		: this._config.model_id,
			label			: this._config.label || this._config.model_id,
			dtype			: this._config.dtype,
			device			: this._config.device,
			fallback_device	: this._config.fallback_device || 'wasm',
			max_new_tokens	: this._config.max_new_tokens || 2048,
			thinking		: this._config.thinking || 'none',
			thinking_options: this._config.thinking_options || ['none']
		}]
	}//end _collect_models



	async _apply_settings(new_settings) {

		const self = this
		if (!new_settings) return
		const model_changed		= new_settings.model_id && new_settings.model_id !== this._config.model_id
		const device_changed	= new_settings.device && new_settings.device !== this._config.device
		const thinking_changed	= new_settings.thinking && new_settings.thinking !== this._config.thinking
		const needs_reload		= model_changed || device_changed

		if (!needs_reload && !thinking_changed) return

		if (this._is_generating || this._model_loading) {
			this._chat_render.add_system_message('Cannot change settings while busy.')
			return
		}

		// if a different model is selected, pull its full config from `models`
		if (model_changed) {
			const next = (Array.isArray(this._config.models) ? this._config.models : [])
				.find(m => m && m.model_id === new_settings.model_id)
			if (next) {
				this._config.model_id			= next.model_id
				this._config.label				= next.label || next.model_id
				this._config.dtype				= next.dtype || 'q4f16'
				this._config.device				= next.device || 'webgpu'
				this._config.fallback_device	= next.fallback_device || 'wasm'
				this._config.max_new_tokens		= next.max_new_tokens || 2048
				this._config.thinking			= next.thinking || 'none'
				this._config.thinking_options	= Array.isArray(next.thinking_options) ? next.thinking_options : ['none']
			} else {
				this._config.model_id = new_settings.model_id
			}
		}
		// explicit user overrides take precedence over model defaults
		if (new_settings.device)	this._config.device = new_settings.device
		if (new_settings.dtype)		this._config.dtype = new_settings.dtype
		if (new_settings.thinking)	this._config.thinking = new_settings.thinking

		ai_assistant._write_prefs({
			model_id	: this._config.model_id,
			device		: this._config.device,
			thinking	: this._config.thinking
		})

		if (!needs_reload) {
			// thinking-only change: engine picks it up on next generate via config ref
			return
		}

		// rebuild engine
		try { this._model_engine.unload() } catch(e) {}
		this._model_engine = new model_engine(this._config)
		this._model_loading = true
		this._chat_render.show_progress(0)
		this._chat_render.add_system_message(t('model_loading', 'Loading model...') + ' ' + this._config.model_id)

		try {
			await this._model_engine.load({
				on_progress: (progress) => {
					self._chat_render.show_progress(progress)
				}
			})
			this._model_loading = false
			this._chat_render.hide_progress()
			this._chat_render.set_model_badge(this._model_engine.get_model_id(), this._model_engine.get_device())
			this._chat_render.add_system_message(t('model_ready', 'Model ready. How can I help you?'))
		} catch (err) {
			this._model_loading = false
			this._chat_render.hide_progress()
			this._chat_render.add_system_message(t('model_failed', 'Model load failed:') + ' ' + err.message)
		}
	}//end _apply_settings



	async _initialize_mcp() {

		if (this._mcp_initialized) return

		// try tools/list first
			try {
				var tools_result = await this._mcp_client.tools_list()
				if (tools_result && tools_result.data && tools_result.data.result && tools_result.data.result.tools) {
					this._mcp_tools = tools_result.data.result.tools
					this._mcp_initialized = true
					return
				}
			} catch(e) {
				// proceed with handshake
			}

		// MCP initialize handshake
			let init_result = null
			try {
				init_result = await this._mcp_client.initialize()
			} catch(e) {
				console.error('[ai_assistant] MCP initialize failed:', e.message)
				throw e
			}

			if (init_result && init_result.data && init_result.data.result) {
				this._mcp_client._capabilities	= init_result.data.result.capabilities || {}
				this._mcp_client._initialized	= true
			}

		// initialized notification
			try {
				await this._mcp_client.send_notification('notifications/initialized')
			} catch(e) {
				// ignore
			}

		// discover tools
			tools_result = await this._mcp_client.tools_list()
			if (tools_result && tools_result.data && tools_result.data.result && tools_result.data.result.tools) {
				this._mcp_tools = tools_result.data.result.tools
			}

		this._mcp_initialized = true
	}//end _initialize_mcp



	_build_system_prompt() {

		return 'You are a helpful AI assistant inside Dedalo, a cultural heritage management system. You help users search records, navigate the ontology, and perform actions using natural language. /no_think\n\nCurrent context:\n- Section: ' + (this._context.section_tipo || 'unknown') + '\n- Record ID: ' + (this._context.section_id || 'unknown') + '\n- Active component: ' + (this._context.component_tipo || 'none') + '\n\nWhen you need to query or modify Dedalo data, use the available tools. Always confirm with the user before performing destructive actions (delete, modify). Format your responses in Markdown.'
	}//end _build_system_prompt



	_build_tools_for_model() {

		if (!this._mcp_tools.length) return []

		const allowed_tools = [
			'dedalo_get_environment',
			'dedalo_list_sections',
			'dedalo_get_ontology_info',
			'dedalo_get_section_elements_context',
			'dedalo_read_record',
			'dedalo_search_records',
			'dedalo_count_records',
			'dedalo_create_record',
			'dedalo_save_component',
			'dedalo_delete_record',
			'dedalo_start'
		]

		return this._mcp_tools.filter(function(tool) {
			return allowed_tools.indexOf(tool.name) !== -1
		}).map(function(tool) {
			return {
				type		: 'function',
				function	: {
					name		: tool.name,
					description	: (tool.description || '').substring(0, 200),
					parameters	: tool.inputSchema || {}
				}
			}
		})
	}//end _build_tools_for_model



	/**
	* _SANITIZE_SCHEMA
	* Produces a "lowest-common-denominator" JSON schema that BOTH the Qwen and
	* Gemma chat templates can consume. Gemma 4's template applies the Jinja
	* filter `upper` to every property's `type` without a guard, so any
	* missing/non-string `type` raises
	* "Cannot apply filter 'upper' to UndefinedValue".
	* Strategy: whitelist only the fields Gemma understands (`type`, `description`,
	* `properties`, `required`, `items`, `enum`, `nullable`) and ensure every node
	* recursively has a valid string `type`. Untyped / `anyOf` / `$ref` / `unknown`
	* leaves are coerced to `{ type: 'string' }`.
	* @param object schema
	* @return object
	*/
	static _sanitize_schema(schema) {

		// non-mapping → safe default
		if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
			return { type: 'string' }
		}

		const allowed_types = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']

		// pick first valid type when schema.type is an array (e.g. ["string", "null"])
		let inferred_type = null
		if (typeof schema.type === 'string' && allowed_types.indexOf(schema.type) !== -1) {
			inferred_type = schema.type
		} else if (Array.isArray(schema.type)) {
			for (let i = 0; i < schema.type.length; i++) {
				if (typeof schema.type[i] === 'string' && schema.type[i] !== 'null' && allowed_types.indexOf(schema.type[i]) !== -1) {
					inferred_type = schema.type[i]
					break
				}
			}
		}

		// fallback inference from shape
		if (!inferred_type) {
			if (schema.properties && typeof schema.properties === 'object') {
				inferred_type = 'object'
			} else if (schema.items) {
				inferred_type = 'array'
			} else if (Array.isArray(schema.enum) && schema.enum.length > 0) {
				inferred_type = typeof schema.enum[0] === 'number' ? 'number' : 'string'
			} else {
				inferred_type = 'string'
			}
		}

		const out = { type: inferred_type }

		if (typeof schema.description === 'string' && schema.description.length > 0) {
			out.description = schema.description
		}

		if (schema.nullable === true) {
			out.nullable = true
		}

		if (Array.isArray(schema.enum) && schema.enum.length > 0) {
			out.enum = schema.enum.slice()
		}

		if (inferred_type === 'object') {
			out.properties = {}
			if (schema.properties && typeof schema.properties === 'object') {
				const keys = Object.keys(schema.properties)
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i]
					out.properties[k] = ai_assistant._sanitize_schema(schema.properties[k])
				}
			}
			if (Array.isArray(schema.required) && schema.required.length > 0) {
				out.required = schema.required.filter(function(r) { return typeof r === 'string' })
			}
		}

		if (inferred_type === 'array') {
			out.items = ai_assistant._sanitize_schema(schema.items || {})
		}

		return out
	}//end _sanitize_schema



	async _handle_user_message(message) {

		const self = this

		if (this._is_generating || this._model_loading) return

		this._abort_controller = new AbortController()

		this._conversation.push({
			role	: 'user',
			content	: message
		})

		this._chat_render.add_user_message(message)
		this._chat_render.hide_input()

		this._is_generating = true
		this._persist()

		const max_iterations	= 5
		let iteration			= 0

		const system_prompt	= self._build_system_prompt()
		const tools			= self._build_tools_for_model()

		try {
			while (iteration < max_iterations) {
				iteration++

				if (self._abort_controller && self._abort_controller.signal.aborted) {
					throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
				}

				const messages = [
					{ role: 'system', content: system_prompt },
					...self._conversation
				]

				let stream_started = false
				const stream_callback = (token_text) => {
					if (!stream_started) {
						stream_started = true
						self._chat_render.start_assistant_message()
					}
					self._chat_render.append_token(token_text)
				}

				const generation_result = await self._model_engine.generate({
					messages		: messages,
					tools			: tools,
					max_new_tokens	: self._config.max_new_tokens || 2048,
					signal			: self._abort_controller.signal,
					on_token		: stream_callback
				})

				const tool_calls = self._model_engine.parse_tool_calls(generation_result)

				if (tool_calls && tool_calls.length > 0) {

					self._conversation.push({
						role		: 'assistant',
						content		: generation_result.full_text || null,
						tool_calls	: tool_calls
					})

					self._chat_render.finalize_assistant_message()

					for (const tool_call of tool_calls) {
						let args_obj = tool_call.function.arguments
						try {
							if (typeof args_obj === 'string') args_obj = JSON.parse(args_obj)
						} catch(e) {}

						const indicator = self._chat_render.add_tool_call(
							tool_call.function.name, 'calling', args_obj, null
						)

						const destructive_tools = ['dedalo_delete_record', 'dedalo_save_component']
						if (destructive_tools.indexOf(tool_call.function.name) >= 0) {
							const confirmed = await self._chat_render.confirm_action(
								t('confirm_action', 'Confirm action') + ': ' + tool_call.function.name
							)
							if (!confirmed) {
								self._conversation.push({
									role			: 'tool',
									tool_call_id	: tool_call.id,
									content			: t('denied', 'User denied this action.')
								})
								self._chat_render.update_tool_call(indicator, 'denied', null)
								continue
							}
						}

						try {
							const tool_result = await self._mcp_client.tools_call(
								tool_call.function.name,
								tool_call.function.arguments
							)
							const result_payload = (tool_result && tool_result.result && tool_result.result.content) || tool_result
							const result_text = JSON.stringify(result_payload)

							self._chat_render.update_tool_call(indicator, 'done', result_payload)

							self._conversation.push({
								role			: 'tool',
								tool_call_id	: tool_call.id,
								content			: result_text
							})
						} catch (err) {
							self._chat_render.update_tool_call(indicator, 'error', err.message)
							self._conversation.push({
								role			: 'tool',
								tool_call_id	: tool_call.id,
								content			: 'Error: ' + err.message
							})
						}
					}

					self._persist()
					continue

				} else {
					self._conversation.push({
						role	: 'assistant',
						content	: generation_result.full_text || ''
					})
					self._chat_render.finalize_assistant_message()
					self._persist()
					break
				}
			}
		} catch (err) {
			console.error('[ai_assistant] generation error:', err)
			if (err.name === 'AbortError') {
				self._chat_render.add_system_message(t('generation_stopped', 'Generation stopped.'))
			} else {
				self._chat_render.add_system_message('Error: ' + err.message)
			}
		} finally {
			self._is_generating = false
			self._abort_controller = null
			self._chat_render.show_input()
		}
	}//end _handle_user_message



	_persist() {
		if (!this._thread_id) return
		this._store.save(this._thread_id, this._conversation)
	}//end _persist



	_new_conversation() {
		this._conversation = []
		this._thread_id = this._store.create()
		this._chat_render.clear_messages()
		this._chat_render.add_system_message(t('new_conversation_started', 'New conversation started.'))
	}//end _new_conversation



	_load_thread(id) {
		if (this._is_generating || this._model_loading) return
		const thread = this._store.get(id)
		if (!thread) return
		this._store.set_active(id)
		this._thread_id = id
		this._conversation = (thread.messages || []).slice()
		this._replay_conversation()
	}//end _load_thread



	_delete_thread(id) {
		this._store.delete(id)
		if (id === this._thread_id) {
			// fall back to most recent or create new
			const remaining = this._store.list()
			if (remaining.length > 0) {
				this._load_thread(remaining[0].id)
			} else {
				this._new_conversation()
			}
		}
	}//end _delete_thread



	_abort_generation() {
		if (this._abort_controller) {
			this._abort_controller.abort()
		}
	}//end _abort_generation



	is_model_loading() {
		return this._model_loading
	}//end is_model_loading



	abort_model_load() {
		if (this._abort_controller) {
			this._abort_controller.abort()
		}
		this._model_loading = false
	}//end abort_model_load



	destroy() {
		this._unsubscribe_events()
		if (this._model_engine) {
			this._model_engine.unload()
		}
	}//end destroy



	static _read_prefs() {
		try {
			const raw = window.localStorage.getItem(PREFS_KEY)
			if (!raw) return {}
			return JSON.parse(raw) || {}
		} catch(e) { return {} }
	}//end _read_prefs



	static _write_prefs(prefs) {
		try {
			window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
		} catch(e) {}
	}//end _write_prefs



}//end ai_assistant class
