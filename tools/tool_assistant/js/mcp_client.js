// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import { data_manager } from '../../../core/common/js/data_manager.js'



/**
 * MCP_CLIENT
 * Lightweight JSON-RPC 2.0 client for MCP protocol.
 * Routes all requests through data_manager.request() → dd_mcp_api proxy.
 */
export const mcp_client = class mcp_client {



	constructor() {
		this._request_id	= 0
		this._initialized	= false
		this._capabilities	= null
	}//end constructor



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



	async send_notification(method, params={}) {

		try {
			await this._send_request(method, params, true)
		} catch(e) {
			// notifications are fire-and-forget; ignore errors like "already initialized"
		}
	}//end send_notification



	async tools_list() {

		return await this._send_request('tools/list', {})
	}//end tools_list



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



	async _send_request(method, params={}, is_notification=false) {

		this._request_id++

		const envelope = {
			jsonrpc	: '2.0',
			method	: method,
			params	: params
		}

		if (!is_notification) {
			envelope.id = this._request_id
		}

		const api_response = await data_manager.request({
			body	: {
				action	: 'mcp_proxy',
				dd_api	: 'dd_mcp_api',
				options	: envelope
			}
		})

		if (api_response.result === false) {
			throw new Error(api_response.msg || 'MCP proxy request failed')
		}

		const mcp_response = api_response.data || {}

		if (mcp_response.error) {
			throw new Error(
				'MCP error [' + mcp_response.error.code + ']: ' + mcp_response.error.message
			)
		}

		return api_response
	}//end _send_request



	is_initialized() {
		return this._initialized
	}//end is_initialized



	get_capabilities() {
		return this._capabilities
	}//end get_capabilities



}//end mcp_client class