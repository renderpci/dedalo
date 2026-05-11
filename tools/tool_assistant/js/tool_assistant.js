// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import { dd_console } from '../../../core/common/js/utils/index.js'
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { common } from '../../../core/common/js/common.js'
	import { tool_common } from '../../tool_common/js/tool_common.js'
	import { render_tool_assistant } from './render_tool_assistant.js'
	import { ai_assistant } from './ai_assistant.js'



/**
 * TOOL_ASSISTANT
 * AI Assistant tool powered by a local language model.
 * Connects to dedalo-work-mcp via dd_mcp_api proxy.
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
 * PROTOTYPE ASSIGNMENTS
 * Extend from tool_common and common
 */
	tool_assistant.prototype.render		= tool_common.prototype.render
	tool_assistant.prototype.destroy	= common.prototype.destroy
	tool_assistant.prototype.refresh	= common.prototype.refresh
	tool_assistant.prototype.edit		= render_tool_assistant.prototype.edit



/**
 * INIT
 * @param object options
 * @return bool common_init
 */
tool_assistant.prototype.init = async function(options) {

	// just delegate to the common tool init; model config extraction happens
	// in build() because `self.config` is only populated there (via autoload).
	return await tool_common.prototype.init.call(this, options)
}//end init



/**
 * BUILD
 * Forces autoload so `tool_common.build` fetches the tool context and fills
 * `self.config` (the dd1633 default configuration, see register.json "dd1633").
 * Once available, we extract the active model and the per-model options list.
 * @param bool autoload
 * @return bool common_build
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
			max_new_tokens	: 2048,
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
		const config			= self.config || {}
		const get				= (key) => config[key] && config[key].value

		const all_engines		= Array.isArray(get('engine')) && get('engine').length > 0
			? get('engine')
			: [default_engine]
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

	return common_build
}//end build