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

## Addendum 2026-08-22 — RAG OFF joins the byte-identical empty set (embed_groups never declines)

**Shape before:** with `DEDALO_RAG_ENABLED` off, `embed_groups` declined like
every other `dd_rag_api` action — `rag.disabled`, HTTP 503.

**Shape after:** it ANSWERS `{groups: []}`, 200, byte-identical to the three
empty cases point 3 already ledgers. RAG-off is therefore a FOURTH member of
that set. Every other action still declines; the kill-switch is unchanged for
them.

**Reason:** the probe is fired by the client on every section list render with
no user act behind it (`view_default_list_section.js` → `render_semantic.js`
`get_embed_groups`). A decline there is an envelope failure, and
`data_manager` publishes `api_error` unconditionally — upstream of the caller's
own `.catch` — so the page-level policy (`'*' → toast`) painted a red
"Semantic search (RAG) is disabled on this server" alert on every navigation,
on installs that deliberately never implemented RAG. It rendered RED despite
`severity:'info'` because `toErrorBody()` does not put `severity` on the wire.
A capability question deserves an answer, not a refusal: the install-level fact
is now stated once, at boot, to the OPERATOR (`src/ai/rag/bootstrap.ts`).

The client side of the same seam: the search instance asks the probe before
resolving a semantic query (`search.js` `exec_search`), so a preset-restored
query on a RAG-less install is dropped silently instead of declining; and the
probe caches an ANSWER only — a failed probe is forgotten and retried, never
frozen into a page-life "no semantic search" (`render_semantic.js`).

**Gate reconciliation:** `test/unit/rag_api.test.ts` — the kill-switch gate now
asserts BOTH halves (every action still declines; `embed_groups` answers), the
answering case proved with a context carrying no principal and no session, the
one shape only the switch-answers-first branch can produce; and the
oracle-shape equality test adds the RAG-off body to its byte-identity chain.
Both mutation-verified (restoring the decline reddens exactly those two).
No fixture impact — unchanged from the entry above.
