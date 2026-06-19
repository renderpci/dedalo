// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * TOOL_ASSISTANT
 *
 * Constructor + prototype for the Dédalo AI Assistant tool.
 * This module is the thin glue layer between the generic tool infrastructure
 * (tool_common / common) and the assistant-specific subsystems:
 *
 *   render_tool_assistant  — chat panel UI scaffolding
 *   ai_assistant           — full conversational-AI orchestration loop
 *   model_engine           — Transformers.js WebGPU / WASM pipeline manager
 *   mcp_client             — MCP proxy client (dedalo-work-mcp via dd_mcp_api)
 *   client_tools           — synchronous client-side tool-call handlers
 *   conversation_store     — IndexedDB-backed thread persistence
 *   chat_render / markdown — message rendering and Markdown-to-HTML
 *
 * Lifecycle (follows the standard Dédalo tool contract):
 *   1. Dédalo JS loader calls `new tool_assistant()` then `init(options)`.
 *   2. `init()` delegates to `tool_common.prototype.init` (sets self.model,
 *      self.caller, self.lang, etc.; wires the section-tool button).
 *   3. `render()` (inherited from tool_common) calls `build()`, then `edit()`.
 *   4. `build()` force-autoloads the tool context so self.config (the dd1633
 *      JSON component from register.json) is populated, then resolves the
 *      active AI model and exposes `self.assistant_config` for ai_assistant.
 *   5. `edit()` (delegated to render_tool_assistant) opens the chat modal and
 *      instantiates ai_assistant, which handles the rest of the lifecycle.
 *
 * Tool registration: register.json binds dd1326 = "tool_assistant"; the tool
 * opens as `open_as:"modal"` (dd1335) and is registered on dd64 (sections),
 * dd128 (main toolbar), and dd153 (context menus).
 *
 * @module tool_assistant
 */

// import
	import { dd_console } from '../../../core/common/js/utils/index.js'
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { common } from '../../../core/common/js/common.js'
	import { tool_common } from '../../tool_common/js/tool_common.js'
	import { render_tool_assistant } from './render_tool_assistant.js'
	import { ai_assistant } from './ai_assistant.js'



/**
 * TOOL_ASSISTANT
 * Constructor for the AI Assistant tool instance.
 *
 * Follows the Dédalo prototype-based instantiation pattern; the real
 * initialisation happens in `init()` and `build()`.  All properties are
 * declared here (null-initialised) so V8 can create a monomorphic hidden
 * class from the start.
 *
 * Instance properties (set by tool_common.init unless noted):
 * @var {string|null}   id             - Unique instance identifier (set by tool_common.init)
 * @var {string|null}   model          - Tool model name: "tool_assistant"
 * @var {string|null}   mode           - Active render mode, typically "edit"
 * @var {HTMLElement|null} node        - Root DOM node owned by this instance
 * @var {Array|null}    ar_instances   - Child component instances (tools may have none)
 * @var {string|null}   status         - Lifecycle state: null → "initializing" → "ready"
 * @var {Array}         events_tokens  - Registered event-listener tokens (for cleanup in destroy)
 * @var {string|null}   type           - Structural type tag used by tool_common
 * @var {Object|null}   caller         - The component/section instance that opened this tool
 *
 * After build(), the following additional property is available:
 * @var {Object}        assistant_config - Resolved model/engine config forwarded to ai_assistant:
 *   {
 *     model_id        : {string}  — HuggingFace model path or "server/<id>"
 *     label           : {string}  — Human-readable model label
 *     models          : {Array}   — All visible model descriptors (for settings UI)
 *     engines         : {Array}   — All registered engine descriptors
 *     dtype           : {string}  — Quantisation dtype, e.g. "q4f16"
 *     device          : {string}  — Primary device: "webgpu" or "wasm"
 *     fallback_device : {string}  — Device used when primary is unavailable
 *     max_new_tokens  : {number}  — Token generation budget per turn
 *     thinking        : {string}  — Thinking mode: "none" | "low" | "high"
 *     thinking_options: {Array}   — Supported thinking levels for the active model
 *     api_url?        : {string}  — OpenAI-compatible endpoint (server models only)
 *     api_model?      : {string}  — Model name sent to the server API
 *     api_key?        : {string}  — Auth token for the server API
 *   }
 *
 * @returns {boolean} Always true (Dédalo constructor convention)
 */
export const tool_assistant = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= []
	this.type			= null
	this.caller			= null

	return true
}//end tool_assistant



/**
 * COMMON FUNCTIONS
 * Prototype delegation wires the standard tool/common surface onto tool_assistant
 * without requiring class inheritance.  Each assignment delegates one method:
 *
 *   render  — tool_common.render   builds the tool, calls build() then edit()
 *   destroy — common.destroy       tears down DOM nodes and event listeners
 *   refresh — common.refresh       re-runs build() + re-renders in place
 *   edit    — render_tool_assistant.edit  opens the chat panel modal
 */
	tool_assistant.prototype.render		= tool_common.prototype.render
	tool_assistant.prototype.destroy	= common.prototype.destroy
	tool_assistant.prototype.refresh	= common.prototype.refresh
	tool_assistant.prototype.edit		= render_tool_assistant.prototype.edit



/**
 * INIT
 * Initialises the tool instance from the options supplied by the Dédalo JS
 * loader.  Delegates entirely to tool_common.init, which handles caller
 * resolution (modal vs. new-window via LZString-encoded URL params), language,
 * mode, and the initial status transition.
 *
 * Model-config extraction is intentionally deferred to build() because
 * self.config (the dd1633 JSON component) is only populated after autoload
 * completes inside tool_common.build().
 *
 * @param {Object} options - Standard tool init options (see tool_common.init)
 * @returns {Promise<boolean>} Resolves to the return value of tool_common.init
 */
tool_assistant.prototype.init = async function(options) {

	// just delegate to the common tool init; model config extraction happens
	// in build() because `self.config` is only populated there (via autoload).
	return await tool_common.prototype.init.call(this, options)
}//end init



/**
 * BUILD
 * Loads tool context from the server (autoload=true) and resolves the active
 * AI model and engine configuration into `self.assistant_config`.
 *
 * Why force autoload here?
 *   tool_common.build(autoload=true) fetches the tool context via the API and
 *   populates self.config with the dd1633 component value — the operator-
 *   defined default configuration stored in register.json (and optionally
 *   overridden in the DB).  Without autoload, self.config would be empty and
 *   every model/engine lookup would fall back to the hardcoded defaults below.
 *
 * Config schema (self.config, dd1633 component_json value):
 *   Every top-level key is wrapped as `{ value: <actual data>, client: bool }`.
 *   - engine : Array<{ name, type: "browser"|"server", label, ...}>
 *       Registered inference engines.  A "browser" engine means WebGPU/WASM
 *       (Transformers.js); a "server" engine means an OpenAI-compatible HTTP
 *       endpoint (e.g. LM Studio, Ollama).
 *   - models : Array<ModelDescriptor>
 *       ModelDescriptor shape:
 *         { model_id, label, dtype, device, fallback_device, max_new_tokens,
 *           thinking, thinking_options,
 *           client?: bool,  // show when a browser engine is registered
 *           server?: bool,  // show only when a server engine is registered
 *           default?: bool, // select this model when no user preference exists
 *           api_url?, api_model?, api_key? }  // server-only fields
 *
 * Active-model resolution precedence (highest wins):
 *   1. User preference saved in localStorage (key: PREFS_KEY via ai_assistant._read_prefs)
 *   2. Model descriptor with `default: true`
 *   3. First model descriptor with `client: true`
 *   4. First visible model in the filtered list
 *
 * Engine-visibility rule:
 *   Models flagged `server: true` are hidden unless at least one registered
 *   engine has `type: "server"`.  Models flagged `client: true` (or unflagged)
 *   are always visible.  This prevents the UI from offering server models to
 *   operators who have not configured a server engine.
 *
 * Side effect: populates `self.assistant_config` (see constructor JSDoc for
 * the full property list), which render_tool_assistant passes directly to the
 * ai_assistant constructor.
 *
 * @param {boolean} [autoload=false] - Ignored; build always forces autoload=true
 * @returns {Promise<boolean>} Resolves to the return value of tool_common.build
 */
tool_assistant.prototype.build = async function(autoload=false) {

	const self = this

	// force autoload so `self.config` is populated from the tool context API
		const common_build = await tool_common.prototype.build.call(this, true)

	// default model used when config is missing or incomplete (safety net for
	// installs whose `dd1633` config was not yet seeded / cache not refreshed).
		const default_model = {
			model_id		: 'onnx-community/Qwen3.5-0.8B-ONNX',
			label			: 'Qwen3.5 0.8B',
			dtype			: 'q4f16',
			device			: 'webgpu',
			fallback_device	: 'wasm',
			max_new_tokens	: 512,
			thinking		: 'none',
			thinking_options: ['none', 'low', 'high'],
			client			: true,
			default			: true
		}
		const default_engine = {
			name	: 'local',
			type	: 'browser',
			label	: 'Local'
		}

	// extract config from self.config (dd1633 default configuration).
	// schema (every top-level property is wrapped as { value, client }):
	//   - engine : array of available engines
	//       { name, type: 'browser'|'server', label, ... }
	//   - models : array of per-model objects
	//       { model_id, label, dtype, device, fallback_device, max_new_tokens,
	//         thinking, thinking_options, client?: bool, server?: bool, default?: bool }
	//
	// Fall back to register.json when the server config is empty/stale.
	// register.json is the authoritative source; the database copy may lag.
		let config				= self.config || {}
		// helper: unwrap a single { value, client } config envelope
		const get				= (key) => config[key] && config[key].value

		const all_engines		= Array.isArray(get('engine')) && get('engine').length > 0
			? get('engine')
			: [default_engine]
		// used below to gate server-only model visibility
		const has_server_engine	= all_engines.some(e => e && e.type === 'server')

		const all_models		= Array.isArray(get('models')) && get('models').length > 0
			? get('models')
			: [default_model]

	// engine binding: hide `server:true` models until a `type:"server"` engine
	// is registered. `client:true` models are always shown.
		const visible_models	= all_models.filter(m => {
			if (m.client === true) return true
			if (m.server === true) return has_server_engine
			return true // unflagged: treat as visible
		})
		// (!) always guarantee at least one model so the UI is never left empty
		const models			= visible_models.length > 0 ? visible_models : [default_model]

	// active model precedence:
	//   1) user preference from localStorage (matches a visible model_id)
	//   2) entry with `default: true`
	//   3) first `client: true` entry
	//   4) first visible entry
		const prefs				= (typeof ai_assistant._read_prefs === 'function')
			? ai_assistant._read_prefs()
			: {}
		const pref_model		= prefs && prefs.model_id
			? models.find(m => m.model_id === prefs.model_id)
			: null
		const default_in_list	= models.find(m => m.default === true)
		const first_client		= models.find(m => m.client === true)
		// cascade through the four fallback tiers; models[0] is the final safety net
		const active			= pref_model || default_in_list || first_client || models[0]

		self.assistant_config = {
			model_id			: active.model_id,
			label				: active.label || active.model_id,
			models				: models,
			engines				: all_engines,
			dtype				: active.dtype,
			device				: active.device,
			fallback_device		: active.fallback_device,
			max_new_tokens		: active.max_new_tokens,
			thinking			: active.thinking,
			thinking_options	: active.thinking_options || []
		}
		// Server/API model fields are forwarded when present so the generic API
		// client (_generate_with_api) can use them instead of the local model.
		if (active.api_url) self.assistant_config.api_url = active.api_url
		if (active.api_model) self.assistant_config.api_model = active.api_model
		if (active.api_key) self.assistant_config.api_key = active.api_key

	return common_build
}//end build
