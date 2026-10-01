# WC-2026-09-30-agent-tool-grant — the assistant's HTTP door asks the caller's tool_assistant grant

- **Date:** 2026-09-30 (closure Step 3, SEC-3).
- **Decision:** owner decisions 2026-09-30. Code: `src/core/api/handlers/dd_mcp_api.ts`
  (`gateAgentActions` → `requireAgentAccess`), `src/core/tools/security.ts`
  (`assertToolGranted`).
- **Doors:** every `dd_mcp_api` action — `mcp_proxy`, `agent_models`, `agent_chat`,
  `agent_chat_stream`, `agent_apply` — BY CONSTRUCTION (the exported action map is the
  wrapped one).
- **Shape before:** with `DEDALO_AGENT_HTTP_ENABLED=true`, every logged-in user, whatever
  their profile, ran the agent loop (model spend, record reads through the MCP registry,
  change plans) and the raw MCP bridge. `tool_assistant` is not `always_active`; the
  toolbar hid it from ungranted profiles, the door did not ask.
- **Shape after:** (1) switch off → `request.unknown_action` for everyone (unchanged: the
  assistant's existence does not leak); (2) an authenticated principal; (3) the profile
  authorizes `tool_assistant` → else **403 `tool.not_authorized`**, thrown before the
  handler, so `agent_chat_stream` answers JSON and never opens an SSE stream. Global
  admins are NOT exempt (the tool ACL has no admin flag); the superuser (-1) holds every
  tool. Out of scope: the stdio MCP server (`ai/mcp/server.ts`), which runs as the
  operator's configured service principal.
- **Upgrade note (admins):** a profile must be granted `tool_assistant` in the profile
  editor for its users to keep using the assistant.
- **Reason:** the assistant is a tool; a tool is used by the profiles it is granted to.
- **Gate reconciliation:** no parity fixture covers `dd_mcp_api`; no re-harvest. Gates:
  `test/unit/agent_access_native.test.ts` (derived door list × ungranted non-admin /
  ungranted global admin / granted twin / switch off / refused stream is JSON),
  `test/unit/dd_mcp_api.test.ts` (its user now holds the grant, built through
  `test/helpers/tool_grant_fixture.ts`).
