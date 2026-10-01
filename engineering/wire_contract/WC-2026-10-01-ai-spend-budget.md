# WC-2026-10-01-ai-spend-budget — AI spend is granted and metered per user per UTC day

- **Date:** 2026-10-01 (closure Step 3, TOOLS-4 — the BUDGET half; the grant half landed as
  WC-2026-09-30-agent-tool-grant and WC-2026-10-01-identify-vision-grant). Designed
  2026-09-30 (held as WC-2026-09-30-ai-spend-budget, never landed); this entry supersedes
  that draft and lands with its code.
- **Decision:** owner decision 2026-09-30 — a grant row + a DB-backed per-user quota
  (standard Dédalo schema: a section with components, no bespoke table) + conservative
  budgets, stated here for owner review. Code: `src/core/security/ai_spend.ts` (the
  ledger), `src/core/ontology/engine_ontology.{json,ts}` (the ledger's repo-owned
  ontology), `tools/tool_rag/register.json` (the grant row), the doors below.
- **Doors:**
  - `dd_mcp_api` `agent_chat` / `agent_chat_stream`: one RUN + a token reservation (the most
    output a run can produce: the model's per-turn output limit × the loop's 12 turns),
    settled with the run's reported usage.
  - `dd_rag_api` `ask`: the `tool_rag` GRANT first, then one RUN + a token reservation (the
    context budget + the output cap) + one QUERY EMBEDDING. A grounding miss or an egress
    refusal (no model call) refunds the run; the embedding stays charged.
  - `dd_rag_api` `semantic_search` / `retrieve` / `get_agent_context` /
    `search_by_text_image`: one QUERY EMBEDDING each — metered, NOT granted (core search).
  - `dd_identify_api` `get_proposals` with the vision source, `identify_by_image` with an
    EXTERNAL encoder: one VISION call each (granted by `tool_identify`, unchanged).
  - Untouched: `embed_groups` (the capability probe), `similar_to` / `similar_objects` /
    `characterize_object` (stored vectors, no model call), the retrievals the agent makes
    INSIDE a run (part of the run), the RAG indexer (the SYSTEM principal: the
    installation's own work).
- **Shape before:** no budget and no ledger — one session could spend an installation's
  model bill (or its GPU) without bound; any section reader ran the generative `ask`.
- **Shape after:**
  - A RESERVATION before the provider is touched (before an SSE stream opens), in one
    transaction under the (user, day) node lock with the day's row read `FOR UPDATE`.
  - Refusal: **429 `ai.budget_exhausted`**, `details: {budget_kind, limit,
    window_resets_at}` (the next UTC midnight), a JSON envelope — never an opened stream.
  - `ask` without `tool_rag`: **403 `tool.not_authorized`**, before anything is read or
    spent.
  - FAIL CLOSED: the ledger unreadable or its ontology missing → **503
    `ai.budget_unavailable`**; an unmetered spend is never admitted.
  - A settlement (after the provider answered) never fails the request: a ledger failure
    there is logged and leaves the reservation charged. A missing usage report keeps the
    FULL reservation charged.
  - Budgets (catalog, per reservation, `0` refuses every spend of the kind, no unlimited
    value): `DEDALO_AI_USER_DAILY_RUNS` 50, `DEDALO_AI_USER_DAILY_TOKENS` 1000000,
    `DEDALO_AI_USER_DAILY_EMBED_QUERIES` 2000, `DEDALO_AI_USER_DAILY_VISION` 50.
  - Nobody is exempt: root and global admins are metered like everyone.
  - The ledger is the engine-owned section `ddengine1` ("AI usage", under Administration):
    one record per (user, UTC day), counters `ddengine6` runs / `ddengine7` tokens /
    `ddengine8` query embeddings / `ddengine9` vision calls. An administrator reads it and
    may correct it like any section (a correction is never lost to a racing reservation:
    the row lock).
- **The engine-owned TLD (`ddengine`):** its definitions are `engine_ontology.json`,
  materialized at boot (after the migrations), by the installer and by the suite setup
  through the engine's doors (`matrix_ontology` records → `rebuildOntology`). The ontology
  update never touches it (it imports per TLD, and the master serves no `ddengine`). The
  TLD is RESERVED: an installation must not author a thesaurus named `ddengine`.
- **Owner review:** (1) the four budgets; (2) `tool_rag` is a GRANT-ONLY registry row (no
  window of its own, not `always_active`) and NO profile is granted it by an update — every
  profile that should request generated answers must be granted it in the profile editor;
  (3) no exemptions, admins and root included; (4) `characterize_object` makes no model
  call and is neither granted nor metered (the 2026-09-30 draft listed it as generative);
  (5) the agent's internal retrievals ride the run's reservation and are not counted as
  query embeddings; (6) a failed `ask` keeps its run charged (conservative: a throw cannot
  prove the model was not called).
- **Upgrade note (admins):** after updating, grant `Generated answers` (`tool_rag`) to the
  profiles that use the generative answer; the `AI usage` section lists each user's daily
  spend. A pre-existing installation receives the `tool_rag` row with *Register tools*
  (`TOOLS_ENABLE_REGISTRY_IMPORT=true`); until then `ask` refuses everyone.
- **Reason:** spend is a resource; a resource has an owner and a limit.
- **Gate reconciliation:** no parity fixture covers the AI doors; no re-harvest. Gate:
  `test/unit/ai_spend_budget_native.test.ts` (the engine ontology: dd_ontology ≡ the JSON,
  drift-free, idempotent, a damaged node healed, a foreign TLD refused; the ledger: concurrent
  reserves at budget 1 admit one, an administrator's correction survives a racing reserve,
  missing vs reported usage, release, nobody exempt, fail closed; the doors: zero provider
  calls on every refusal, the stream refused as JSON, `ask` granted vs ungranted,
  `embed_groups` untouched, the embed and vision budgets; and — amended 2026-10-01,
  refuter-surviving S2 — the dd_rag_api CENSUS: the door table equals the action registry,
  a door whose model call moved no ledger is red, and every door measured spending an
  embedding is refused at embed budget 1); the grant-only law in
  `test/unit/tools_register_validate.test.ts`.
