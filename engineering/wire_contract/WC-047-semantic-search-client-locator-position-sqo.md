# WC-047 — Semantic search in the client: `locator_position` SQO order mode + preset `semantic` key + `dd_rag_api embed_groups` (2026-07-22)

ADDITIVE (no PHP counterpart exists — the RAG subsystem is TS-native), ledgered
because all three surfaces are client-visible wire shapes:

1. **SQO order entry `{mode:'locator_position'}`** — orders rows by their
   POSITION in `filter_by_locators` (the semantic-search rank). Emitted by the
   assembler as a `selectExtra` alias (`locator_position_order`) riding the
   component-sort machinery, ids inlined as `Number.isSafeInteger`-validated
   literals (an order-time bind would bind-mismatch the count path, which
   reuses the sqo but emits no ORDER BY). No-op without pins; single-tipo pin
   lists only (loud refusal otherwise). `sanitizeClientSqo` additionally clamps
   `filter_by_locators` to `CLIENT_MAX_LOCATOR_PINS` (1000) with the DEC-07
   loud-clamp convention (hardening — the node ceiling already bounded ≈3.3k).
2. **Search-preset `semantic` key** — the dd625 stored filter value may carry
   `{"semantic":{q,group}}` beside `$and`/`$or`: the LIVE natural-language
   query a preset re-runs on Apply (never the resolved pins/order — freezing
   one user's result set into a shareable record is forbidden by design).
   Old clients ignore the key (`build_dom_group` walks only path/`$` keys).
3. **`dd_rag_api embed_groups {section_tipo} → {groups:[ids]}`** — the client's
   facet selector + semantic-availability gate. Malformed tipo, denied caller
   (`getPermissions(tipo,tipo) < 1`) and not-opted-in are BYTE-IDENTICAL
   `{groups:[]}` — the action is never a section-existence oracle.

Client flow (resolve-once-then-pin): quick input / panel block →
`dd_rag_api semantic_search {query, section_tipo, group?}` → pins + the order
mode → the normal section list renders/pages the ranked set; an SQO-derived
pinned CHIP makes session-persisted pins visible and clearable (pins ride
`SESSION_SQO_MERGE_KEYS` and outlive the page — an invisible pin set was the
adversarial review's top finding).

### Gate

`test/unit/search_locator_position_order.test.ts` (alias shape, end-to-end rank,
count-path regression, windowed-path validity, no-op/multi-tipo/unsafe-id
refusals, clamp) · `test/unit/rag_api.test.ts` (embed_groups oracle-shape
equality) · `test/unit/agent_egress_tripwire.test.ts` (AGENT_TOOLS totality +
contributor rule) · `test/unit/agent_loop.test.ts` (RAG tools scope/group/
dedupe). Not in any oracle corpus — no fixture impact.
