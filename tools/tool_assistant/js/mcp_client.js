// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import { data_manager } from '../../../core/common/js/data_manager.js'



/**
 * MCP_CLIENT
 * Lightweight JSON-RPC 2.0 client for the Model Context Protocol (MCP).
 *
 * Purpose
 * -------
 * The browser cannot call the dedalo-work-mcp Node.js/TypeScript server directly
 * because the MCP server runs on a private port with no CORS headers. This class
 * acts as the browser-side half of a two-leg relay:
 *
 *   Browser (mcp_client)
 *     → data_manager.request() [Dédalo PHP API via fetch]
 *       → dd_mcp_api::mcp_proxy() [PHP cURL bridge]
 *         → dedalo-work-mcp HTTP server (JSON-RPC 2.0)
 *
 * All four MCP lifecycle methods are routed through the same `mcp_proxy` API
 * action with a `dd_api: 'dd_mcp_api'` discriminator field. The PHP proxy
 * enforces an allowlist of permissible MCP methods (initialize,
 * notifications/initialized, tools/list, tools/call) and rejects anything else.
 *
 * Session management
 * ------------------
 * After a successful `initialize` handshake, the MCP server assigns an opaque
 * session ID (returned by the PHP proxy as `api_response.mcp_session_id`). This
 * client persists that ID in `sessionStorage` under the key
 * `'dedalo_mcp_session_id'` and re-sends it on every subsequent request via the
 * `body.mcp_session_id` field so the server can route the call to the correct
 * server-side agent context.
 *
 * Stale-session recovery
 * ----------------------
 * If the server reports "No valid MCP session ID provided" (e.g. after a PHP
 * session restart), `_send_request` automatically:
 *   1. Clears the cached session ID from state and sessionStorage.
 *   2. Re-initializes the MCP connection.
 *   3. Sends the `notifications/initialized` handshake.
 *   4. Retries the original request exactly once (guarded by `_is_retry`).
 *
 * Typical caller: `ai_assistant._initialize_mcp()` and its tool-dispatch loop.
 *
 * @module mcp_client
 * @see class.dd_mcp_api.php  — server-side PHP proxy
 * @see ai_assistant.js       — primary consumer
 */
export const mcp_client = class mcp_client {



	constructor() {
		/** @type {number} Auto-incremented JSON-RPC 2.0 request id counter. */
		this._request_id	= 0
		/**
		 * @type {boolean} True once `initialize()` has completed successfully
		 * (either in this page load or restored from a valid sessionStorage session).
		 * Checked by `ai_assistant._initialize_mcp()` to skip redundant handshakes.
		 */
		this._initialized	= false
		/**
		 * @type {Object|null} Capability object returned by the MCP server in its
		 * `initialize` response (`result.capabilities`). Shape is server-defined;
		 * currently unused by the client but stored for future feature negotiation.
		 */
		this._capabilities	= null
		/**
		 * @type {string|null} Opaque MCP session ID persisted across page navigations
		 * via sessionStorage. Loaded eagerly so the first post-reload request can
		 * skip a full re-initialization. Null when no prior session exists or
		 * sessionStorage is unavailable.
		 */
		this._session_id	= this._read_session_id()
	}//end constructor



	/**
	 * INITIALIZE
	 * Performs the JSON-RPC 2.0 `initialize` handshake with the MCP server.
	 *
	 * Sends the mandatory capability negotiation payload (protocol version,
	 * empty client capabilities, client identity) and stores the server-returned
	 * capability object if the response is well-formed. On success, sets
	 * `_initialized = true` so subsequent calls can bypass the handshake.
	 *
	 * Note: callers in `ai_assistant._initialize_mcp()` also manually set
	 * `_initialized` and `_capabilities` on the returned object after
	 * additional validation — see that file for the dual-path logic.
	 *
	 * @returns {Promise<Object>} Raw `api_response` envelope from data_manager.
	 *   Shape: `{ result: true, data: { result: { capabilities, ... }, ... }, mcp_session_id?, ... }`.
	 * @throws {Error} If `_send_request` encounters a proxy failure or MCP-level error.
	 */
	async initialize() {

		const result = await this._send_request('initialize', {
			protocolVersion	: '2025-03-26',
			capabilities	: {},
			clientInfo		: {
				name	: 'dedalo-assistant',
				version	: '1.0.0'
			}
		})

		if (result && result.data && result.data.result) {
			this._capabilities	= result.data.result.capabilities || {}
			this._initialized	= true
		}

		return result
	}//end initialize



	/**
	 * SEND_NOTIFICATION
	 * Sends a fire-and-forget JSON-RPC 2.0 notification to the MCP server.
	 *
	 * Notifications differ from requests in that they carry no `id` field and
	 * the server is not obligated to respond. Errors (e.g. "already initialized"
	 * on a redundant `notifications/initialized` call) are silently swallowed
	 * because the caller cannot act on them and the connection remains usable.
	 *
	 * Primary use: `notifications/initialized` sent after every successful
	 * `initialize()` call, including the automatic stale-session re-init path.
	 *
	 * @param {string} method - MCP notification method name (e.g. `'notifications/initialized'`).
	 * @param {Object} [params={}] - Optional notification parameters (usually empty for lifecycle notifications).
	 * @returns {Promise<void>}
	 */
	async send_notification(method, params={}) {

		try {
			await this._send_request(method, params, true)
		} catch(e) {
			// notifications are fire-and-forget; ignore errors like "already initialized"
		}
	}//end send_notification



	/**
	 * TOOLS_LIST
	 * Retrieves the list of tools registered on the MCP server.
	 *
	 * Wraps the `tools/list` JSON-RPC method. The response payload
	 * (`api_response.data.result.tools`) contains an array of tool descriptors,
	 * each with `name`, `description`, and `inputSchema`. Callers (primarily
	 * `ai_assistant._build_tool_list()`) split these into local and MCP-tier
	 * tools for the model's system prompt and tool-dispatch router.
	 *
	 * @returns {Promise<Object>} Raw `api_response` envelope.
	 *   Relevant sub-path: `response.data.result.tools` — `Array<{name, description, inputSchema}>`.
	 * @throws {Error} If the proxy request fails or the MCP server returns an error.
	 */
	async tools_list() {

		return await this._send_request('tools/list', {})
	}//end tools_list



	/**
	 * TOOLS_CALL
	 * Invokes a named tool on the MCP server with the given arguments.
	 *
	 * Normalises the `tool_arguments` parameter before forwarding: the language
	 * model sometimes emits tool arguments as a JSON string instead of a parsed
	 * object. When a string is received it is parsed; if parsing fails the raw
	 * string is wrapped as `{ raw: args }` to prevent a hard failure (the MCP
	 * server will surface a validation error with more context).
	 *
	 * @param {string} name - Name of the MCP tool to invoke (e.g. `'dedalo_search_records_view'`).
	 * @param {Object|string} tool_arguments - Tool input arguments. Accepts either
	 *   a plain object or a JSON-encoded string (LLM output path). If neither
	 *   parses cleanly the raw string is wrapped as `{ raw: tool_arguments }`.
	 * @returns {Promise<Object>} Raw `api_response` envelope.
	 *   Relevant sub-path: `response.data.result.content` — array of MCP content blocks.
	 * @throws {Error} If the proxy request fails or the MCP server returns an error object.
	 */
	async tools_call(name, tool_arguments) {

		let args = tool_arguments
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args)
			} catch(e) {
				args = { raw: args }
			}
		}

		return await this._send_request('tools/call', {
			name		: name,
			arguments	: args || {}
		})
	}//end tools_call



	/**
	 * _SEND_REQUEST
	 * Core transport method: builds the JSON-RPC 2.0 envelope, dispatches it
	 * through the Dédalo API proxy, and returns the raw response.
	 *
	 * Envelope construction
	 * ---------------------
	 * Every outbound message is wrapped in a JSON-RPC 2.0 envelope object:
	 *   `{ jsonrpc: '2.0', method, params, [id] }`
	 * The `id` field is omitted for notifications (`is_notification=true`),
	 * which tells the PHP proxy (and ultimately the MCP server) not to wait for
	 * a response body.
	 *
	 * Proxy routing
	 * -------------
	 * The envelope is nested inside the Dédalo API body:
	 *   `{ action: 'mcp_proxy', dd_api: 'dd_mcp_api', options: <envelope>, [mcp_session_id] }`
	 * `mcp_session_id` is appended to all non-initialize requests so the PHP
	 * proxy can restore the server-side session without a full re-handshake.
	 *
	 * Session persistence
	 * -------------------
	 * If the API response carries a `mcp_session_id` field (set by the PHP proxy
	 * after `initialize`), it is cached both in `this._session_id` and in
	 * `sessionStorage` for cross-navigation resilience.
	 *
	 * Stale-session auto-recovery (single retry)
	 * -------------------------------------------
	 * When the PHP proxy returns `result: false` with the message
	 * "No valid MCP session ID provided", the method:
	 *   1. Drops the cached session ID.
	 *   2. Calls `initialize()` to start a fresh session.
	 *   3. Sends `notifications/initialized`.
	 *   4. Retries the original call once (`_is_retry=true` guards against loops).
	 *
	 * Error surfaces
	 * --------------
	 * - PHP proxy failure: `api_response.result === false` → throws `Error(msg)`.
	 * - MCP-level error:   `mcp_response.error` present → throws `Error('MCP error [code]: message')`.
	 *
	 * @param {string}  method          - JSON-RPC 2.0 method name (e.g. `'tools/call'`).
	 * @param {Object}  [params={}]     - JSON-RPC 2.0 params object to send with the request.
	 * @param {boolean} [is_notification=false] - When true the `id` field is omitted
	 *   and the PHP proxy treats the call as fire-and-forget.
	 * @param {boolean} [_is_retry=false] - Internal flag; set to true on the single
	 *   automatic retry after stale-session recovery to prevent infinite recursion.
	 * @returns {Promise<Object>} Raw `api_response` envelope from `data_manager.request()`.
	 *   Shape: `{ result: true, data: { jsonrpc, id?, result?, error? }, mcp_session_id? }`.
	 * @throws {Error} On proxy failure or if the MCP server returns a JSON-RPC error object.
	 */
	async _send_request(method, params={}, is_notification=false, _is_retry=false) {

		this._request_id++

		const envelope = {
			jsonrpc	: '2.0',
			method	: method,
			params	: params
		}

		if (!is_notification) {
			envelope.id = this._request_id
		}

		const body = {
			action	: 'mcp_proxy',
			dd_api	: 'dd_mcp_api',
			options	: envelope
		}

		// Attach the cached session ID to all requests except the initial handshake.
		// The PHP proxy will forward it as the `Mcp-Session-Id` HTTP header so the
		// MCP server can locate the existing agent context without re-negotiation.
		if (this._session_id && method !== 'initialize') {
			body.mcp_session_id = this._session_id
		}

		const api_response = await data_manager.request({
			body	: {
				...body
			}
		})

		if (api_response.result === false) {
			const err_msg = api_response.msg || 'MCP proxy request failed'
			// auto-recover stale session once
			if (
				!_is_retry &&
				this._session_id &&
				err_msg.includes('No valid MCP session ID provided')
			) {
				// The PHP session was recycled. Drop the stale ID, re-handshake, then
				// replay the original request. The `_is_retry` guard ensures we only
				// attempt this recovery path once per call — a second failure propagates
				// as a hard error to avoid an infinite retry loop.
				this._session_id = null
				this._write_session_id(null)
				this._initialized = false
				await this.initialize()
				await this.send_notification('notifications/initialized')
				return this._send_request(method, params, is_notification, true)
			}
			throw new Error(err_msg)
		}

		// Persist a newly issued session ID so future page loads can skip the
		// initialize handshake as long as the PHP session stays alive.
		if (api_response.mcp_session_id) {
			this._session_id = api_response.mcp_session_id
			this._write_session_id(this._session_id)
		}

		const mcp_response = api_response.data || {}

		// A JSON-RPC 2.0 error object means the MCP server understood the request
		// but rejected it (e.g. unknown tool, bad arguments, tool execution failure).
		// Surface it as a thrown Error so callers can handle it uniformly.
		if (mcp_response.error) {
			throw new Error(
				'MCP error [' + mcp_response.error.code + ']: ' + mcp_response.error.message
			)
		}

		return api_response
	}//end _send_request



	/**
	 * _READ_SESSION_ID
	 * Reads the persisted MCP session ID from sessionStorage.
	 *
	 * Uses a try/catch to handle environments where sessionStorage is unavailable
	 * (private-browsing restrictions, sandboxed iframes, unit-test runners).
	 *
	 * @returns {string|null} The stored session ID string, or null if not set
	 *   or if sessionStorage access throws.
	 */
	_read_session_id() {

		try {
			return window.sessionStorage.getItem('dedalo_mcp_session_id')
		} catch(e) {
			return null
		}
	}//end _read_session_id



	/**
	 * _WRITE_SESSION_ID
	 * Persists the MCP session ID to sessionStorage for cross-navigation reuse.
	 *
	 * Passing `null` effectively clears the stored value (sessionStorage stores
	 * the string `'null'`). (!) Callers in the stale-session recovery path pass
	 * `null` explicitly to invalidate the cached ID before re-initializing.
	 *
	 * Errors are silently ignored (same rationale as `_read_session_id`).
	 *
	 * @param {string|null} session_id - Session ID to store, or null to clear.
	 * @returns {void}
	 */
	_write_session_id(session_id) {

		try {
			window.sessionStorage.setItem('dedalo_mcp_session_id', session_id)
		} catch(e) {}
	}//end _write_session_id



	/**
	 * IS_INITIALIZED
	 * Returns whether the MCP handshake has been completed for this instance.
	 *
	 * Used by `ai_assistant._initialize_mcp()` to short-circuit redundant
	 * `initialize()` + `notifications/initialized` round-trips when the client
	 * already has a live session.
	 *
	 * @returns {boolean} True after a successful `initialize()` call; false before
	 *   or after a stale-session reset.
	 */
	is_initialized() {
		return this._initialized
	}//end is_initialized



	/**
	 * GET_CAPABILITIES
	 * Returns the capability object negotiated during `initialize()`.
	 *
	 * The shape is defined by the MCP server (`result.capabilities` in the
	 * initialize response). Currently stored for future feature negotiation but
	 * not actively inspected by the client.
	 *
	 * @returns {Object|null} Server capability descriptor, or null before
	 *   `initialize()` has completed successfully.
	 */
	get_capabilities() {
		return this._capabilities
	}//end get_capabilities



}//end mcp_client class
