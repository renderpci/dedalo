# WC-2026-10-01-identify-vision-grant — a vision-model spend needs the `tool_identify` grant

- **Date:** 2026-10-01 (closure Step 3, TOOLS-4 — the identify GRANT only. **TOOLS-4 stays
  OPEN**: the per-user budget, its ledger, the `tool_rag` grant on the generative RAG doors
  and the metered retrieval embeds are DESIGNED and NOT landed — their own ledger entry
  ships in the same commit as their code, never ahead of it).
- **Decision:** owner decision 2026-09-30 (a grant row + a DB-backed per-user quota +
  conservative budgets); this entry lands the grant for the identify doors, whose grant row
  (`tool_identify`) already ships. Code: `src/core/api/handlers/dd_identify_api.ts`
  (`VISION_SPEND_TOOL`, the `requireToolGrant` seam → `tools/security.assertToolGranted`).
- **Doors:** `dd_identify_api` `get_proposals` when the request names the vision source
  (`source: 'vision'` / `'vision_model'` / `'all'`); `identify_by_image` when the configured
  multimodal encoder is EXTERNAL (`provider.isExternal()`).
- **Shape before:** any caller who could read the section called the vision model, and any
  caller shipped the photograph to an external encoder; the installation's switches were
  the only limit.
- **Shape after:** those two spends answer **403 `tool.not_authorized`** unless the caller's
  profile authorizes `tool_identify` (the dd1067 grant the tool is opened with; no admin
  flag — global admins need the grant too, the superuser -1 has every tool). The refusal is
  thrown after the section read grant and the source parse, BEFORE the profile is loaded,
  the image is embedded or any model is called. `find_matches`, the neighbour vote and a
  LOCAL encoder spend nothing and stay ungranted.
- **Owner review:** `tool_identify` is grant-only (not `always_active`): a profile that
  used the vision source or an external encoder without the grant loses them until granted.
- **Reason:** spend is a resource; a resource has an owner.
- **Gate reconciliation:** no parity fixture covers these doors; no re-harvest. Gate:
  `test/unit/identify_vision_grant_native.test.ts` (the real resolver on the same-grants
  pair that differs ONLY in tool_identify; the registered `get_proposals` door; zero vision
  / encoder calls on every refusal, one on its granted twin; for `source: 'vision'` and
  `'all'`, zero PROFILE LOADS on the refusal and one on the granted twin — the order
  "before the profile is loaded" is gated, so an ungranted caller cannot learn which
  sections carry an identification profile; a local encoder serves the ungranted caller).
