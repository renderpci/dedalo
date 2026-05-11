<?php declare(strict_types=1);
/**
 * CLASS TOOL_ASSISTANT
 * AI Assistant tool powered by a local language model via Transformers.js.
 *
 * Provides a chat interface that connects to the dedalo-work-mcp server
 * through the dd_mcp_api proxy. The tool is launched from the menu bar
 * and opens a modal chat panel.
 *
 * Key features:
 * - Natural language search and navigation of Dédalo records
 * - Ontology exploration and metadata queries
 * - Record creation and editing with confirmation dialogs
 * - Context-aware system prompts based on active section/component
 * - Configurable local model (Gemma4 7B, Qwen3, etc.) via tool config
 * - WebGPU acceleration with WASM fallback
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_assistant extends tool_common {



	/**
	 * SEC-024: explicit allowlist of methods callable via dd_tools_api::tool_request.
	 * No custom API actions needed; config is read via parent::get_config()
	 * and passed to the JS tool instance through tool_context.
	 */
	public const API_ACTIONS = [];



}//end class tool_assistant