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
 *   assistant_controller   — server-driven turn controller (agent_chat_stream)
 *   agent_stream           — SSE wire client for dd_mcp_api:agent_chat_stream
 *   client_context         — current-record context sent with each turn
 *   conversation_store     — localStorage thread persistence (v2 blob)
 *   chat_render / markdown — message rendering and Markdown-to-HTML
 *
 * Lifecycle (follows the standard Dédalo tool contract):
 *   1. Dédalo JS loader calls `new tool_assistant()` then `init(options)`.
 *   2. `init()` delegates to `tool_common.prototype.init` (sets self.model,
 *      self.caller, self.lang, etc.; wires the section-tool button).
 *   3. `render()` (inherited from tool_common) calls `build()`, then `edit()`.
 *   4. `build()` force-autoloads the tool context so self.config (the dd1633
 *      JSON component — empty since WC-013; the model catalog is served by
 *      dd_mcp_api:agent_models) is exposed as `self.assistant_config`.
 *   5. `edit()` (delegated to render_tool_assistant) opens the chat modal and
 *      instantiates assistant_controller, which drives the server agent.
 *
 * Tool registration: register.json binds dd1326 = "tool_assistant"; the tool
 * opens as `open_as:"modal"` (dd1335) and is registered on dd64 (sections),
 * dd128 (main toolbar), and dd153 (context menus).
 *
 * @module tool_assistant
 */

// import
	import { common } from '../../../core/common/js/common.js'
	import { tool_common } from '../../../core/tools_common/js/tool_common.js'
	import { render_tool_assistant } from './render_tool_assistant.js'



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
 * Loads the tool context via tool_common.build(autoload=true) and exposes the
 * dd1633 config (if any) as `self.assistant_config`.
 *
 * Since WC-013 (server-driven assistant) the client carries NO model or
 * engine configuration: the model catalog, egress classes, and write
 * availability are served per session by `dd_mcp_api:agent_models`, and the
 * agent itself runs server-side (`agent_chat_stream`). dd1633 is kept as an
 * empty escape hatch for future client-only flags.
 *
 * @param {boolean} [autoload=false] - Ignored; build always forces autoload=true
 * @returns {Promise<boolean>} Resolves to the return value of tool_common.build
 */
tool_assistant.prototype.build = async function(autoload=false) {

	const self = this

	// force autoload so `self.config` is populated from the tool context API
		const common_build = await tool_common.prototype.build.call(this, true)

	// dd1633 client config (empty since WC-013): unwrap {value, client}
	// envelopes into a plain object so future flags read as plain keys.
		const config = self.config || {}
		const assistant_config = {}
		for (const key of Object.keys(config)) {
			if (config[key] && config[key].value !== undefined) {
				assistant_config[key] = config[key].value
			}
		}
		self.assistant_config = assistant_config

	return common_build
}//end build
