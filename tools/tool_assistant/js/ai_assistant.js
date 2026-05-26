// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// import
	import { mcp_client } from './mcp_client.js'
	import { model_engine } from './model_engine.js'
	import { chat_render } from './chat_render.js'
	import { conversation_store } from './conversation_store.js'
	import { client_context } from './client_context.js'
	import { CLIENT_TOOLS } from './client_tools.js'



const PREFS_KEY = 'dedalo_assistant_pref_v1'

// Allow tool-calling on up to this many turns before forcing an answer-only
// turn. Lets the model chain describe_section → search → get_record → answer
// while still bounding loops.
const MAX_TOOL_TURNS = 15

// Max bytes of stringified tool result pushed to the conversation. Mirrors the
// MCP `_extract_tool_result` budget so client and MCP results contribute
// comparable amounts to the KV cache.
const MAX_TOOL_RESULT_BYTES = 4000

// Agent-tier MCP tools missing the `agent` tag still need to surface to the
// model when no agent-tier section listing is available.
const PRIMITIVE_DISCOVERY_FALLBACK = ['dedalo_ontology_glossary', 'dedalo_list_sections', 'dedalo_resolve_path']
const PRIMITIVE_WRITE_ALLOWLIST = ['dedalo_create_record']

// Destructive MCP tools that require user confirmation before execution.
const DESTRUCTIVE_TOOLS = ['dedalo_delete_record']

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

		this._client_context	= new client_context()
		this._client_tools		= CLIENT_TOOLS
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
		this._ontology_glossary	= null
		this._ontology_index		= null
		this._ontology_loading	= null
		this._thread_id			= null

		this._client_context.update_from_events()
	}//end constructor



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
			max_new_tokens	: this._config.max_new_tokens || 512,
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
				this._config.max_new_tokens		= next.max_new_tokens || 512
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



	_build_system_prompt(tools_enabled) {

		const ctx		= this._client_context.get_context()
		const activeVal	= this._client_context.get_active_value()
		const summary	= tools_enabled ? this._client_context.get_context_summary() : null

		const prompt = ['You are a Dédalo assistant.']

		// Prefer the rich multi-line summary when available; otherwise a single
		// context line. Never emit both — they overlap.
		if (summary) {
			prompt.push('', 'Loaded data in CURRENT record:', summary)
		} else {
			prompt.push(
				'Current context: Section=' + (ctx.section_tipo || '?') +
				' Record=' + (ctx.section_id || '?') +
				' Component=' + (ctx.component_tipo || 'none') +
				(ctx.component_label ? ' (' + ctx.component_label + ')' : '') +
				(activeVal ? ' = "' + activeVal + '"' : '') + '.'
			)
		}

		if (tools_enabled) {
			prompt.push(
				'',
				'--- CLIENT TOOLS (instant, no server call) ---',
				'These tools read data ALREADY LOADED in your browser for the CURRENT record.',
				'Use them when the user asks about "this record", "this component", or visible data.',
				'  client_get_current_context   — Show current section/record/component info',
				'  client_read_component_value  — Read one component value by tipo (e.g. numisdata18)',
				'  client_list_section_data     — List ALL fields and values in this record',
				'  client_search_loaded_data    — Search text within current record values',
				'  client_analyze_image         — Describe / transcribe the active image in this record (requires vision api_url)',
				'  client_analyze_image_url    — Analyze ANY image URL from the vision model (use with dedalo_get_media_url)',
				'  client_get_active_search     — Inspect the current search filter and total',
				'  client_bulk_image_transcribe — Batch-process images from the active search into a text field (requires vision api_url)',
				'',
				'IMPORTANT — client_analyze_image vs client_analyze_image_url:',
				'  client_analyze_image reads from the CURRENT record in your browser only.',
				'  For images in OTHER sections (fetched via get_record/get_media_url), do:',
				'    1. dedalo_get_media_url(section_tipo, section_id, component_tipo) to get the URL',
				'    2. client_analyze_image_url(url, prompt) to analyze it',
				'  Do NOT pass a portal tipo (e.g. oh17) to client_analyze_image for a different section.',
				'',
				'IMPORTANT RULE: When user says "this component" or mentions the active component,',
				'call client_read_component_value with its tipo. Do NOT call describe_section —',
				'that tool is for describing a SECTION, not a component field.',
				'',
				'--- MCP SERVER TOOLS (server call needed) ---',
				'These read/write data on the server. Use them ONLY for data NOT in the current record.',
				'  describe_section    — Discover section structure (section, not component)',
				'  get_record          — Read one record from any section (portals expanded)',
				'  search_records_view — Search records with filters',
				'  count_records_view  — Count records in a section',
				'  set_field           — Write a value to a field (accepts locator arrays for portals)',
				'  create_record       — Create a new record in a section, returns section_id',
				'  get_media_url       — Resolve the public URL of a media component',
				'  save_component      — Write to a specific component by tipo (e.g. rsc85)',
			'  resolve_path        — Discover portal relation chains between sections',
			'',
			'--- DÉDALO PORTAL SYSTEM (MANDATORY — read this before any multi-step workflow) ---',
			'',
			'WHAT IS A PORTAL:',
			'A portal is a GENERIC link between sections. It stores REFERENCES (locators) to other records.',
			'Each locator is { section_tipo, section_id } — the target section type and the specific record ID.',
			'The TARGET section determines the type: Image (rsc170), Person (rsc197), PDF (rsc176), AV (rsc167),',
			'Toponomy (es1, fr1, it1, etc), Publication (rsc205), etc.',
			'NEVER assume what a portal contains until you read it with dedalo_get_record.',
			'',
			'HOW TO READ A PORTAL (dedalo_get_record response):',
			'When you call dedalo_get_record, portal fields appear as an ARRAY of locator objects.',
			'Example: "Identified Image: [{ref:"rsc170#5", section_tipo:"rsc170", section_id:"5"}]"',
			'  → ref is the human-readable label, NOT the section_id.',
			'  → section_tipo identifies the target section type.',
			'  → section_id is the numeric ID of the linked record — THIS is what you must extract.',
			'',
			'HANDLING THE TARGET RECORD:',
			'After dedalo_get_record on the target, INSPECT its fields to decide next steps:',
			'  - If it has a media component → use get_media_url with the target\'s own media tipo.',
			'    NEVER call get_media_url with a portal tipo. Each section has its own media component.',
			'  - If it has text fields (name, surname, description) → read them, modify with save_component.',
			'  - If it has further portals → follow the same portal workflow recursively.',
			'  General rule: the target section_tipo tells you what kind of data it holds.',
			'',
			'FOLLOWING A PORTAL (generic steps):',
			'  Step 1 — client_get_current_context to get section_tipo and section_id of current record.',
			'  Step 2 — dedalo_get_record(section_tipo, section_id) to read the record + its portal values.',
			'  Step 3 — Extract {section_tipo, section_id} from the portal field in the response.',
			'  Step 4 — dedalo_get_record(target_section_tipo, target_section_id) to read the linked record.',
			'  Step 5 — Inspect the target record fields. If it has a media component, get_media_url.',
			'  Step 6 — Process accordingly (analyze image, read person data, etc.).',
			'',
			'WRITING BACK THROUGH A PORTAL:',
			'  Step 1 — dedalo_create_record to create a new record in the target section (returns section_id).',
			'  Step 2 — dedalo_set_field to set individual fields by label (e.g. "Name", "Surname").',
			'  Step 3 — dedalo_set_field on the SOURCE section\'s portal field with a locator pointing to the new record.',
			'    Example: set_field(section_tipo="oh1", section_id="4", field="oh24",',
			'      value=[{section_tipo:"rsc197", section_id:"42"}])  — links Person#42 into oh1 Informantes.',
			'',
			'CRITICAL RULES:',
			'- NEVER guess section_id. Read it from the portal value in get_record response.',
			'- NEVER call get_media_url with a portal tipo. Use the target section\'s own media component.',
			'- When user gives explicit tipos (oh17→rsc170→rsc29), use them directly — skip resolve_path.',
			'- set_field for portals takes an ARRAY of locators [{section_tipo, section_id}].',
			'- The portal label in get_record output (e.g. "Identified Image") is NOT the field tipo.',
			'- Use the component tipo (oh17, oh24) for set_field operations.',
			'',
			'RULES:',
			'- If user says "review the prompt": stop, re-read original, list done/pending, continue.',
			'- Confirm before destructive actions. Reply in Markdown.'
			)

		} else {
			prompt.push(
				'',
				'Your ONLY task is to answer the user in plain text using the tool results already in the conversation.',
				'DO NOT use call: syntax. DO NOT call any tools.',
				'Output a natural language answer in Markdown.'
			)
		}

		return prompt.join('\n')
	}//end _build_system_prompt





	_build_tools_for_model() {

		const toFunctionDecl = function(tool) {
			const raw = tool.parameters && typeof tool.parameters === 'object'
				? Object.assign({ type: 'object' }, tool.parameters)
				: { type: 'object' }
			if (!raw.properties || typeof raw.properties !== 'object') {
				raw.properties = {}
			}
			return {
				type		: 'function',
				function	: {
					name		: tool.name,
					description	: ai_assistant._tool_description(tool),
					parameters	: ai_assistant._minimize_schema(
						ai_assistant._sanitize_schema(raw),
						0
					)
				}
			}
		}

		// 1. Client tools — always available, no server call. Routed through the
		// same sanitizer/minimizer as MCP tools so both chat templates
		// (Qwen/Gemma) see identical-shape declarations.
		const client_decls = this._client_tools.map(toFunctionDecl)

		// 2. MCP tools (agent-tier + discovery fallback only)
		if (!this._mcp_tools.length) return client_decls

		const mcp_decls = this._mcp_tools.filter(function(tool) {
			if (tool.annotations && tool.annotations.tier === 'agent') return true
			if (PRIMITIVE_DISCOVERY_FALLBACK.indexOf(tool.name) !== -1) return true
			if (PRIMITIVE_WRITE_ALLOWLIST.indexOf(tool.name) !== -1) return true
			return false
		}).map(function(tool) {
			return toFunctionDecl({
				name		: tool.name,
				description	: tool.description || '',
				parameters	: tool.inputSchema && typeof tool.inputSchema === 'object'
					? tool.inputSchema
					: { type: 'object' }
			})
		})

		try { console.debug('[ai_assistant] sanitized tools:', JSON.parse(JSON.stringify(mcp_decls))) } catch (e) {}

		return [...client_decls, ...mcp_decls]
	}//end _build_tools_for_model



	static _tool_description(tool) {

		const description = tool.description || ''
		// Cap every description at 400 chars to preserve portal/relation guidance.
		return description.substring(0, 400)
	}//end _tool_description



	/**
	 * _DISPATCH_TOOL
	 * Routes a single tool call to either a client-side handler (no server
	 * round-trip) or the MCP proxy. Returns the conversation `tool` message
	 * to push, and updates the chat indicator.
	 * @param object tool_call { id, function:{ name, arguments } }
	 * @param object args_obj  Parsed and normalized arguments
	 * @param object indicator Chat render indicator handle
	 * @return object { role:'tool', tool_call_id, content }
	 */
	async _dispatch_tool(tool_call, args_obj, indicator) {

		const name = tool_call.function.name

		// Client tools
		if (name.indexOf('client_') === 0) {
			const client_tool = this._client_tools.find(function(t) { return t.name === name })
			if (!client_tool || typeof client_tool.run !== 'function') {
				this._chat_render.update_tool_call(indicator, 'error', 'Unknown client tool')
				return { role:'tool', tool_call_id: tool_call.id, content: 'Unknown client tool: ' + name }
			}
			try {
				const result = await client_tool.run(this._client_context, args_obj || {}, this)
				const content = ai_assistant._stringify_tool_result(result)
				this._chat_render.update_tool_call(indicator, 'done', result)
				return { role:'tool', tool_call_id: tool_call.id, content }
			} catch (err) {
				this._chat_render.update_tool_call(indicator, 'error', err.message)
				return { role:'tool', tool_call_id: tool_call.id, content: 'Error: ' + err.message }
			}
		}

		// MCP tools
		try {
			const tool_result = await this._mcp_client.tools_call(name, args_obj)
			const content = ai_assistant._extract_tool_result(tool_result, name)
			this._chat_render.update_tool_call(indicator, 'done', tool_result)
			return { role:'tool', tool_call_id: tool_call.id, content }
		} catch (err) {
			this._chat_render.update_tool_call(indicator, 'error', err.message)
			return { role:'tool', tool_call_id: tool_call.id, content: 'Error: ' + err.message }
		}
	}//end _dispatch_tool



	/**
	 * _STRINGIFY_TOOL_RESULT
	 * Coerce any client-tool result into a model-friendly string and cap its
	 * size so a single tool call cannot blow the KV cache.
	 * @param any value
	 * @return string
	 */
	static _stringify_tool_result(value) {

		let text
		if (value === null || value === undefined) {
			text = '(not found)'
		} else if (typeof value === 'string') {
			text = value
		} else {
			try { text = JSON.stringify(value) } catch(e) { text = String(value) }
		}
		if (text.length > MAX_TOOL_RESULT_BYTES) {
			text = text.substring(0, MAX_TOOL_RESULT_BYTES) + '…[truncated]'
		}
		return text
	}//end _stringify_tool_result



	/**
	* _EXTRACT_TOOL_RESULT
	* MCP proxy responses wrap the real payload in {result:{content:[{type:'text',text:'...'}]}}.
	* This extracts the inner text, strips noisy wrapper fields, and produces
	* tool-specific compact summaries that stay under the token budget.
	* @param object tool_result Raw MCP tool result
	* @param string tool_name Tool name (e.g. 'dedalo_describe_section')
	* @return string
	*/
	static _extract_tool_result(tool_result, tool_name) {

		if (!tool_result || typeof tool_result !== 'object') {
			return String(tool_result || '')
		}

		// Dig into the MCP proxy wrapper. Two possible formats:
		//   1. Direct MCP: tool_result.result = { content: [{ type:'text', text:'...' }] }
		//   2. PHP proxy:  tool_result = { result:true, data:{ result:{ content: [...] } } }
		let payload = tool_result
		if (tool_result.result && typeof tool_result.result === 'object') {
			// Format 1: result is the MCP response object
			const content = tool_result.result.content
			if (Array.isArray(content) && content.length > 0 && content[0].text) {
				try {
					payload = JSON.parse(content[0].text)
				} catch(e) {
					payload = content[0].text
				}
			} else {
				payload = tool_result.result
			}
		} else if (tool_result.data && tool_result.data.result && typeof tool_result.data.result === 'object') {
			// Format 2: PHP proxy wrapper with boolean result
			const proxy_result = tool_result.data.result
			if (proxy_result.isError) {
				const err_text = (Array.isArray(proxy_result.content) && proxy_result.content[0])
					? proxy_result.content[0].text
					: 'Unknown MCP error'
				return 'MCP error: ' + err_text
			}
			const content = proxy_result.content
			if (Array.isArray(content) && content.length > 0 && content[0].text) {
				try {
					payload = JSON.parse(content[0].text)
				} catch(e) {
					payload = content[0].text
				}
			}
		}

		// Normalize: payload may be the parsed object or a raw string
		let data = payload
		if (typeof payload === 'string') {
			try { data = JSON.parse(payload) } catch(e) { data = payload }
		}
		if (!data || typeof data !== 'object') {
			return String(data).substring(0, 800)
		}

		// Strip wrapper noise
		delete data.csrf_token
		delete data.debug
		delete data.dedalo_last_error
		const inner = (data.data && typeof data.data === 'object' && data.data.result !== undefined)
			? data.data.result
			: data.result !== undefined ? data.result : data

		// Tool-specific compact summaries
		tool_name = tool_name || ''
		if (tool_name.indexOf('describe_section') !== -1 && inner && inner.fields) {
			const fields = Array.isArray(inner.fields) ? inner.fields : []
			const lines = fields.slice(0, 40).map(function(f) {
				return f.label + ' (' + f.type + ')'
			})
			return 'Section: ' + (inner.section_label || inner.section_tipo || '') + '. Fields: ' + lines.join(', ')
		}
		if (tool_name.indexOf('get_record') !== -1 && inner && typeof inner === 'object') {
			const fields = (inner.fields && typeof inner.fields === 'object') ? inner.fields : inner
			const pairs = Object.keys(fields).slice(0, 20).map(function(k) {
				const val = fields[k]
				const str = Array.isArray(val) ? val.map(function(v) { return v.label || v.ref || JSON.stringify(v) }).join(', ')
					: String(val)
				return k + ': ' + str.substring(0, 80)
			})
			return (inner.section_label || '') + ' #' + (inner.section_id || '') + ' — ' + pairs.join(' | ')
		}
		if (tool_name.indexOf('search_records_view') !== -1) {
			let records = null
			let count = null
			if (Array.isArray(inner)) {
				records = inner
				count = inner.length
			} else if (inner && typeof inner === 'object') {
				if (Array.isArray(inner.records)) {
					records = inner.records
					const pagination_total = (inner.pagination && typeof inner.pagination === 'object')
						? inner.pagination.total
						: undefined
					count = (pagination_total !== undefined) ? pagination_total : inner.records.length
				} else if (inner.total !== undefined || inner.count !== undefined) {
					count = (inner.total !== undefined) ? inner.total : inner.count
				}
			}
			if (count !== null) {
				const preview = records
					? records.slice(0, 3).map(function(r, i) {
						return '#' + (i + 1) + ': ' + JSON.stringify(r).substring(0, 120)
					}).join(' | ')
					: ''
				return 'Found ' + count + ' records. ' + preview
			}
		}
		if (tool_name.indexOf('count_records') !== -1 && inner && typeof inner === 'object') {
			const total = (inner.total !== undefined) ? inner.total : null
			if (total !== null) {
				return 'Total: ' + total + ' records in ' + (inner.section_label || inner.section_tipo || 'section') + '.'
			}
		}
		if (tool_name.indexOf('set_field') !== -1 && inner && typeof inner === 'object') {
			return 'Updated. ' + JSON.stringify(inner).substring(0, 600)
		}
		if (tool_name.indexOf('get_media_url') !== -1 && inner && typeof inner === 'object') {
			const parts = ['get_media_url result:']
			if (inner.file_exist && inner.url) {
				parts.push('url=' + inner.url)
			} else {
				parts.push('file_exist=false section=' + (inner.section_tipo||'') + '#' + (inner.section_id||'') + ' component=' + (inner.component_tipo||'') + ' quality=' + (inner.quality||'?'))
			}
			return parts.join(' ')
		}

		// Fallback: compact JSON, no mid-string truncation
		const json = JSON.stringify(inner)
		if (json.length <= 1500) return json
		// If too long, return a summary instead of broken JSON
		const keys = Object.keys(inner).slice(0, 10)
		return 'Keys: ' + keys.join(', ') + '. ' + json.substring(0, 1200) + '...[truncated]'
	}//end _extract_tool_result



	/**
	* _EXTRACT_TOOL_INNER
	* Same unwrapping logic as _extract_tool_result but returns the raw inner
	* object (parsed JSON) instead of a compact string. Useful for batch
	* pipelines that need to iterate over records or inspect fields.
	* @param object tool_result Raw MCP tool result
	* @return object|null
	*/
	static _extract_tool_inner(tool_result) {

		if (!tool_result || typeof tool_result !== 'object') {
			return null
		}

		// Same unwrapping logic as _extract_tool_result (format 1 and 2)
		let payload = tool_result
		if (tool_result.result && typeof tool_result.result === 'object') {
			const content = tool_result.result.content
			if (Array.isArray(content) && content.length > 0 && content[0].text) {
				try {
					payload = JSON.parse(content[0].text)
				} catch(e) {
					payload = content[0].text
				}
			} else {
				payload = tool_result.result
			}
		} else if (tool_result.data && tool_result.data.result && typeof tool_result.data.result === 'object') {
			const content = tool_result.data.result.content
			if (Array.isArray(content) && content.length > 0 && content[0].text) {
				try {
					payload = JSON.parse(content[0].text)
				} catch(e) {
					payload = content[0].text
				}
			}
		}

		let data = payload
		if (typeof payload === 'string') {
			try { data = JSON.parse(payload) } catch(e) { data = payload }
		}
		if (!data || typeof data !== 'object') {
			return null
		}

		const inner = (data.data && typeof data.data === 'object' && data.data.result !== undefined)
			? data.data.result
			: data.result !== undefined ? data.result : data

		return (inner && typeof inner === 'object') ? inner : null
	}//end _extract_tool_inner



	/**
	* _NORMALIZE_TOOL_ARGS
	* Fix common LLM output mismatches before sending to MCP.
	* Maps ISO-style language codes (e.g. "en", "es") to Dédalo lg-xxx form.
	* @param string tool_name
	* @param object args
	* @return object
	*/
	static _normalize_tool_args(tool_name, args) {
		if (!args || typeof args !== 'object') return args
		const out = Object.assign({}, args)
		if (typeof out.lang === 'string') {
			const v = out.lang.trim().toLowerCase()
			if (!v.startsWith('lg-')) {
				const iso2to3 = {
					'en': 'eng', 'es': 'spa', 'fr': 'fra', 'de': 'deu',
					'it': 'ita', 'pt': 'por', 'ca': 'cat', 'gl': 'glg',
					'eu': 'eus', 'nl': 'nld', 'ru': 'rus', 'ja': 'jpn',
					'zh': 'zho', 'ar': 'ara', 'hi': 'hin', 'ko': 'kor'
				}
				const code = iso2to3[v] || v
				out.lang = 'lg-' + code
			}
		}
		return out
	}//end _normalize_tool_args



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
	/**
	* _MINIMIZE_SCHEMA
	* Shrinks a JSON schema for tool declarations.
	* Keeps parameter names, types, and required at the top level.
	* Nested objects also preserve their property names + types so the
	* LLM can construct valid filters and sub-objects.
	* Descriptions, enums, and item schemas beyond one nesting level are dropped.
	* @param object schema
	* @param number depth current nesting depth (0 = top level)
	* @return object
	*/
	static _minimize_schema(schema, depth) {

		if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
			return { type: 'string' }
		}

		const max_depth = 2
		const allowed_types = ['string', 'number', 'integer', 'boolean', 'object', 'array']
		let t = (typeof schema.type === 'string' && allowed_types.indexOf(schema.type) !== -1)
			? schema.type
			: (schema.properties ? 'object' : (schema.items ? 'array' : 'string'))

		const out = { type: t }

		if (depth === 0 && Array.isArray(schema.required) && schema.required.length > 0) {
			out.required = schema.required.filter(function(r) { return typeof r === 'string' })
		}

		if (t === 'object' && depth < max_depth && schema.properties && typeof schema.properties === 'object') {
			out.properties = {}
			const keys = Object.keys(schema.properties)
			for (let i = 0; i < keys.length; i++) {
				out.properties[keys[i]] = ai_assistant._minimize_schema(schema.properties[keys[i]], depth + 1)
			}
		}

		if (t === 'array' && depth < max_depth && schema.items && typeof schema.items === 'object') {
			out.items = ai_assistant._minimize_schema(schema.items, depth + 1)
		}

		return out
	}//end _minimize_schema


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



	/**
	* _NORMALIZE_MESSAGES_FOR_MODEL
	* Converts tool_call function arguments from JSON strings to objects.
	* The Qwen3.5 chat template applies |items to tool_call.arguments,
	* expecting a dict — a JSON string causes "Unknown StringValue filter: items".
	* This must be called before passing messages to apply_chat_template.
	* @param array messages
	* @return array Normalized messages (shallow copy where needed)
	*/
	static _normalize_messages_for_model(messages) {

		return messages.map(function(msg) {
			if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
				const patched_calls = msg.tool_calls.map(function(tc) {
					if (tc.function && typeof tc.function.arguments === 'string') {
						try {
							return Object.assign({}, tc, {
								function: Object.assign({}, tc.function, {
									arguments: JSON.parse(tc.function.arguments)
								})
							})
						} catch(e) {
							return tc
						}
					}
					return tc
				})
				return Object.assign({}, msg, { tool_calls: patched_calls })
			}
			return msg
		})
	}//end _normalize_messages_for_model



	/**
	* _GENERATE_WITH_API
	* Streams generation through a generic OpenAI-compatible HTTP API.
	* Works with any endpoint that follows the /v1/chat/completions streaming
	* protocol: Ollama, OpenAI, vLLM, localAI, etc.
	*
	* @param array messages OpenAI-format message list
	* @param array tools Tool declarations in OpenAI format
	* @param number max_new_tokens
	* @param function on_token Stream callback for text tokens
	* @param function on_think_token Stream callback for thinking tokens (delta.reasoning / delta.reasoning_content)
	* @param AbortSignal signal
	* @return object {full_text, streamed_text, raw_result}
	*/
	async _generate_with_api(messages, tools, max_new_tokens, on_token, on_think_token, signal) {

		const url = this._config.api_url
		if (!url) {
			throw new Error('api_url not configured')
		}

		const api_key = this._config.api_key || null
		const model = this._config.api_model || 'default'

		const body = {
			model		: model,
			messages	: messages,
			stream		: true,
			max_tokens	: max_new_tokens,
			temperature	: 0.7
		}
		if (this._config.thinking && this._config.thinking !== 'none') {
			body.thinking = this._config.thinking
		}
		if (tools && tools.length > 0) {
			body.tools = tools
		}

		const headers = {
			'Content-Type': 'application/json'
		}
		if (api_key) {
			headers['Authorization'] = 'Bearer ' + api_key
		}

		const response = await fetch(url, {
			method	: 'POST',
			headers	: headers,
			body	: JSON.stringify(body),
			signal	: signal
		})

		if (!response.ok) {
			const text = await response.text().catch(function() { return '' })
			throw new Error('API HTTP ' + response.status + ': ' + text.substring(0, 500))
		}

		const reader	= response.body.getReader()
		const decoder	= new TextDecoder()
		let text		= ''
		let buffer		= ''
		const tool_calls_acc = []
		let done		= false

		while (!done) {
			const read_result = await reader.read()
			if (read_result.done) break
			buffer += decoder.decode(read_result.value, { stream: true })

			// SSE events are separated by double-newline
			const events = buffer.split('\n\n')
			buffer = events.pop() || ''

			for (let e = 0; e < events.length; e++) {
				const lines = events[e].split('\n')
				for (let l = 0; l < lines.length; l++) {
					const line = lines[l]
					if (!line.startsWith('data: ')) continue
					const data = line.substring(6).trim()
					if (data === '[DONE]') {
						done = true
						break
					}
					if (!data) continue

					try {
						const chunk = JSON.parse(data)
						
						const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
						if (!delta) continue

						if (delta.content) {
							text += delta.content
							on_token(delta.content)
						}

						if (delta.tool_calls) {
							for (let i = 0; i < delta.tool_calls.length; i++) {
								const tc = delta.tool_calls[i]
								const idx = tc.index !== undefined ? tc.index : i
								if (!tool_calls_acc[idx]) {
									tool_calls_acc[idx] = {
										id		: tc.id || ('call_' + idx),
										type	: 'function',
										function: { name: '', arguments: '' }
									}
								}
								if (tc.function) {
									if (tc.function.name) {
										tool_calls_acc[idx].function.name += tc.function.name
									}
									if (tc.function.arguments !== undefined) {
										tool_calls_acc[idx].function.arguments += tc.function.arguments
									}
								}
							}
						}

						if (delta.reasoning) {
							on_think_token(delta.reasoning)
						} else if (delta.reasoning_content) {
							on_think_token(delta.reasoning_content)
						}
					} catch (parse_err) {
						// malformed SSE chunk, skip
					}
				}
			}
		}

		const tool_calls = tool_calls_acc
			.filter(function(tc) { return tc && tc.function.name })
			.map(function(tc) {
				return {
					id		: tc.id,
					type	: tc.type,
					function: {
						name		: tc.function.name,
						arguments	: tc.function.arguments
					}
				}
			})

		// raw_result shape compatible with model_engine.parse_tool_calls path (1)
		const raw_result = {
			generated_text: [{
				role		: 'assistant',
				content		: text,
				tool_calls	: tool_calls.length > 0 ? tool_calls : undefined
			}]
		}

		return {
			full_text	: text,
			streamed_text: text,
			raw_result	: raw_result
		}
	}//end _generate_with_api



	/**
	* ANALYZE_IMAGE_URL
	* Sends a single-turn multimodal request to the configured vision API.
	* Works with any OpenAI-compatible endpoint that supports image_url content.
	* @param string url     Public image URL
	* @param string prompt  Instruction for the vision model
	* @return string
	*/
	async analyze_image_url(url, prompt) {

		if (!url || typeof url !== 'string') {
			throw new Error('Missing image URL')
		}
		if (!this._config.api_url) {
			throw new Error('No vision endpoint configured. Select a vision-capable server model with api_url.')
		}

		// Fetch image and convert to base64 (some APIs don't support image_url)
		const image_resp = await fetch(url)
		if (!image_resp.ok) {
			throw new Error('Failed to fetch image: ' + image_resp.status)
		}
		const image_blob = await image_resp.blob()
		const image_b64 = await new Promise(function(resolve, reject) {
			const reader = new FileReader()
			reader.onloadend = function() { resolve(reader.result) }
			reader.onerror = reject
			reader.readAsDataURL(image_blob)
		})

		const messages = [{
			role	: 'user',
			content	: [
				{ type: 'text', text: prompt || 'Describe this image.' },
				{
					type	: 'image_url',
					image_url: { url: image_b64 }
				}
			]
		}]

		const max_tokens = this._config.vision_max_new_tokens || this._config.max_new_tokens || 512

		const result = await this._generate_with_api(
			messages,
			[], // no tools
			max_tokens,
			function() {}, // no-op streaming
			function() {}, // no-op thinking
			this._abort_controller ? this._abort_controller.signal : null
		)

		return result.full_text || ''
	}//end analyze_image_url



	/**
	* _RESOLVE_FIELD_TIPO_BY_LABEL
	* Matches a human-written field label against the array returned by
	* dedalo_describe_section. Uses the same normalization as ontology
	* resolution so "Stamp" matches "stamp" or "estampa".
	* @param array fields  Array of { tipo, label, type } from describe_section
	* @param string label  Human label to match
	* @return string|null
	*/
	_resolve_field_tipo_by_label(fields, label) {

		if (!Array.isArray(fields) || !label || typeof label !== 'string') {
			return null
		}
		const normalized = ai_assistant._normalize_label(label)
		if (!normalized) return null

		// exact match
		for (let i = 0; i < fields.length; i++) {
			const f = fields[i]
			if (!f || !f.tipo) continue
			const candidates = ai_assistant._extract_term_labels(f.label || f.tipo)
			for (let j = 0; j < candidates.length; j++) {
				if (ai_assistant._normalize_label(candidates[j]) === normalized) {
					return f.tipo
				}
			}
		}

		// partial match
		for (let i = 0; i < fields.length; i++) {
			const f = fields[i]
			if (!f || !f.tipo) continue
			const candidates = ai_assistant._extract_term_labels(f.label || f.tipo)
			for (let j = 0; j < candidates.length; j++) {
				const n = ai_assistant._normalize_label(candidates[j])
				if (n.indexOf(normalized) !== -1 || normalized.indexOf(n) !== -1) {
					return f.tipo
				}
			}
		}

		return null
	}//end _resolve_field_tipo_by_label



	/**
	* RUN_BULK_IMAGE_TRANSCRIBE
	* Batch pipeline: enumerate records from the active SQO, read each image,
	* call the vision model, and write the result into a target text field.
	* Asks for ONE batch confirmation before any writes. Emits progress
	* messages in the chat UI.
	* @param object ctx   client_context instance
	* @param object args  { prompt, image_field, target_field, max_records, page_size }
	* @return string
	*/
	async run_bulk_image_transcribe(ctx, args) {

		const prompt		= args.prompt
		const image_field	= args.image_field
		const target_field	= args.target_field
		const max_records	= args.max_records
		const page_size		= Math.min(args.page_size || 25, 50)

		// 1. Active SQO
		const sqo_info = ctx.get_active_sqo()
		if (!sqo_info) {
			return 'No active search. Open a section list and optionally apply filters first.'
		}

		const section_tipo	= sqo_info.section_tipo
		const total			= sqo_info.total || 0

		// 2. Resolve tipos via describe_section
		let fields = null
		try {
			const desc_result = await this._mcp_client.tools_call('dedalo_describe_section', {
				section_tipo: section_tipo
			})
			const inner = ai_assistant._extract_tool_inner(desc_result)
			fields = (inner && Array.isArray(inner.fields)) ? inner.fields : null
		} catch (e) {
			console.error('[ai_assistant] describe_section failed:', e)
		}

		if (!fields) {
			return 'Could not resolve section structure. Try again or check the section.'
		}

		const image_tipo = this._resolve_field_tipo_by_label(fields, image_field)
		const target_tipo = this._resolve_field_tipo_by_label(fields, target_field)

		if (!image_tipo) {
			return 'Image field "' + image_field + '" not found in section ' + section_tipo + '.'
		}
		if (!target_tipo) {
			return 'Target field "' + target_field + '" not found in section ' + section_tipo + '.'
		}

		// 3. Safety cap
		const limit = Math.min(
			(max_records !== undefined && max_records !== null) ? max_records : total,
			total,
			500
		)
		if (limit <= 0) {
			return 'No records to process (total=' + total + ').'
		}

		// 4. Batch confirmation
		const confirmed = await this._chat_render.confirm_action(
			t('bulk_confirm', 'Batch-process {n} records? Image: {img} → Target: {tgt}')
				.replace('{n}', limit)
				.replace('{img}', image_field)
				.replace('{tgt}', target_field)
		)
		if (!confirmed) {
			return 'Bulk transcription cancelled.'
		}

		// 5. Set bulk approval to bypass per-record confirms in the main loop
		this._bulk_approval = {
			section_tipo	: section_tipo,
			target_tipo		: target_tipo,
			expires_at		: Date.now() + 10 * 60 * 1000 // 10 min
		}

		// 6. Paginate and process
		const sqo = sqo_info.sqo
		sqo.limit = page_size
		sqo.offset = 0

		const results = []
		let processed = 0
		let failures = 0

		try {
			while (processed < limit) {
				const remaining = limit - processed
				if (sqo.limit > remaining) {
					sqo.limit = remaining
				}

				let records = null
				try {
					const search_result = await this._mcp_client.tools_call('dedalo_search_records_view', {
						section_tipo	: section_tipo,
						sqo				: sqo
					})
					const search_inner = ai_assistant._extract_tool_inner(search_result)
					if (Array.isArray(search_inner)) {
						records = search_inner
					} else if (search_inner && Array.isArray(search_inner.records)) {
						records = search_inner.records
					} else {
						records = []
					}
				} catch (e) {
					console.error('[ai_assistant] search failed at offset', sqo.offset, e)
					break
				}

				if (!records || records.length === 0) {
					break
				}

				for (let i = 0; i < records.length; i++) {
					if (processed >= limit) {
						break
					}

					const record = records[i]
					const section_id = (record && (record.section_id !== undefined ? record.section_id : record.id))
					if (section_id === undefined || section_id === null) {
						failures++
						continue
					}

					// Get media URL
					let media_url = null
					try {
						const media_result = await this._mcp_client.tools_call('dedalo_get_media_url', {
							section_tipo	: section_tipo,
							section_id		: section_id,
							component_tipo	: image_tipo
						})
						const media_inner = ai_assistant._extract_tool_inner(media_result)
						media_url = (media_inner && media_inner.url) ? media_inner.url : null
					} catch (e) {
						console.error('[ai_assistant] get_media_url failed for', section_id, e)
					}

					if (!media_url) {
						results.push({ section_id: section_id, status: 'no_image' })
						processed++
						continue
					}

					// Analyze
					let analysis = ''
					try {
						analysis = await this.analyze_image_url(media_url, prompt)
					} catch (e) {
						if (e.name === 'AbortError') throw e
						console.error('[ai_assistant] vision failed for', section_id, e)
						analysis = ''
					}

					if (!analysis || !analysis.trim()) {
						results.push({ section_id: section_id, status: 'empty_analysis' })
						processed++
						continue
					}

					// Write
					try {
						await this._mcp_client.tools_call('dedalo_set_field', {
							section_tipo	: section_tipo,
							section_id		: section_id,
							component_tipo	: target_tipo,
							value			: analysis
						})
						results.push({ section_id: section_id, status: 'ok' })
					} catch (e) {
						console.error('[ai_assistant] set_field failed for', section_id, e)
						results.push({ section_id: section_id, status: 'write_error' })
						failures++
					}

					processed++

					// Progress update every 5 records or on the first
					if (processed % 5 === 0 || processed === 1) {
						this._chat_render.add_system_message(
							t('bulk_progress', 'Bulk progress: {p}/{n} completed.')
								.replace('{p}', processed)
								.replace('{n}', limit)
						)
					}
				}

				sqo.offset += page_size
			}
		} finally {
			this._bulk_approval = null
		}

		const ok_count = results.filter(function(r) { return r.status === 'ok' }).length
		return 'Bulk transcription finished. ' + ok_count + ' of ' + processed + ' records updated' +
			(failures > 0 ? ' (' + failures + ' failures).' : '.')
	}//end run_bulk_image_transcribe



	async _handle_user_message(message) {

		const self = this

		if (this._is_generating || this._model_loading) return

		// guard: model must be loaded (after a failed load the engine is still unloaded)
		if (!this._model_engine.is_loaded()) {
			this._chat_render.add_system_message(t('model_not_ready', 'Model not loaded. Please wait or change settings.'))
			return
		}

		this._abort_controller = new AbortController()

		this._conversation.push({
			role	: 'user',
			content	: message
		})

		this._chat_render.add_user_message(message)
		this._chat_render.hide_input()

		this._is_generating = true
		this._persist()

		const max_iterations	= 20
		let iteration			= 0

		const ontology_context = await self._build_ontology_context_for_message(message)
		const tools				= self._build_tools_for_model()

		try {
			while (iteration < max_iterations) {
				iteration++

				if (self._abort_controller && self._abort_controller.signal.aborted) {
					throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
				}

				// Allow tools on the first MAX_TOOL_TURNS iterations to enable
				// describe_section → search → get_record → answer chains, then
				// force an answer-only turn.
				const tools_for_this_turn = iteration <= MAX_TOOL_TURNS && tools.length > 0
					? tools
					: []
				const tools_enabled = tools_for_this_turn.length > 0
				const system_prompt = self._build_system_prompt(tools_enabled)
					+ (ontology_context ? '\n\n' + ontology_context : '')

				// Truncate conversation to last 50 messages to prevent KV cache from
				// growing unbounded with large tool results. 50 messages ≈ 20+
				// tool-answer pairs which supports full multi-hop relation workflows.
				const trimmed_conversation = self._conversation.slice(-50)

				const raw_messages = [
					{ role: 'system', content: system_prompt },
					...trimmed_conversation
				]

				// On answer-only turns, append an explicit instruction so the model
				// knows its task is to answer, not to call more tools.
				if (!tools_enabled) {
					raw_messages.push({
						role	: 'user',
						content	: 'Please answer my previous question based on the tool result provided above. Do not call any tools.'
					})
				}

				let stream_started = false
				const stream_callback = (token_text) => {
					if (!stream_started) {
						stream_started = true
						self._chat_render.start_assistant_message()
					}
					self._chat_render.append_token(token_text)
				}

				const think_stream_callback = (token_text) => {
					self._chat_render.append_thinking_token(token_text)
				}

				// Tool-calling turns may need more tokens for complex reasoning;
				// answer-only turns use the same limit to allow long outputs (e.g. translations).
				const max_new_tokens = self._config.max_new_tokens || 512

				// Branch: use external API when a server model is configured;
				// otherwise use the local WebGPU/WASM model.
				// When api_url is present ALL turns go through the API; selecting a
				// local model keeps chat on-device as before.
				const use_api = !!self._config.api_url
				const generation_result = use_api
					? await self._generate_with_api(
						raw_messages,
						tools_for_this_turn,
						max_new_tokens,
						stream_callback,
						think_stream_callback,
						self._abort_controller.signal
					)
					: await self._model_engine.generate({
						messages		: ai_assistant._normalize_messages_for_model(raw_messages),
						tools			: tools_for_this_turn,
						max_new_tokens	: max_new_tokens,
						signal			: self._abort_controller.signal,
						on_token		: stream_callback,
						on_think_token	: think_stream_callback
					})

				// Only parse tool calls when tools were declared for this turn.
				// On iteration 2+ tools are cleared; any 'call:...' text the model
				// produces must be treated as regular text, not a tool call.
				const tool_calls = tools_for_this_turn.length > 0
					? self._model_engine.parse_tool_calls(generation_result)
					: []

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

						args_obj = ai_assistant._normalize_tool_args(tool_call.function.name, args_obj)

						const indicator = self._chat_render.add_tool_call(
							tool_call.function.name, 'calling', args_obj, null
						)

						// Destructive MCP tools require explicit confirmation.
						if (DESTRUCTIVE_TOOLS.indexOf(tool_call.function.name) >= 0) {
							let confirmed = false
							if (self._bulk_approval && self._bulk_approval.expires_at > Date.now()) {
								const args_section = args_obj && args_obj.section_tipo ? args_obj.section_tipo : null
								const args_target = args_obj && args_obj.component_tipo ? args_obj.component_tipo : null
								if (args_section === self._bulk_approval.section_tipo &&
									(!self._bulk_approval.target_tipo || args_target === self._bulk_approval.target_tipo)) {
									confirmed = true
								}
							}
							if (!confirmed) {
								confirmed = await self._chat_render.confirm_action(
									t('confirm_action', 'Confirm action') + ': ' + tool_call.function.name
								)
							}
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

						const tool_msg = await self._dispatch_tool(tool_call, args_obj, indicator)
						self._conversation.push(tool_msg)
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



	async _build_ontology_context_for_message(message) {

		try {
			const glossary = await this._get_ontology_glossary()
			const mentions = this._resolve_ontology_mentions(message, glossary)
			if (!mentions.length) return null

			const resolved = []
			const ambiguous = []
			const resolved_sections = []

			for (const mention of mentions) {
				if (mention.matches.length === 1) {
					const match = mention.matches[0]
					resolved.push('"' + mention.label + '" => section_tipo "' + match.section_tipo + '" (' + match.label + ')')
					resolved_sections.push(match.section_tipo)
				} else if (mention.matches.length > 1) {
					ambiguous.push('"' + mention.label + '": ' + mention.matches.slice(0, 5).map(function(item) {
						return item.label + ' => ' + item.section_tipo
					}).join('; '))
				}
			}

			const parts = []
			if (resolved.length) {
				parts.push('Resolved: ' + resolved.join('; '))
			}
			if (ambiguous.length) {
				parts.push('Ambiguous: ' + ambiguous.join('; '))
			}

			// Fetch field-level structure for up to 2 resolved sections
			// to expose portal targets and field labels
			if (resolved_sections.length > 0) {
				const unique = resolved_sections.filter(function(s, i) {
					return resolved_sections.indexOf(s) === i
				}).slice(0, 2)

				const field_parts = []
				for (const section_tipo of unique) {
					try {
						const desc_result = await this._mcp_client.tools_call('dedalo_describe_section', {
							section_tipo: section_tipo,
							include_tipos: false
						})
						const inner = ai_assistant._extract_tool_inner(desc_result)
						if (inner && Array.isArray(inner.fields)) {
							const lines = inner.fields.slice(0, 15).map(function(f) {
								const target = f.target ? ' portal→' + (f.target.section_label || f.target.tipo || '?') : ''
								return f.label + ' (' + f.type + target + ')'
							})
							field_parts.push(inner.section_label + ' fields: ' + lines.join(', '))
						}
					} catch (e) {
						// skip section detail on failure
					}
				}
				if (field_parts.length) {
					parts.push('  ' + field_parts.join('.\n  '))
				}
			}

			return parts.length ? parts.join('. ') + '.' : null
		} catch (err) {
			console.warn('[ai_assistant] ontology pre-resolution failed:', err)
			return 'Ontology pre-resolution failed: ' + err.message + '. Use `dedalo_ontology_glossary` or `dedalo_resolve_ontology` before any data tool.'
		}
	}//end _build_ontology_context_for_message



	_resolve_ontology_mentions(message, glossary) {

		if (!message || typeof message !== 'string') return []

		if (!this._ontology_index) {
			this._ontology_index = this._build_ontology_index(glossary || [])
		}

		const text = ai_assistant._normalize_label(message)
		if (!text) return []

		const mentions = []
		const occupied = []
		const labels = Array.from(this._ontology_index.keys())
			.filter(function(label) {
				return label.length >= 3
			})
			.sort(function(a, b) {
				return b.length - a.length
			})

		for (const label of labels) {
			const index = ai_assistant._find_label_in_text(text, label)
			if (index === -1) continue

			const end = index + label.length
			const overlaps = occupied.some(function(range) {
				return index < range.end && end > range.start
			})
			if (overlaps) continue

			const matches = this._unique_matches(this._ontology_index.get(label) || [])
			if (!matches.length) continue

			mentions.push({
				label	: label,
				matches	: matches
			})
			occupied.push({
				start	: index,
				end		: end
			})

			if (mentions.length >= 8) {
				break
			}
		}

		return mentions
	}//end _resolve_ontology_mentions



	static _find_label_in_text(text, label) {

		let index = text.indexOf(label)

		while (index !== -1) {
			const before = index === 0 ? ' ' : text.charAt(index - 1)
			const after_index = index + label.length
			const after = after_index >= text.length ? ' ' : text.charAt(after_index)

			if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
				return index
			}

			index = text.indexOf(label, index + 1)
		}

		return -1
	}//end _find_label_in_text



	async _get_ontology_glossary() {

		if (this._ontology_glossary) return this._ontology_glossary
		if (this._ontology_loading) return await this._ontology_loading

		this._ontology_loading = this._mcp_client.tools_call('dedalo_ontology_glossary', {
			mode: 'sections'
		}).then((tool_result) => {
			const structured = this._extract_tool_structured_content(tool_result)
			const data = structured && structured.data ? structured.data : structured
			const result = data && data.result ? data.result : data
			this._ontology_glossary = Array.isArray(result) ? result : []
			this._ontology_index = this._build_ontology_index(this._ontology_glossary)
			this._ontology_loading = null
			return this._ontology_glossary
		}).catch((err) => {
			this._ontology_loading = null
			throw err
		})

		return await this._ontology_loading
	}//end _get_ontology_glossary



	_extract_tool_structured_content(tool_result) {

		const result = tool_result
			&& tool_result.data
			&& tool_result.data.result
			? tool_result.data.result
			: null

		if (result && result.structuredContent) {
			return result.structuredContent
		}

		const content = result && Array.isArray(result.content)
			? result.content
			: null

		if (content && content[0] && typeof content[0].text === 'string') {
			try {
				return JSON.parse(content[0].text)
			} catch(e) {}
		}

		return null
	}//end _extract_tool_structured_content



	_build_ontology_index(glossary) {

		const index = new Map()

		for (const section of glossary) {
			if (!section || !section.section_tipo) continue
			const labels = ai_assistant._extract_term_labels(section.term)
			for (const label of labels) {
				const key = ai_assistant._normalize_label(label)
				if (!key) continue
				if (!index.has(key)) index.set(key, [])
				index.get(key).push({
					section_tipo	: section.section_tipo,
					label			: label
				})
			}
		}

		return index
	}//end _build_ontology_index



	_match_section_label(label, glossary) {

		if (!this._ontology_index) {
			this._ontology_index = this._build_ontology_index(glossary || [])
		}

		const key = ai_assistant._normalize_label(label)
		if (!key) return []

		const exact = this._ontology_index.get(key)
		if (exact && exact.length) return this._unique_matches(exact)

		const singular = key.endsWith('s') ? key.substring(0, key.length - 1) : null
		if (singular) {
			const singular_matches = this._ontology_index.get(singular)
			if (singular_matches && singular_matches.length) return this._unique_matches(singular_matches)
		}

		const matches = []
		this._ontology_index.forEach(function(items, item_key) {
			if (item_key.indexOf(key) !== -1 || key.indexOf(item_key) !== -1) {
				matches.push(...items)
			}
		})

		return this._unique_matches(matches)
	}//end _match_section_label



	_unique_matches(matches) {

		const seen = new Set()
		const unique = []

		for (const item of matches) {
			if (!item || !item.section_tipo || seen.has(item.section_tipo)) continue
			seen.add(item.section_tipo)
			unique.push(item)
		}

		return unique
	}//end _unique_matches



	static _extract_term_labels(term) {

		const labels = []

		if (typeof term === 'string') {
			labels.push(term)
		} else if (Array.isArray(term)) {
			for (const item of term) {
				labels.push(...ai_assistant._extract_term_labels(item))
			}
		} else if (term && typeof term === 'object') {
			const values = Object.values(term)
			for (const value of values) {
				labels.push(...ai_assistant._extract_term_labels(value))
			}
		}

		return labels.filter(function(label) {
			return typeof label === 'string' && label.trim().length > 0
		})
	}//end _extract_term_labels



	static _normalize_label(label) {

		return String(label || '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[_\-]+/g, ' ')
			.replace(/[^a-z0-9 ]+/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	}//end _normalize_label



	_persist() {
		if (!this._thread_id) return
		this._store.save(this._thread_id, this._conversation)
	}//end _persist



	_new_conversation() {
		if (this._is_generating) {
			this._abort_generation()
		}
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
		this._client_context.destroy()
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
