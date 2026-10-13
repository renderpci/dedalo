# WC-2026-10-11-relation-reads-client-page — the relation doors page a CLIENT window: bounded, visibly

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, Step 8 READ-4, lane 1).
- **Decision:** ONE page primitive (`clampClientPage`, `src/core/concepts/sqo.ts`) bounds
  every client window that reaches the relation sink, at the door AND at the wire; the sink
  renders only a window it can name. DEC-07 (one ceiling law) applied to the three doors
  that had escaped it.
- **Shape before:**
  - `read` with `source.action` `get_relation_list` / `related_search`
    (`section/read_facade.ts`): an absent limit AND `limit: 0` meant **all** referencing
    records (PHP `set_limit(0)`); a string (`'all'`) reached the SQL as `LIMIT NaN`; the
    offset passed raw (`1e21` → `OFFSET 1e+21`). Both were a raw Postgres **500**.
  - `get_indexation_grid` (`api/handlers/dd_core_api.ts`): `rqo.sqo` forwarded raw — an
    absent limit 500 rows, any other value unbounded, `'all'` a 500.
  - `rqoSchema.sqo` admitted any number or short string as `limit`, any number as `offset`.
  - The generic section read clamped the offset to `>= 0` but not above (`1e21` → 500).
- **Shape after:**
  - **Relation doors** — limit: absent / `null` / `0` / `'all'` / negative / non-numeric /
    above the ceiling → `DEDALO_SEARCH_CLIENT_MAX_LIMIT`; offset: integer in
    `[0, MAX_SAFE_INTEGER]` (`1e21` → past the end → an **empty page**, 200). When a value
    the client SENT was changed, the ok envelope carries ONE notice
    `{code:'search.page_clamped', details:{door, requested, applied}}`. An ABSENT limit
    (these doors used to mean "all" by it) carries the notice exactly when the default CUT
    something THE CALLER COULD PAGE TO — ANY referencing record past the served page (same
    locators, owning-section axis and order) is one the caller may see, the probe SCOPED
    (AUTHZ-05) exactly like the page. Not only the next window: the doors cut before
    scoping, so a whole window may be hidden from a non-admin with visible records after it.
    The probe therefore asks the WHOLE tail ONE question in SQL, never reads it: the sink's
    rows past the page (`search_related.ts` `findInverseReferencesPast`) go through
    `security/record_scope.ts` `anyRowInScope` — the distinct sections the tail lands in,
    judged by the section read grant, then one `EXISTS` joining each granted section's
    records under the list's own record predicate (`sql_assembler.ts`
    `buildAnyRowInScopeSql`: projects filter / owner rule, the dd478 allow-list, the Users
    root exclusion), equal record by record to `scopeInverseReferenceHits`. Bounded whatever
    the tail: a fixed number of statements, each returning at most one row per section (a
    global admin: one `EXISTS`). An earlier draft read the tail window by window, which for
    a non-admin whose tail is hidden was a deep-OFFSET read per window. An absent limit whose answer is whole carries none (the client toasts
    every notice). Scoped, the notice discloses nothing the caller cannot already ask (request the
    next page); an unscoped probe counted references in sections and projects the caller
    cannot reach (a binary search on the offset read the exact unscoped total).
  - **get_indexation_grid** — same bound and the SAME notice rule; its door default (500,
    itself clamped) applies to an absent limit, which carries the notice exactly when that
    default cut something the caller could page to (any group past the page, the grid's own
    question, grouped by section_top and scoped like the grid — `indexation_grid.ts`
    `indexationRowsPast`: the breakdown's tail, `findInverseReferenceLocatorsPast`, projected
    onto its section_top in SQL and asked through the same `anyRowInScope`; a section_top id
    that is not a strict integer names no record there, so the probe may miss a notice on
    malformed data, never claim a hidden record); a sent value that was changed
    carries it
    always. The thesaurus client always sends `limit: 200` with a paginator, so it never
    sees the defaulted case.
  - **component_relation_index cells** (`relations/models/relation_index.ts`) — the inverse
    page an emitted cell reads (`ddo.limit` ?? the component's edit / list-cell limit) goes
    through `clampClientLimit`, whatever its source: a section read's literal
    `show.ddo_map` wins, so that ddo's `limit` is client-reachable, and the ddo schema
    admits any non-negative integer (`limit: 9007199254740991` read and emitted every
    inverse locator). Over the ceiling (or `0`, which rendered ONE row) → the ceiling, logged;
    the cell's `pagination` names the limit applied beside the full total. Portal ddo limits
    are untouched (they page the record's own locators; `limit: 0` = all for tool_print).
  - **Wire** — `rqoSchema.sqo` is `wireSqoSchema`: a present limit comes out an integer in
    `[1, ceiling]`, a present offset an integer in `[0, MAX_SAFE_INTEGER]`; `null` / absent
    are kept as sent (session-SQO merge and read-mode defaults key on "absent"). The window
    as sent rides the parsed SQO under a non-enumerable symbol, so a door's notice still
    names what was asked.
  - **Sink** (`search/search_related.ts` `pageWindow`) — NaN, ±Infinity, a non-numeric
    string or a value past `MAX_SAFE_INTEGER` is a typed **400** `search.invalid_sqo`
    naming the value; every value a server caller passes (`false`, numeric strings, `0`,
    over-ceiling ontology limits) renders exactly as before.
  - **AUTHZ-05 note:** on the relation doors the caller's projects scope applies AFTER the
    window, so a non-admin's page may hold fewer rows than the limit while more pages
    exist — a short page is not the end; page by offset until an empty one.
- **Client:** `relation_list` "show all" and the header open already send an explicit
  bounded limit (`sqo_limit.js`); the tools that send none (`tool_tr_print`,
  `tool_transcription`, `tool_numisdata_epigraphy`) now get the ceiling — plus the notice
  only when a record was left out — instead of everything; follow-up: page them
  explicitly.
- **Reason:** a client window is a request for ONE page; a door that read "absent" as "all"
  made the Referencias panel and the tools' related listings an unbounded read on a large
  host (and a raw 500 on a malformed value), and the client could not tell a truncated
  answer from a complete one. The notice is the visible half of DEC-07.
- **Gate reconciliation:** no fixture edit, no re-harvest — `indexation_grid_differential`
  pages at limit 200 / explicit small windows, which are served as sent (no notice); the
  retired relation_list differential's twin is `relation_list_grid_native`, updated here.
  Gates: `test/unit/client_page_doors_native.test.ts` (door set DERIVED at run time —
  every non-mutating door is driven under the query tap, a door reaching the sink must
  declare `page:'client_sqo'` in `SECTION_READ_ROUTES`; every hostile window a bounded 200
  with the notice, the same rule on all three doors; an absent limit whose answer is
  whole — a full last page, a short page — without it; a NON-ADMIN who may read the host
  but none of the referencing records gets no notice where the admin is owed one (the
  probe is scoped); a non-admin whose next window opens on a hidden record, or is WHOLLY
  hidden, with a visible record behind it IS owed it (the probe looks past the next window);
  a non-admin's default page over a hidden tail of 250 records (far past the old 64 ×
  limit window) costs exactly the statements and rows of one over a four-record tail, and a
  visible record after that tail is still found (the probe is bounded); the set-shaped
  scope answers record by record what `scopeInverseReferenceHits` answers (projects, section
  grant and dd478 halves each deciding a cell);
  a request narrowed to a second referencing section whose own rows are whole gets none
  while the unnarrowed one does (the probe asks the page's question); a ddo-borne
  relation_index window is clamped on BOTH emission strategies (no request_config, and its
  own request_config); no statement of the windowed sink
  returns more than the page plus one row), `test/unit/wire_sqo_page_bound_native.test.ts` (every registered
  action's parsed window bounded), `test/unit/search_related_page_window_native.test.ts`
  (the sink's typed refusal), `test/unit/relation_list_grid_native.test.ts` (limit 0 =
  the ceiling, with the notice).
