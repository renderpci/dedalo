// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// import
	import { assistant_controller } from './assistant_controller.js'



/**
 * AI_ASSISTANT — compatibility entry point (WC-013)
 *
 * The byte-identical client core opens the assistant panel from the section
 * edit menu with a DYNAMIC import of this exact path:
 *
 *   client/dedalo/core/menu/js/view_default_edit_menu.js:588
 *     const { ai_assistant } = await import('../../../tools/tool_assistant/js/ai_assistant.js')
 *     assistant_instance     = new ai_assistant({ tool_config, tool_self })
 *     const chat_ui          = await assistant_instance.build_chat_ui()
 *
 * `client/` is byte-identical to the PHP client and is NEVER edited (the same
 * import exists in the PHP tree's copy of that file): the SERVER side must
 * satisfy the client's contract. So this module keeps the imported name alive
 * while the implementation moved to `assistant_controller` — the server-driven
 * turn controller that replaced the old in-browser engine (the 94 KB
 * orchestration loop, `model_engine.js`, `mcp_client.js`, `client_tools.js`
 * are gone; nothing of them survives here).
 *
 * The two constructor options and `build_chat_ui()` are the whole surface the
 * menu uses (grep `assistant_instance` in that file), and `assistant_controller`
 * exposes both unchanged — so this is an alias, not an adapter.
 *
 * The tool's OTHER entry point (the modal, register.json `open_as:"modal"`)
 * goes through `render_tool_assistant.js`, which imports `assistant_controller`
 * directly and does not need this module.
 *
 * Do not add behavior here. If the panel needs something the controller lacks,
 * add it to `assistant_controller`.
 *
 * @module ai_assistant
 */
export const ai_assistant = assistant_controller
