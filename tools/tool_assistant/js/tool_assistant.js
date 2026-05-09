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

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options)

	// extract model config from tool_config
		const config = (self.tool_config && self.tool_config.properties) || {}
		self.assistant_config = {
			model_id			: (config.model_id && config.model_id.value) || config.model_id || 'onnx-community/Qwen3.5-0.8B-ONNX',
			dtype				: (config.dtype && config.dtype.value) || config.dtype || 'q4f16',
			device				: (config.device && config.device.value) || config.device || 'webgpu',
			fallback_device		: (config.fallback_device && config.fallback_device.value) || config.fallback_device || 'wasm',
			fallback_model_id	: (config.fallback_model_id && config.fallback_model_id.value) || config.fallback_model_id || 'onnx-community/Qwen3-0.6B-ONNX',
			max_new_tokens		: (config.max_new_tokens && config.max_new_tokens.value) || config.max_new_tokens || 2048
		}

	return common_init
}//end init



/**
 * BUILD
 * @param bool autoload
 * @return bool common_build
 */
tool_assistant.prototype.build = async function(autoload=false) {

	const common_build = await tool_common.prototype.build.call(this, autoload)

	return common_build
}//end build