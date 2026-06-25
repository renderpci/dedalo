<?php declare(strict_types=1);
/**
 * CLASS TOOL_ASSISTANT
 * AI Assistant tool that provides a natural-language chat interface inside Dédalo.
 *
 * Registered as a section toolbar button (via register.json / dd1340 tool section).
 * When invoked it opens as a modal panel (register.json: `open_as: "modal"`) and
 * mounts the full chat UI built by js/render_tool_assistant.js and orchestrated by
 * js/ai_assistant.js.
 *
 * Architecture overview:
 * - The PHP side is intentionally minimal: no custom API actions are needed because
 *   all interaction happens client-side. Tool configuration (model list, engine list)
 *   is stored in the dd1633 component_json on the tool's own dd1340 record and is
 *   forwarded to the browser as `tool_context` via the parent tool_common::build()
 *   flow. The JS tool_assistant.build() unpacks dd1633 into `self.assistant_config`.
 * - The browser side loads a local ONNX language model via Transformers.js
 *   (WebGPU with WASM fallback) OR routes generation to an external
 *   OpenAI-compatible HTTP API (Ollama, vLLM, LM Studio, etc.) depending on which
 *   model entry in dd1633 is active.
 * - MCP (Model Context Protocol) tool calls are proxied through dd_mcp_api, which
 *   bridges to the dedalo-work-mcp server. The session ID is persisted in
 *   sessionStorage and auto-renewed on stale-session errors.
 * - Client-side tools (`client_*`) run entirely in-browser against data already
 *   loaded in the current record view; they are dispatched synchronously without
 *   any server round-trip.
 *
 * Data shapes:
 * - dd1633 (register.json "Default configuration"): top-level keys are
 *   `engine` and `models`, each stored as `{ value: [...], client: bool }`.
 *   Model entries carry: model_id, label, dtype, device, fallback_device,
 *   max_new_tokens, thinking, thinking_options, and optionally api_url /
 *   api_model / api_key for server-side models.
 * - Conversation history is persisted in localStorage via js/conversation_store.js
 *   (threads keyed by UUID). No Dédalo section record is written per message.
 *
 * Relationships:
 * - extends tool_common (tools/tool_common/class.tool_common.php) — inherits
 *   init(), build(), render(), get_config(), and the SEC-024 API_ACTIONS gate.
 * - js/tool_assistant.js — JS counterpart constructor + prototype chain.
 * - js/ai_assistant.js  — Conversation loop, model/MCP orchestration.
 * - js/mcp_client.js    — JSON-RPC 2.0 MCP proxy client (dd_mcp_api).
 * - js/model_engine.js  — Transformers.js wrapper (WebGPU/WASM) + API bridge.
 * - js/render_tool_assistant.js — Chat UI rendering (mount point).
 * - js/conversation_store.js — localStorage thread persistence.
 * - js/client_context.js / js/client_tools.js — In-browser read/write tools.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_assistant extends tool_common {



	/**
	 * SEC-024: explicit allowlist of methods callable via dd_tools_api::tool_request.
	 * No custom API actions needed; config is read via parent::get_config()
	 * and passed to the JS tool instance through tool_context.
	 *
	 * An empty map means this tool exposes zero server-side endpoints.
	 * All data operations — including MCP tool calls — are routed through
	 * dd_mcp_api (a separate API class), not through dd_tools_api.
	 *
	 * @var array<string> $API_ACTIONS
	 */
	public const API_ACTIONS = [];



}//end class tool_assistant
