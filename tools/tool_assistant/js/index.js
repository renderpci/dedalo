// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * TOOL_ASSISTANT — module entry point
 *
 * Public surface for the AI Assistant tool. The Dédalo JS loader resolves tools
 * by their class name (matching the `dd1326` "tool name" component value stored in
 * the ontology, here "tool_assistant"). This file is the canonical ES-module entry
 * point that the loader imports; the single named export MUST be `tool_assistant` so
 * `instances.js` can find it via dynamic import + destructuring.
 *
 * The tool opens as a modal (register.json `open_as: "modal"`) and surfaces as a
 * section toolbar button through the dd128/dd64/dd153 relations declared in
 * register.json. Rendering, model lifecycle, MCP connectivity, and conversation
 * persistence all live in the sibling modules:
 *   - tool_assistant.js       — constructor + prototype (init, build, config resolution)
 *   - render_tool_assistant.js — UI scaffolding and `edit` view
 *   - ai_assistant.js         — inference engine wrapper (WebGPU / WASM / server API)
 *   - model_engine.js         — Transformers.js pipeline management
 *   - mcp_client.js           — MCP (Model Context Protocol) client for Dédalo tools
 *   - client_tools.js         — tool-call handlers exposed to the LLM
 *   - client_context.js       — current-record context injected into the system prompt
 *   - conversation_store.js   — IndexedDB-backed thread persistence
 *   - chat_render.js          — message bubble rendering and Markdown display
 *   - markdown.js             — lightweight Markdown → HTML converter for chat output
 *
 * @module tool_assistant
 */

// import
	export { tool_assistant } from './tool_assistant.js'