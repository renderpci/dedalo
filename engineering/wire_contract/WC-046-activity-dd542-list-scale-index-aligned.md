# WC-046 — Activity (dd542) list at scale: index-aligned structural order + generalized deep-page flip + cached bare total (2026-07-22)

Follow-up to WC-044 on the same 32.9M-row / 85 GB `matrix_activity`. WC-044
flattened the ordered SQL but left three scale defects — the first crippling
EVERY page, not just deep ones. All three rewrites are **wire-identical**
(same rows, same order, same paginated envelope); the internal SQL changes:

- **Structural sort key emitted index-aligned — no `NULLS LAST` (a wire-shape
  SQL divergence from PHP).** `buildOrderClauses` (PHP :274-292 parity) appended
  a blanket `NULLS LAST` to every explicit sort. On the unique structural key
  `section_id` (sequence-backed, 0 nulls) / `id` (NOT NULL) that is a no-op that
  DEFEATS the `DESC` (=NULLS FIRST) list index: the dd542 newest-first list then
  Parallel-Seq-Scans + Sorts the whole table for **every page, including offset 0
  (>60 s measured)**. TS now emits `section_id/id <dir>` with no `NULLS LAST` and
  no section_id tiebreaker (the key is already a unique total order) → index-served,
  **>60 s → ~11 ms**. Wire-identical (no nulls to reorder); jsonb component sorts
  (nullable) keep `NULLS LAST`.
- **Deep-page late-lookup + order-flip generalized to the flattened unique-key
  path** (`sql_assembler.ts`, the matrix_activity twin of `read_tm.ts`
  queryTmRows which owns the multi-tipo `matrix_time_machine` `id`-PK path). A
  far-half page is fetched from the opposite end (last page → OFFSET 0); the key
  pages on a narrow scan, then join back for the wide columns. Applies to a sole
  sort on the `id` PK **or** `section_id` — the dd542 list DEFAULTS to `id DESC`
  (deriveSectionListSqoDefaults; the real slow-request order), while a When-header
  sort maps to `section_id`. Last/far-half page **>5 s → ~64 ms** end-to-end.
  Gated to the bare browse (`whereParts` empty) so the exact row total is cheap
  + cached. (Residual: an `id`-ordered page at the EXACT middle offset still walks
  ~N/2 heap-checked rows — no `(section_tipo,id)` index — but that offset is
  pathological; the far half, i.e. real "jump to last", is index/flip-served.)
- **Bare-browse `full_count` served from a save-event-invalidated cache**
  (`search/bare_count.ts`, scoped to the policy-governed logs) — the paginator
  total drops from a ~2.5 s parallel scan to a cached literal on every list
  paint. `read_tm.ts` owns the `matrix_time_machine` twin (`tmCount`).

Also operational (NOT wire): the dead/redundant PHP-era indexes on both logs are
pruned by the **Database-info maintenance widget → "Optimize tables"** action
(`database_info.optimize_tables` → `db_assets.optimizeTables` → new
`pruneMatrixIndexes`, run on the ACTIVE database before the REINDEX/VACUUM).
The keep/drop policy is `src/core/db/matrix_index_policy.ts` (single source of
truth, per index SIGNATURE not name; conservative — never a constraint/keep/
unclassified/proven-used index). mdcat: activity 9.8→4.0 GB, TM 13→10 GB, ~7.9 GB
reclaimed — every surplus index was maintained on the hottest insert path for a
shape the planner never picks (the WC-044 write-amplification concern, realized).

### Gate

`test/unit/activity_deep_offset_flip.test.ts` (flip page == ground-truth
`ORDER BY <key> DESC LIMIT L OFFSET O` byte-for-byte across shallow / deep /
last / partial / ASC, for BOTH the `id`-PK default order and `section_id`, +
proof the flip engages) · `search_order_id` /
`search_late_row_lookup` (index-aligned structural order, no `NULLS LAST`, no
window) · `matrix_index_policy.test.ts` (prune policy self-consistency) +
`matrix_index_prune.test.ts` (the `pruneMatrixIndexes` executor, dry-run: keeps
every load-bearing index, drops only policy-`drop` ones). Neither `dd542` nor the
flattened shape is in an oracle corpus (WC-044) — no re-harvest.
