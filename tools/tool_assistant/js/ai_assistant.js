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



/**
 * AI_ASSISTANT
 * Orchestrates the full conversational AI loop for the Dédalo assistant tool:
 * browser-side LLM (via model_engine / Transformers.js) or server-side API
 * (OpenAI-compatible streaming endpoint) ↔ MCP proxy tools ↔ client-side
 * instant tools ↔ chat UI (chat_render).
 *
 * Responsibilities:
 * - Boot sequence: MCP handshake + model load, with progress feedback.
 * - Conversation state: push/pop messages in OpenAI chat format, persist to
 *   conversation_store (localStorage), replay on reload.
 * - Agentic loop: iterate generate → parse tool calls → dispatch → repeat
 *   up to MAX_TOOL_TURNS turns, then force an answer-only turn.
 * - Tool routing: client_ prefix → CLIENT_TOOLS (synchronous, no network);
 *   all other names → MCP proxy via mcp_client.tools_call().
 * - Schema normalization: _sanitize_schema + _minimize_schema ensure tool
 *   declarations are safe for both Qwen and Gemma Jinja chat templates.
 * - Ontology pre-resolution: _build_ontology_context_for_message() scans
 *   the user's text, matches section names from the glossary, and injects
 *   section_tipo mappings into the system prompt before the first turn.
 * - Bulk pipelines: run_bulk_image_transcribe() for batch vision→text workflows.
 *
 * Main export: the `ai_assistant` ES6 class. Instantiated once per tool mount
 * by render_tool_assistant.js.
 */



// localStorage key for user model/device preferences persisted across sessions.
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
 * T
 * Localized label helper.
 * Reads from the global get_label map (populated by Dédalo's PHP label
 * injection mechanism). Falls back to the supplied English string when the
 * key is absent or the global is unavailable (e.g. during unit tests).
 * @param {string} key - label key matching a get_label entry
 * @param {string} fallback - English fallback string
 * @returns {string} translated or fallback label
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
 * See module header above for the full contract.
 */
export const ai_assistant = class ai_assistant {


	/**
	 * AI_ASSISTANT constructor
	 * Initializes all sub-system instances and merges user preferences from
	 * localStorage over the tool_config values supplied by the PHP layer.
	 * Does NOT load the model or connect to MCP — that is deferred to
	 * build_chat_ui() so progress can be surfaced in the UI.
	 * @param {Object} options - mount options passed from render_tool_assistant.js
	 * @param {Object} [options.tool_config] - model/API/MCP config from register.json
	 * @param {Object} [options.tool_self] - reference to the parent tool instance
	 */
	constructor(options={}) {

		this._config			= Object.assign({}, options.tool_config || {})
		// Reference to the parent tool instance (tool_assistant class).
		// Used when the assistant needs to interact with tool-level APIs.
		this._tool_self			= options.tool_self || null

		// merge user prefs (from localStorage) over tool defaults
		const prefs = ai_assistant._read_prefs()
		if (prefs.model_id) this._config.model_id = prefs.model_id
		if (prefs.device) this._config.device = prefs.device

		/** @type {client_context} Tracks the active section/record/component in the Dédalo UI. */
		this._client_context	= new client_context()
		/** @type {Array} Registry of client-side tool definitions ({name, description, run()}). */
		this._client_tools		= CLIENT_TOOLS
		/** @type {mcp_client} HTTP proxy client for Dédalo MCP server tools. */
		this._mcp_client		= new mcp_client()
		/** @type {model_engine} Local LLM inference wrapper (Transformers.js / WebGPU). */
		this._model_engine		= new model_engine(this._config)
		/** @type {chat_render} DOM manager for the chat UI. */
		this._chat_render		= new chat_render()
		/** @type {conversation_store} localStorage-backed multi-thread persistence. */
		this._store				= new conversation_store()
		/** @type {Array} Current conversation in OpenAI message format: {role, content, tool_calls?}. */
		this._conversation		= []
		/** @type {Array} Tool declarations fetched from the MCP server via tools/list. */
		this._mcp_tools			= []
		/** @type {boolean} True after the MCP handshake has completed successfully. */
		this._mcp_initialized	= false
		/** @type {boolean} True while the model weights are being downloaded/initialized. */
		this._model_loading		= false
		/** @type {AbortController|null} Controller for the current generation or model load. */
		this._abort_controller	= null
		/** @type {boolean} True while the agentic loop is running (prevents re-entrancy). */
		this._is_generating		= false
		/** @type {Object} Reserved for additional context metadata (currently unused). */
		this._context			= {}
		/** @type {Array|null} Cached ontology glossary array from dedalo_ontology_glossary. */
		this._ontology_glossary	= null
		/** @type {Map|null} Inverted index: normalized label → [{section_tipo, label}]. */
		this._ontology_index		= null
		/** @type {Promise|null} In-flight glossary fetch; prevents duplicate requests. */
		this._ontology_loading	= null
		/** @type {string|null} Active thread ID in the conversation_store. */
		this._thread_id			= null

		// Subscribe to Dédalo UI events so context stays current as the user navigates.
		this._client_context.update_from_events()
	}//end constructor



	/**
	 * BUILD_CHAT_UI
	 * Constructs the chat UI DOM, wires event callbacks, restores the last
	 * active thread from localStorage, and asynchronously completes the MCP
	 * handshake and model load (with progress feedback in the chat).
	 *
	 * Call order: build() → restore thread → MCP initialize → model load.
	 * The method resolves once the DOM is mounted and model load has settled
	 * (either ready or failed). The caller can render the returned node tree
	 * immediately; status messages appear inline in the chat.
	 *
	 * @returns {Promise<HTMLElement>} The root DOM node of the chat UI
	 */
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



	/**
	 * _REPLAY_CONVERSATION
	 * Re-renders the current this._conversation array into the chat UI after
	 * a thread is loaded or the page is reloaded.
	 * Only user text and assistant messages (including tool-call indicators)
	 * are rendered; `tool` role messages (server results) are intentionally
	 * skipped because they are already captured in the preceding tool_call
	 * indicator and repeating them would clutter the UI.
	 * @returns {void}
	 */
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



	/**
	 * _COLLECT_MODELS
	 * Returns the list of model configs available for the settings panel.
	 * Each entry is a self-contained object:
	 *   { model_id, label, dtype, device, fallback_device,
	 *     max_new_tokens, thinking, thinking_options }
	 * When the tool register.json provides an explicit `models` array, that
	 * is returned verbatim. Otherwise a single synthetic entry is built from
	 * the active config so the settings UI always has at least one option.
	 * @returns {Array} array of model config objects
	 */
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



	/**
	 * _APPLY_SETTINGS
	 * Applies a settings change from the UI panel. Handles three kinds of change:
	 *   1. Model change — pulls the full config for the new model from `models[]`
	 *      and rebuilds the model_engine (requires reload).
	 *   2. Device change — same model, different backend (webgpu ↔ wasm).
	 *      Also requires a model_engine rebuild.
	 *   3. Thinking mode change — updates _config.thinking in-place;
	 *      the engine picks it up on the next generate() call. No reload needed.
	 *
	 * Guards against concurrent changes while busy (loading or generating).
	 * Persists the new model_id + device + thinking to localStorage via _write_prefs
	 * so selections survive page reload.
	 *
	 * @param {Object} new_settings - object with any of: model_id, device, dtype, thinking
	 * @returns {Promise<void>}
	 */
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



	/**
	 * _INITIALIZE_MCP
	 * Performs the MCP initialization handshake and populates this._mcp_tools.
	 * Idempotent: returns immediately if already initialized.
	 *
	 * Protocol sequence (skipped if tools/list succeeds on the first attempt):
	 *   1. POST initialize → receive capabilities
	 *   2. POST notifications/initialized (fire-and-forget)
	 *   3. POST tools/list → populate this._mcp_tools
	 *
	 * Some MCP server deployments accept tools/list without a prior handshake;
	 * the shortcut on the first try avoids a redundant round-trip.
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} if the MCP initialize call fails (network error or non-2xx)
	 */
	async _initialize_mcp() {

		if (this._mcp_initialized) return

		// try tools/list first
		// (!) `var` is intentional: function-scoped so the bare reassignment
		//     at the second tools_list() call below (outside this try block) stays in scope.
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



	/**
	 * _BUILD_SYSTEM_PROMPT
	 * Builds the system prompt for the current generation turn.
	 *
	 * The prompt has two parts:
	 *   1. Context block — the active section/record/component from client_context.
	 *      Uses the rich multi-line summary when tools are enabled (more expensive
	 *      but gives the model portal field labels). Falls back to a single compact
	 *      line when tools are disabled (answer-only turns).
	 *   2. Tool guidance block — only emitted when tools_enabled is true. Lists
	 *      client tools and MCP tools with their usage rules and the full Dédalo
	 *      portal workflow (how to follow locators, how to write back, etc.).
	 *      On answer-only turns this is replaced with a strict no-tool instruction
	 *      to prevent the model from hallucinating tool calls.
	 *
	 * (!) The full portal system guidance is intentionally verbose: small LLMs
	 * reliably confuse portal tipos with section media tipos without it.
	 *
	 * @param {boolean} tools_enabled - true on tool-calling turns, false on answer-only turns
	 * @returns {string} the complete system prompt text
	 */
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





	/**
	 * _BUILD_TOOLS_FOR_MODEL
	 * Assembles the list of tool declarations to pass to the LLM for a given
	 * turn. Tool declarations follow OpenAI function-calling format:
	 *   { type: 'function', function: { name, description, parameters } }
	 *
	 * Returns two categories merged:
	 *   1. Client tools (CLIENT_TOOLS array) — always included; run in the
	 *      browser with no server call.
	 *   2. MCP tools (this._mcp_tools) — filtered to agent-tier
	 *      (annotations.tier === 'agent') plus the discovery fallback set
	 *      (PRIMITIVE_DISCOVERY_FALLBACK) and write allowlist
	 *      (PRIMITIVE_WRITE_ALLOWLIST). Full primitive-tier tools are excluded
	 *      to keep the token budget manageable.
	 *
	 * Every schema passes through _sanitize_schema → _minimize_schema to ensure
	 * Gemma 4 Jinja compatibility (no undefined `type` nodes).
	 *
	 * @returns {Array} array of OpenAI-format tool declaration objects
	 */
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



	/**
	 * _TOOL_DESCRIPTION
	 * Returns the tool description capped at 400 characters.
	 * This preserves the most important portal and relation guidance while
	 * keeping the aggregate tool-declaration token count manageable for
	 * small local LLMs (< 2B params).
	 * @param {Object} tool - MCP or client tool definition with optional `description` field
	 * @returns {string} description string, truncated to 400 chars if necessary
	 */
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
	 *
	 * Routing rule: if tool_call.function.name starts with 'client_', look it
	 * up in CLIENT_TOOLS and invoke its run() method synchronously (no network).
	 * Otherwise forward to mcp_client.tools_call() via the PHP MCP proxy.
	 *
	 * Both paths return the same shape so the caller can push the result
	 * directly into this._conversation:
	 *   { role: 'tool', tool_call_id: string, content: string }
	 *
	 * @param {Object} tool_call - parsed tool call: { id, function: { name, arguments } }
	 * @param {Object} args_obj - already-parsed (object) arguments for the tool
	 * @param {Object} indicator - chat_render indicator handle, updated to 'done'/'error'
	 * @returns {Promise<Object>} OpenAI `tool` role message: { role, tool_call_id, content }
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
	 * Coerces any client-tool result value into a model-friendly string and
	 * caps its byte length at MAX_TOOL_RESULT_BYTES so a single tool result
	 * cannot consume the entire KV cache budget.
	 * null/undefined → '(not found)'
	 * string         → used as-is
	 * anything else  → JSON.stringify(); if that fails, String()
	 * @param {*} value - raw return value from a client tool's run() method
	 * @returns {string} UTF-16 string no longer than MAX_TOOL_RESULT_BYTES chars
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
	 * Unwraps the MCP proxy response envelope, strips noisy fields, and
	 * produces a compact, tool-specific summary string for injection into
	 * the conversation history.
	 *
	 * Two response formats are handled:
	 *   Format 1 (direct MCP):
	 *     { result: { content: [{ type:'text', text:'...' }] } }
	 *   Format 2 (PHP proxy wrapper):
	 *     { result:true, data: { result: { content: [...] } } }
	 *
	 * After unwrapping, tool-specific summarizers run to fit within the token
	 * budget without mid-JSON truncation:
	 *   describe_section → "Section: X. Fields: a (text), b (portal→Y), …"
	 *   get_record       → "#id — field1: val1 | field2: val2 | …"
	 *   search_records_view → "Found N records. #1: … | #2: … | …"
	 *   count_records    → "Total: N records in section."
	 *   set_field        → "Updated. {…}"
	 *   get_media_url    → "url=… | file_exist=false …"
	 *
	 * Falls back to compact JSON (≤1500 chars) or a key-list summary.
	 *
	 * @param {Object} tool_result - raw response from mcp_client.tools_call()
	 * @param {string} tool_name - MCP tool name used to select the summarizer
	 * @returns {string} compact summary string ready for the conversation history
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
	 * Same envelope-unwrapping logic as _extract_tool_result but returns the
	 * raw inner object (parsed JSON) instead of a compact summary string.
	 * Used by batch pipelines (run_bulk_image_transcribe) and the ontology
	 * pre-resolver that need to iterate over records or inspect field arrays.
	 *
	 * Returns null (never throws) when the result cannot be unwrapped or the
	 * inner value is not an object.
	 *
	 * @param {Object} tool_result - raw response from mcp_client.tools_call()
	 * @returns {Object|null} unwrapped inner object, or null on failure
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
	 * Fixes common LLM output mismatches in tool arguments before they are
	 * forwarded to the MCP proxy.
	 *
	 * Current normalizations:
	 *   - `lang` field: maps ISO 639-1 two-letter codes (e.g. "en", "es") to
	 *     the Dédalo internal form "lg-<iso639-2>" (e.g. "lg-eng", "lg-spa").
	 *     Codes not in the map are passed through with the "lg-" prefix added.
	 *     Already-prefixed values ("lg-…") are left unchanged.
	 *
	 * Returns the args object unchanged (by identity) if no normalization
	 * is applicable, or a shallow copy with patched values.
	 *
	 * @param {string} tool_name - MCP tool name (currently unused; reserved for per-tool rules)
	 * @param {Object} args - parsed argument object from the LLM
	 * @returns {Object} normalized argument object (shallow copy if mutated)
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
	 * _MINIMIZE_SCHEMA
	 * Shrinks a JSON schema for tool declarations, keeping only what a small
	 * LLM actually needs to construct valid tool arguments:
	 *   - `type` (always present)
	 *   - `required` (top level only)
	 *   - `properties` (objects, up to max_depth=2 levels deep)
	 *   - `items` (arrays, up to max_depth=2 levels deep)
	 * Descriptions, enums, and $ref chains are dropped to save tokens.
	 * Applied AFTER _sanitize_schema so input is already well-typed.
	 *
	 * (!) Call _sanitize_schema first — _minimize_schema assumes every node
	 * already has a valid string `type` field.
	 *
	 * @param {Object} schema - already-sanitized JSON schema node
	 * @param {number} depth - current recursion depth (0 = top-level parameters object)
	 * @returns {Object} minimized schema node
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


	/**
	 * _SANITIZE_SCHEMA
	 * Produces a "lowest-common-denominator" JSON schema that BOTH the Qwen
	 * and Gemma chat templates can consume.
	 *
	 * Gemma 4's Jinja template applies the `upper` filter to every property's
	 * `type` field without a null guard. A missing or non-string `type` therefore
	 * raises "Cannot apply filter 'upper' to UndefinedValue" and aborts the
	 * entire tool-calling turn.
	 *
	 * Strategy:
	 *   - Whitelist only the fields Gemma understands:
	 *     `type`, `description`, `properties`, `required`, `items`, `enum`, `nullable`
	 *   - Ensure every node — including nested property nodes — has a valid
	 *     string `type` (recursively).
	 *   - Coerce untyped / `anyOf` / `$ref` / union leaves to `{ type:'string' }`.
	 *   - When `schema.type` is an array (JSON Schema draft-7 style), pick the
	 *     first non-null entry.
	 *
	 * Always call this before _minimize_schema.
	 *
	 * @param {Object} schema - raw JSON schema node (from MCP inputSchema or CLIENT_TOOLS)
	 * @returns {Object} sanitized schema node with guaranteed string `type`
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



	/**
	 * _NORMALIZE_MESSAGES_FOR_MODEL
	 * Converts tool_call function arguments from JSON strings to parsed objects.
	 *
	 * The Qwen3.5 Jinja chat template applies `|items` to tool_call.arguments,
	 * which expects a dict (object). Passing a JSON string raises:
	 *   "Unknown StringValue filter: items"
	 * This must be called before passing messages to apply_chat_template.
	 * Only messages with tool_calls are touched; all others pass through unchanged.
	 *
	 * @param {Array} messages - conversation array in OpenAI message format
	 * @returns {Array} new array with assistant messages' tool_call arguments parsed
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
	 * Works with any endpoint that follows the /v1/chat/completions SSE streaming
	 * protocol: Ollama, OpenAI, vLLM, localAI, etc.
	 *
	 * Tool calls are accumulated across SSE delta chunks (each chunk may carry
	 * partial name + arguments strings) and assembled into the standard OpenAI
	 * tool_call shape before returning.
	 *
	 * The returned `raw_result` is shaped to be compatible with
	 * model_engine.parse_tool_calls() so the main loop can use a single
	 * code path regardless of whether the API or local engine was used.
	 *
	 * @param {Array} messages - OpenAI-format message list
	 * @param {Array} tools - tool declarations in OpenAI function-calling format
	 * @param {number} max_new_tokens - max tokens to generate
	 * @param {Function} on_token - stream callback called for each text delta
	 * @param {Function} on_think_token - stream callback for reasoning/thinking deltas
	 * @param {AbortSignal} signal - abort signal from the current AbortController
	 * @returns {Promise<Object>} { full_text, streamed_text, raw_result }
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
	 * Sends a single-turn multimodal request to the configured vision API
	 * (this._config.api_url) and returns the model's text response.
	 * Works with any OpenAI-compatible endpoint that accepts image_url content.
	 *
	 * The image is fetched server-side by the browser, converted to a base64
	 * data-URL via FileReader, and sent as an `image_url` content part rather
	 * than a raw URL. This avoids CORS issues with endpoints that cannot
	 * re-fetch from arbitrary origins.
	 *
	 * Used by:
	 *   - client_tools `client_analyze_image_url` (single-record vision)
	 *   - run_bulk_image_transcribe (batch vision pipeline)
	 *
	 * @param {string} url - public image URL (http/https or data-URL)
	 * @param {string} prompt - instruction text sent to the vision model
	 * @returns {Promise<string>} model's text response (may be empty string on failure)
	 * @throws {Error} if api_url is not configured or the image fetch fails
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
	 * Matches a human-written field label against the field descriptor array
	 * returned by dedalo_describe_section, resolving to the Dédalo component
	 * tipo (e.g. "rsc85").
	 *
	 * Matching is two-phase:
	 *   1. Exact match after _normalize_label (accent-stripped, lowercased).
	 *   2. Partial/substring match as fallback.
	 *
	 * Uses _extract_term_labels to handle multilingual term objects
	 * (a field label may be an object keyed by language code).
	 *
	 * @param {Array} fields - field descriptors: [{ tipo, label, type }, …]
	 * @param {string} label - human-readable field name to resolve
	 * @returns {string|null} component tipo string, or null if not found
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
	 * Batch pipeline that iterates records from the active section SQO,
	 * calls the vision model on each image, and writes the result to a target
	 * text field. Designed for large-scale transcription or captioning tasks.
	 *
	 * Execution steps:
	 *   1. Read the active SQO from client_context (section_tipo + filter + total).
	 *   2. Call dedalo_describe_section to resolve image_field and target_field
	 *      human labels to component tipos.
	 *   3. Enforce a safety cap (≤ 500 records, ≤ specified max_records).
	 *   4. Ask for ONE batch confirmation via chat_render.confirm_action().
	 *   5. Set this._bulk_approval to suppress per-record confirm prompts
	 *      for dedalo_set_field writes to the target tipo.
	 *   6. Paginate search_records_view (page_size records at a time), then for
	 *      each record: get_media_url → analyze_image_url → dedalo_set_field.
	 *   7. Emit progress messages every 5 records. Clear _bulk_approval in finally.
	 *
	 * Called by the `client_bulk_image_transcribe` client tool.
	 *
	 * @param {Object} ctx - client_context instance with get_active_sqo()
	 * @param {Object} args - pipeline parameters
	 * @param {string} args.prompt - instruction text for the vision model
	 * @param {string} args.image_field - human label of the image/media component
	 * @param {string} args.target_field - human label of the text component to write
	 * @param {number} [args.max_records] - hard cap on records to process (default: all)
	 * @param {number} [args.page_size=25] - records per search page (max 50)
	 * @returns {Promise<string>} summary string ("N of M records updated")
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



	/**
	 * _HANDLE_USER_MESSAGE
	 * Main agentic loop entry point. Called by chat_render when the user submits
	 * a message. Runs the generate → tool-dispatch → generate cycle until the
	 * model produces a final text response with no tool calls.
	 *
	 * Loop invariants:
	 *   - Iteration 1 … MAX_TOOL_TURNS: tool declarations passed to the model.
	 *   - Iteration MAX_TOOL_TURNS+1 … max_iterations: answer-only mode (no tools),
	 *     with an injected user message instructing the model to answer from context.
	 *   - max_iterations is a hard safety cap; an infinite tool-calling loop
	 *     will terminate here.
	 *
	 * Per-turn flow:
	 *   1. Build system prompt (with/without tool guidance based on turn index).
	 *   2. Trim conversation to last 50 messages to bound KV cache growth.
	 *   3. Generate (local model_engine or remote _generate_with_api).
	 *   4. Parse tool calls from the generation result.
	 *   5a. If tool calls present: dispatch each, push tool messages, continue loop.
	 *   5b. If no tool calls: push assistant message, break loop.
	 *   6. Persist conversation to conversation_store after each tool iteration.
	 *
	 * Destructive tools (DESTRUCTIVE_TOOLS list) require explicit user confirmation
	 * via chat_render.confirm_action(), unless this._bulk_approval grants pre-approval
	 * (set by run_bulk_image_transcribe).
	 *
	 * @param {string} message - raw text submitted by the user
	 * @returns {Promise<void>}
	 */
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



	/**
	 * _BUILD_ONTOLOGY_CONTEXT_FOR_MESSAGE
	 * Scans the user's message for known Dédalo section names (from the
	 * dedalo_ontology_glossary) and injects a compact resolution hint block
	 * into the system prompt before the first generation turn.
	 *
	 * For each matched term it either:
	 *   - Emits "Resolved: 'term' => section_tipo 'X' (Label)" for unique matches.
	 *   - Emits "Ambiguous: 'term': LabelA => X; LabelB => Y" for multi-matches.
	 *
	 * Additionally fetches field-level structure (via dedalo_describe_section)
	 * for up to 2 uniquely resolved sections, exposing portal targets and field
	 * labels so the model can construct correct get_record + set_field calls
	 * without an extra describe_section round-trip.
	 *
	 * Returns null (no context block) when no ontology mentions are found or
	 * the glossary is empty. Never throws — errors are caught and converted to
	 * an advisory string instructing the model to call dedalo_ontology_glossary.
	 *
	 * @param {string} message - raw user message text
	 * @returns {Promise<string|null>} ontology context block or null
	 */
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



	/**
	 * _RESOLVE_ONTOLOGY_MENTIONS
	 * Scans normalized message text for ontology term labels and returns a
	 * list of match objects, each with the matched label and its candidate
	 * section_tipo entries.
	 *
	 * Algorithm:
	 *   - Build (or reuse) this._ontology_index for the current glossary.
	 *   - Normalize message text (accent-stripped, lowercased).
	 *   - Sort index labels by length descending so longer/more-specific
	 *     terms are matched first (greedy longest-match wins).
	 *   - Skip labels shorter than 3 chars to avoid false positives on
	 *     common abbreviations.
	 *   - Track occupied character ranges to avoid overlapping matches.
	 *   - Cap at 8 mentions to limit system-prompt bloat.
	 *
	 * @param {string} message - raw user message text
	 * @param {Array} glossary - glossary array from _get_ontology_glossary()
	 * @returns {Array} array of { label: string, matches: [{section_tipo, label}] }
	 */
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



	/**
	 * _FIND_LABEL_IN_TEXT
	 * Searches for `label` as a whole word within `text` (both already
	 * normalized via _normalize_label). Returns the start index of the
	 * first word-boundary match, or -1 if not found.
	 *
	 * Word boundary definition: the character before and after the match
	 * must NOT be an ASCII letter or digit [a-z0-9]. This is used instead
	 * of regex word boundaries because the text has already been lowercased
	 * and accent-stripped (no Unicode chars remain).
	 *
	 * @param {string} text - normalized search text (output of _normalize_label)
	 * @param {string} label - normalized label to locate (output of _normalize_label)
	 * @returns {number} index of first whole-word match, or -1
	 */
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



	/**
	 * _GET_ONTOLOGY_GLOSSARY
	 * Fetches and caches the Dédalo section name glossary from the MCP server.
	 * Calls `dedalo_ontology_glossary` with mode='sections' once per session;
	 * subsequent calls return the cached array immediately.
	 *
	 * Uses a promise-based in-flight dedup (_ontology_loading) to ensure that
	 * concurrent callers (e.g. rapid message submissions) share a single request
	 * rather than firing parallel fetches.
	 *
	 * On success:
	 *   - Populates this._ontology_glossary (Array of section descriptor objects).
	 *   - Builds this._ontology_index (Map of normalized label → matches).
	 *   - Clears this._ontology_loading.
	 *
	 * @returns {Promise<Array>} array of section glossary entries
	 * @throws {Error} if the MCP call fails (propagated from mcp_client)
	 */
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



	/**
	 * _EXTRACT_TOOL_STRUCTURED_CONTENT
	 * Extracts the MCP `structuredContent` field (or falls back to parsing the
	 * text content) from a raw MCP PHP-proxy response.
	 * Used by _get_ontology_glossary to obtain the pre-parsed JSON array from
	 * the dedalo_ontology_glossary result, which returns a structuredContent
	 * block alongside the human-readable text content.
	 *
	 * Priority:
	 *   1. result.structuredContent (MCP 2025-03 spec)
	 *   2. JSON.parse(result.content[0].text) (text-only MCP responses)
	 *   3. null
	 *
	 * @param {Object} tool_result - raw response from mcp_client.tools_call()
	 * @returns {Object|null} parsed structured content object, or null
	 */
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



	/**
	 * _BUILD_ONTOLOGY_INDEX
	 * Builds an inverted index from the glossary array for O(1) label lookups.
	 * Each section's `term` value (string, array, or lang-keyed object) is
	 * decomposed into candidate label strings via _extract_term_labels, then
	 * stored under its normalized form as the key.
	 *
	 * The resulting Map is stored in this._ontology_index and shared between
	 * _resolve_ontology_mentions and _match_section_label.
	 *
	 * @param {Array} glossary - array of { section_tipo, term } objects
	 * @returns {Map} normalized-label → [{section_tipo, label}] map
	 */
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



	/**
	 * _MATCH_SECTION_LABEL
	 * Looks up a human section label against the ontology index and returns
	 * all candidate section_tipo matches (unique by section_tipo).
	 *
	 * Matching priority:
	 *   1. Exact normalized match.
	 *   2. Singular form (strips trailing 's') — handles plurals like
	 *      "Persons" → matches "Person".
	 *   3. Substring match (label contains index key, or index key contains label).
	 *
	 * Builds the index on first call if not already populated.
	 *
	 * @param {string} label - human label to look up
	 * @param {Array} glossary - glossary array (used to build index if needed)
	 * @returns {Array} unique matches: [{section_tipo, label}, …]
	 */
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



	/**
	 * _UNIQUE_MATCHES
	 * Deduplicates a flat array of { section_tipo, label } match objects,
	 * keeping only the first occurrence of each section_tipo. Preserves
	 * input order (first-seen wins).
	 * @param {Array} matches - raw match array, may contain duplicates
	 * @returns {Array} deduplicated array of { section_tipo, label } objects
	 */
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



	/**
	 * _EXTRACT_TERM_LABELS
	 * Recursively extracts all non-empty string leaf values from a term value
	 * that may be:
	 *   - A plain string (single label).
	 *   - An Array of strings or nested term values.
	 *   - An Object keyed by language code (e.g. { "lg-eng": "Person", "lg-spa": "Persona" }).
	 *
	 * Used by _build_ontology_index to index every language variant of a section
	 * name so that both English and Spanish mentions are resolved.
	 *
	 * @param {string|Array|Object} term - term value from a glossary entry
	 * @returns {Array} flat array of non-empty string labels
	 */
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



	/**
	 * _NORMALIZE_LABEL
	 * Normalizes a label string to a canonical form for fuzzy comparison:
	 *   1. Unicode NFD decomposition (separates base char from diacritics).
	 *   2. Strip combining diacritical marks (U+0300–U+036F) → accent removal.
	 *   3. Lowercase.
	 *   4. Replace underscores and hyphens with spaces.
	 *   5. Remove any character that is not [a-z0-9 ].
	 *   6. Collapse multiple spaces, trim.
	 *
	 * Used throughout the ontology matching pipeline so that "Topónimos",
	 * "toponimos", and "Toponimy" all normalize to comparable forms.
	 *
	 * @param {string} label - raw label string (any language)
	 * @returns {string} normalized lowercase ASCII label
	 */
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



	/**
	 * _PERSIST
	 * Saves the current conversation array to the conversation_store for the
	 * active thread. No-op when no thread is active (during initialization).
	 * Called after every iteration of the agentic loop so that partial
	 * multi-step conversations survive page reload.
	 * @returns {void}
	 */
	_persist() {
		if (!this._thread_id) return
		this._store.save(this._thread_id, this._conversation)
	}//end _persist



	/**
	 * _NEW_CONVERSATION
	 * Resets the conversation state and opens a fresh thread in the store.
	 * If a generation is in progress, aborts it first.
	 * Called by chat_render's "New conversation" button.
	 * @returns {void}
	 */
	_new_conversation() {
		if (this._is_generating) {
			this._abort_generation()
		}
		this._conversation = []
		this._thread_id = this._store.create()
		this._chat_render.clear_messages()
		this._chat_render.add_system_message(t('new_conversation_started', 'New conversation started.'))
	}//end _new_conversation



	/**
	 * _LOAD_THREAD
	 * Switches the active conversation to an existing thread by ID.
	 * Guards against switching while busy. Calls set_active on the store so
	 * the next page load will restore this thread automatically.
	 * @param {string} id - thread ID from conversation_store.list()
	 * @returns {void}
	 */
	_load_thread(id) {
		if (this._is_generating || this._model_loading) return
		const thread = this._store.get(id)
		if (!thread) return
		this._store.set_active(id)
		this._thread_id = id
		this._conversation = (thread.messages || []).slice()
		this._replay_conversation()
	}//end _load_thread



	/**
	 * _DELETE_THREAD
	 * Removes a thread from the conversation_store.
	 * If the deleted thread is the currently active one, falls back to
	 * the most recent remaining thread or starts a new conversation.
	 * @param {string} id - thread ID to delete
	 * @returns {void}
	 */
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



	/**
	 * _ABORT_GENERATION
	 * Signals the current AbortController to cancel an in-progress generation.
	 * The agentic loop detects the abort via AbortError and terminates cleanly.
	 * Also used to cancel in-flight fetch calls in _generate_with_api.
	 * @returns {void}
	 */
	_abort_generation() {
		if (this._abort_controller) {
			this._abort_controller.abort()
		}
	}//end _abort_generation



	/**
	 * IS_MODEL_LOADING
	 * Returns true while model weights are being downloaded or initialized.
	 * Used by external callers (e.g. render_tool_assistant) to guard UI actions.
	 * @returns {boolean}
	 */
	is_model_loading() {
		return this._model_loading
	}//end is_model_loading



	/**
	 * ABORT_MODEL_LOAD
	 * Cancels an in-progress model load and resets the loading flag.
	 * Called from the UI when the user selects a different model mid-load.
	 * @returns {void}
	 */
	abort_model_load() {
		if (this._abort_controller) {
			this._abort_controller.abort()
		}
		this._model_loading = false
	}//end abort_model_load



	/**
	 * DESTROY
	 * Teardown method called when the assistant tool is unmounted.
	 * Unsubscribes client_context DOM event listeners and releases the model
	 * engine (which frees WebGPU / WASM memory).
	 * @returns {void}
	 */
	destroy() {
		this._client_context.destroy()
		if (this._model_engine) {
			this._model_engine.unload()
		}
	}//end destroy



	/**
	 * _READ_PREFS
	 * Reads persisted user preferences (model_id, device, thinking) from
	 * localStorage. Returns an empty object on parse failure or when no
	 * prefs exist yet, so callers can always safely do `prefs.model_id`.
	 * @returns {Object} prefs object (may be empty)
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
	 * Persists user preferences to localStorage under PREFS_KEY.
	 * Silently swallows storage errors (quota exceeded, private browsing).
	 * @param {Object} prefs - object with model_id, device, and/or thinking fields
	 * @returns {void}
	 */
	static _write_prefs(prefs) {
		try {
			window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
		} catch(e) {}
	}//end _write_prefs



}//end ai_assistant class
