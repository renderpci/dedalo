# WC-053 — Time Machine (dd15): sort restriction, id-column resolution, ORDER BY qualification, range-filter barrier + the record-history index (2026-07-25, extended 2026-07-26)

Born of a production-scale slow-request report on the 50.5M-row / 33 GB
`matrix_time_machine` (dedalo7_mdcat): the inspector history
(`dd_core_api::read`, `src=service_time_machine:dd15`) took **11.5 s**. Root
cause was an index gap, not the read shape — `WHERE section_tipo=? AND
section_id=? ORDER BY id DESC LIMIT n` (read_tm.ts `queryTmRows`) had no index
carrying BOTH the scope and the sort key, so the planner could only choose
between reading the record's WHOLE history and top-N sorting it (**4 216 ms** on
a 113k-row record) or walking the section's entire log filtering `section_id`
(**5 954 ms** on the same). Cost scaled with the record's history size, not the
page size, which is why small records never reproduced it.

(Those two figures are on the BLOATED indexes — the state that produced the
incident. A REINDEX of the same rows brings the losing plan to 302 ms; it still
reads all 113 251 rows to return 10, so the shape, and therefore the scaling, is
unchanged. All measurements in this entry are PostgreSQL 18.4.)

Chasing it opened three further defects on the same surface, all of the same
shape — *the column that scopes and the column that sorts are not the same
column* — plus two id/name collisions. Five changes in total:

- **New index (no wire change).** `matrix_time_machine_record_history_idx
  (section_tipo, section_id DESC, id DESC)` — both leading columns
  equality-bound leaves the trailing `id DESC` as the requested order, so a page
  costs 40 index entries + 10 heap fetches: **4 216 ms → 0.29 ms**, flat in
  history size (verified to 433 895 rows). The trailing `DESC` on `section_id`
  makes it a superset of the all-matrix `(section_tipo, section_id DESC)` index,
  which is therefore KEPT (it is the narrowest index for the scoped pagination
  COUNT, index-only, and is asset-provisioned for every matrix table).
  Provisioned in `db_pg_definitions.json` so fresh installs get it.

- **dd15 sort policy (structure-context wire change).** Every dd15 list column
  now emits `sortable:false` EXCEPT Section id (dd1212 → the `section_id`
  column) and When (dd559 → the `timestamp` column) —
  `TIME_MACHINE_SORTABLE_TIPOS`, enforced in `structure_context.resolveSortable`.
  Unlike dd542/WC-044 this is NOT a jsonb-sort problem: dd15 columns map 1:1 to
  real flat columns. It is index DIRECTION — read_tm.ts emits `ORDER BY <col>
  <dir>, id <dir>` while every composite index is `(col, id DESC)`, and a btree
  reads only forwards or backwards, so those sorts degrade to an Incremental
  Sort over a full index scan. Measured on the bare browse (PostgreSQL 18.4),
  bloated → straight after a REINDEX of the same 50.5M rows: What (dd577)
  1 444 → 50 ms, Who (dd578) 7 919 → 721 ms, Process (dd1371) > 25 s →
  **20 406 ms**, Value (dd1574) > 25 s → **14 554 ms** (a parallel seq scan +
  full sort of 50M jsonb). The two allowed columns are index-served with NO
  sort node in both states (1–2 ms), which is why the allowlist is "served
  outright" and not "fast today" — the sort-node columns swing ~29x on index
  bloat alone, on a table where bloat always returns. (Those figures come from a
  NARROW `SELECT id` probe, which an index-only scan satisfies; the emitted query
  selects the wide row including the `data` jsonb, so each sort-node row also
  costs a heap fetch and the real numbers are worse. Ranking is unaffected and
  the exclusions only get safer. The allowed set is dd1573 Id, dd1212 Section id
  and dd559 When, plus the client's built-in Id box.) Columns
  outside `TM_ORDER_COLUMN` entirely — the section's own components as columns in
  the record-snapshot list — also lose the icon; a header click on those
  previously THREW `TM read: order by '<tipo>' is uncovered scope` (a 500), so
  this leg is strictly a repair.

- **The Id columns resolve to their own physical column (bug fix, ROW ORDER
  changes for a given click).** dd15 has TWO id-ish columns and both were
  mis-wired. `TM_ORDER_COLUMN` now maps:
  `dd1573 "Id" → id` (the TM ROW's own PK — it was ABSENT from the map while
  `tm_filter` already resolved it to `id`, so the Id column could be FILTERED but
  not SORTED: a header click fell through to the uncovered-scope throw);
  `section_id → id` (the PSEUDO-column the client's built-in Id box sends —
  `view_default_list_section.rebuild_columns_map` hardcodes `tipo:'section_id'
  // used to sort only`, meaning "the record's OWN id", NOT the literal column.
  In an ordinary section those coincide; on dd15 the envelope addresses each
  snapshot by the TM row PK (`section_id: row.id`), so the box DISPLAYS `id`
  while it SORTED by the caller record's `section_id` — the Id column came back
  `61468923, 4, 38, 28, 1344, 105`, unsorted);
  `dd1212 "Section id" → section_id`, unchanged — it is the CALLER record's id,
  shown in its own column (its lg-spa term is literally "section_id", which is
  how the two got conflated). Each descriptor now sorts by what its column
  displays. dd15-ONLY: in an ordinary section the record's id IS `section_id`,
  and `order_path.ts` keeps encoding that for every `component_section_id`
  column — untouched.

- **`ORDER BY` is TABLE-QUALIFIED (bug fix, no order change).** The select list
  emits `timestamp::text AS timestamp`, and SQL resolves a bare `ORDER BY`
  identifier to the OUTPUT name first — so `ORDER BY timestamp` bound to the
  text projection, not the indexed column, and the When sort became a parallel
  seq scan + top-N sort of all 50.5M rows: **19 583 ms live / 17 863 ms
  measured**. `read_tm.buildTmOrderSql` now emits `tm."timestamp" DESC,
  tm."id" DESC` → the (timestamp, id DESC) index serves it with NO sort node,
  **0.359 ms** (33–110 ms end-to-end through the read pipeline). Same rows in the
  same order: PG renders ISO with trimmed trailing zeros, so fraction digits
  compare lexicographically exactly as numerically — verified identical over the
  first 2000 rows despite 49.6M rows carrying fractional seconds. `timestamp` was
  the ONLY aliased field in that select, which is why only When was affected;
  every column is qualified now so a future alias cannot reintroduce it silently.

- **Range-filter planner barrier (bug fix, no order change).** A RANGE predicate
  (the dd559 When date search) combined with the `id` sort has no index carrying
  both, and the planner walks the `id` PK filtering inline, betting LIMIT lets it
  stop early. On an append-only log the filtered column CORRELATES with `id`, so
  every match sits at the far end: a 2026 When-search discarded **45 992 453** PK
  entries to return 10 rows — 51.2 s at offset 30 and 48.9 s at offset 1000 (so
  NOT the deep-page/WC-046 problem). `queryTmRows` now wraps the page subquery in
  an `OFFSET 0` optimisation barrier when `tm_filter` reports a range predicate
  (`ParamSink.rangePredicate`) AND the order is `id`: the range is scanned
  index-only and top-N sorted — **425 ms / 309 ms**, proven to return the
  IDENTICAL page (same ids, same order) as the unbarriered query. Conditional by
  necessity: an EQUALITY filter is served outright by its `(col, id DESC)` index
  at 4 ms, and barriering it would force a full range scan.

Divergence from the oracle is the `sortable` flag on dd15 columns only. Row
shape and pagination are unchanged; row ORDER changes only where it was wrong —
the two Id descriptors now sort by the column they display.

FIXTURE STORE: the frozen responses DO carry the oracle's dd15 column contexts
with `sortable:true` — `tm_bare_list` (dd559/dd578/dd1772/dd1212/dd1371/dd1574),
`tm_read` (dd1371/dd559/dd578/dd577), `tm_component_history` (dd559/dd578/
rsc1246), `tm_component_value` (dd559/rsc20). They are NOT edited, because no
gate compares that field: every TM differential asserts STRUCTURAL parity (item
and context tipo SETS, envelope row counts — the values are live history, so
exact bytes were never asserted), and the two gates that do read `sortable`
(`list_column_sortable_differential`, `context_differential`) cover no dd15
context. So the recorded bytes stay a faithful record of what PHP served, and
this entry is the sole ledger of the divergence — the same posture WC-044 took
for dd542, which was removed from the sortable differential's SECTIONS list.

### Gate

`test/unit/tm_sort_policy.test.ts` (allowlist is exactly the index-served set;
each meta column's flag; the uncovered-scope leg; dd1573 vs dd1212 resolve to
different physical columns; the Id box's `section_id` pseudo-column resolves to
`id`; every `TM_ORDER_COLUMN` entry is table-qualified with no bare identifier
reachable; the `buildOrderPath` → `TM_ORDER_COLUMN` round-trip agrees per
sortable column; policy is dd15-scoped — an ordinary section's
`component_section_id` still orders by `section_id`) ·
`test/unit/tm_range_filter_barrier.test.ts` (range detection drives the barrier:
dd559 dates flag at year/month/day, dd577/dd578/dd1574 equality and
contains-searches do not, dd1371 flags on `>=` but not `=`, the flag survives
`$or` nesting) ·
`test/unit/matrix_index_policy.test.ts` + `matrix_index_prune.test.ts` (the
index policy that pins the new signature as required/`keep`).

### Index audit (same pass)

`matrix_index_policy.ts` was re-derived from TRACED EMITTERS rather than scan
counts, which corrected three dispositions: `search_default_idx` was `review`
(operator opt-in to DROP) but is the WRITE path's index — the save/delete
backfill probe binds all four leading columns, measured 1.3 ms with it and
**24 941 ms** without on a miss; `bulk_process_id` was `review` on "cold"
grounds but is `bulk_revert`'s only index (cold ≠ dead); `user_id`'s stated
purpose ("per-user audit history") did not exist — its real consumer is the
dd578 Who EQUALITY filter via `tm_filter.emitRelation`. A STATS CAVEAT is
recorded there too: the `drop-dead` gate keys on `idxScan > 0`, and cumulative
stats are LOST on crash recovery / `pg_upgrade` (this cluster came up with
`stats_reset` NULL and every index at ~0 scans while holding 50.5M rows), so on
a freshly restarted server that gate silently stops protecting.
`db_pg_definitions.json` was reconciled with the policy: three asset-provisioned
indexes the policy calls `drop-dead` removed (BRIN `date(timestamp)`, standalone
`lang`, `(section_id, bulk_process_id, section_tipo, tipo, lang)`), two
policy-`keep` indexes added that installs lacked (`(timestamp, id DESC)`,
`(section_id)`), and the invalid `idx_matrix_data_trgm` dropped.
