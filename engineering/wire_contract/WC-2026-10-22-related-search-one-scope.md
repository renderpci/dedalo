# WC-2026-10-22-related-search-one-scope — the related search answers ONE scoped question, gated on the host

- **Date:** 2026-10-22 (owner decisions 2026-10-21, items 1 "count mode 'related' non-admin" →
  (c) and 3 "Gate B `['all']`" → (a)). Amends `WC-2026-10-11-relation-reads-client-page`
  (its *AUTHZ-05 note* and the probe it describes — see the addendum there).
- **Decision:** DEC-12 (gated: `test/unit/related_scope_equivalence_native.test.ts`).
- **Shape before (TS):**
  - **Gate B** (`api/handlers/dd_core_api.ts` read) checked every `sqo.section_tipo` entry as a
    section grant, the literal `'all'` included. The References panel (`relation_list.js`) and
    its graph (`build_graph_data.js`) send `section_tipo: ['all']` with `mode: 'related'`, so
    every non-superuser read was `403 perm.denied` (`coordinates.section_tipo: 'all'`) while the
    same user's related `count` was `200` (count gated only the host).
  - **Count** (`mode: 'related'`): a global admin got one index COUNT; anyone else got an
    UNBOUNDED owner enumeration (`findInverseReferences`, no limit) read into the process and
    filtered there (`scopeInverseReferenceHits`) — its cost grew with every hidden referrer.
  - **Page** (`get_relation_list` / `related_search`): the window was cut from the UNSCOPED owner
    sequence, then the caller's hidden records were dropped — a non-admin's page held fewer rows
    than the limit while more pages existed, so walking `ceil(total / limit)` pages returned
    FEWER records than the count announced (measured: 3 of 6 at limit 2).
  - **Probe** (`search.page_clamped`, defaulted limit): the unscoped tail past the page, asked
    through `anyRowInScope`.
- **Shape after (TS):**
  - **Gate B, mode `'related'`:** the gate is the HOST locators' sections
    (`sqo.filter_by_locators[].section_tipo`, level ≥ 1 each, else `403 perm.denied` naming the
    host section); the literal `'all'` is skipped ONLY when such hosts exist and all pass. A
    related sqo with no host keeps the literal check. Concrete owning-section tipos are still
    gated as sections. The same host gate (`gateRelatedHosts`) serves read and count. Past the
    gate `'all'` is still no section: a related sqo without a relation route reaches the generic
    search and is refused there (`400 request.invalid_tipo`), for the reader exactly as for the
    admin.
  - **One scoped question:** the page (`findInverseReferences`), the count
    (`countInverseReferences`) and the past-the-page probe (`anyInverseReferencePast`, replacing
    `findInverseReferencesPast`) ask the SAME owner question (`search_related.ts`
    `inverseReferencesQuery`), narrowed IN SQL by the caller's scope —
    `security/record_scope.ts` `rowScopeFor(principal)` → `scopedRows`: the distinct sections
    judged by the section read grant, then the per-record predicate
    (`sql_assembler.ts` `buildRowsInScopeSql`: projects filter / owner rule, dd478 allow-list,
    Users root exclusion — the list's own arms). A global admin is unscoped inside it.
  - **Count:** the scoped owners counted in SQL — one statement returning one row (one per
    section with `group_by: ['section_tipo']`, now ordered by `section_tipo`), plus one
    `DISTINCT section_tipo` statement for the grant leg; same statements and rows whatever the
    number of hidden referrers.
  - **Page:** ordered and windowed AFTER scoping (same order as before: the `'table'` order) —
    a non-admin's page is full while more of their records exist; count == the length of the
    full paged walk.
  - **Probe:** "does the scoped set hold more than `offset + limit` records" — one `EXISTS …
    OFFSET` over the scoped set; true exactly when a further page holds a record for the
    caller.
  - Unchanged: the wire shapes (`{total}`, `{total, totals_group}`, the `{context, data}`
    grid, the `related_search` sections item), the admin's answers, and every system walk
    (no scope passed → the unscoped question, unchanged SQL).
- **Client:** none needed. The panel and the graph now load for non-superusers; the
  paginator's pages are full and its total matches them.
- **Reason:** the owner's premise for the References panel — a reader with read access to a
  record sees who points at it (within their own scope), and the paginator's total is a promise
  the pages keep. An unscoped window plus a JS post-filter broke that promise; an unbounded
  enumeration made a count's cost a function of data the caller cannot see.
- **Gate reconciliation:** no fixture edit, no re-harvest. `related_count_differential` replays
  an admin count (unscoped — unchanged answer; the gate is corpus-red by construction, see its
  header). `client_page_doors_native` (READ-4): the HOST2 past-the-page leg now pins the
  relation doors' SCOPED page (fuller pages; notice exactly when visible records lie past it)
  and keeps the grid's pre-scoping window; its set-shaped leg pins `buildRowsInScopeSql`'s
  KEPT ROWS against the list predicate. `search_related_page_window_native`: the probe equals
  the sink's own cardinality, `countInverseReferences` equals it, both honour the scope.
  `count_native` unchanged in outcome (non-admin total < admin total).
