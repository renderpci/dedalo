# WC-013 — tool_assistant client goes TS-NATIVE server-driven (the assistant rewrite)

- **Date:** 2026-07-09 (user directive: "rewrite the tool_assistant — a solid
  AI integration with the work MCP"; plan approved same day).
- **Shape before (PHP copy, byte-seeded):** 11 js files. The chat ran a
  CLIENT-side agent loop over either a browser-local ONNX model
  (`model_engine.js`, Transformers.js dynamically imported from the jsDelivr
  CDN) or a direct browser→OpenAI-compatible endpoint fetch; MCP tools were
  executed via `mcp_client.js` → `dd_mcp_api:mcp_proxy`; the system prompt
  lived in client JS; **dd1633 carried server-model `api_url`/`api_key`
  flagged `client:true` — the key was served to every browser** (fixed here).
- **Shape after (TS-native):** 10 js files (~-45% bytes): `model_engine.js`,
  `mcp_client.js`, `client_tools.js` DELETED and `ai_assistant.js` reduced to a
  one-line COMPAT ALIAS (`export const ai_assistant = assistant_controller`) —
  the byte-identical client core opens the edit-menu assistant panel with a
  dynamic `import('.../tool_assistant/js/ai_assistant.js')`
  (`client/dedalo/core/menu/js/view_default_edit_menu.js:588`, same in the PHP
  tree), so the SERVER side keeps that name alive rather than editing `client/`.
  New: `assistant_controller.js` (thin turn driver) + `agent_stream.js` (SSE
  consumer). The chat drives the SERVER agent (`dd_mcp_api:agent_models` /
  `agent_chat_stream` / `agent_apply`): server-side prompt, model catalog
  with egress classes, per-record egress gate, propose→confirm→apply plan
  cards. dd1633 emptied (`{}`); dd1327 → 2.0.0; dd1372 labels updated; the
  jsDelivr CDN dependency is gone.
- **mcp_proxy is UNCHANGED and still gate-covered** (dd_mcp_api.test.ts —
  the literal `'No valid MCP session ID provided'` recovery contract) for the
  PHP tree's tool_assistant copy and external consumers.
- **Why:** browser models are unreliable at tool use; direct browser→LLM
  traffic bypassed audit + egress control; the prompt was frozen in the
  byte-copied client. The `tools/` tree is TS-owned (rewrite/client_seam.md) —
  this divergence is census/registry-level, not a client-copy-rule breach.
- **Gate reconciliation:** `dedalo_files_differential.test.ts` filters
  `/dedalo/tools/tool_assistant/` from BOTH sides of the census compare and
  pins the TS file set explicitly; `tools_register_differential.test.ts` is
  diff-free after the dd1324 registry write (version 2.0.0; PHP must NOT
  re-import tools — rewrite/COEXISTENCE.md); `tool_assistant_register.test.ts`
  (unit) asserts dd1633 stays secret-free.
