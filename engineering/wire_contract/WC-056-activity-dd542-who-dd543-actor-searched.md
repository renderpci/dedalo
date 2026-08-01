# WC-056 — Activity (dd542) "Who" (dd543): actor searched through an indexed expression (2026-07-27)

The third scale defect on the same 32.9M-row log, and the one that had never
worked: searching Who for a user who left the organization did not return.

**Root cause — no index on `relation`, and none that could carry the sort key.**
The list orders by `("timestamp", id)` (WC-054) while the filter is
`relation @> '{"dd543":[{…}]}'`, so no index carries both; the planner walks the
ordered index with containment as a Filter and stops at the LIMIT. On an
append-only log every row of one actor is a contiguous block, so that walk is
fast only when the actor is ALSO recent. Measured, 25-row page:

| actor | matching rows | no index | GIN(relation) | GIN + `OFFSET 0` barrier | this |
|---|---|---|---|---|---|
| user 3 (last seen 2016) | 1 021 | **>300 s** | 12.5 ms | — | **1.6 ms** |
| user 40 | 52 000 | **>300 s** | **>300 s** | — | **1.1 ms** |
| user 95 | 206 000 | **>300 s** | **>300 s** | 4.4 s | **2.6 ms** |
| user 115 | 2 600 000 | 258 ms | 68 ms | — | — |
| user 2 | 8 100 000 | 90 ms | 90 ms | **69.5 s** | **4.3 ms** |

(Final column measured on the shipped two-column index, `EXPLAIN ANALYZE` of the
emitted query against `dedalo7_mdcat`. Every plan is a plain `Index Scan using
matrix_activity_who_ts_idx` with no sort node — the cost is the page, not the
actor.)

Two candidate fixes were measured and rejected as complete answers. A **GIN on
`relation`** rescues only the RARE actor — the one case the estimate is small
enough for a bitmap scan — and leaves a departed actor with 206k rows timing
out. The **WC-053 `OFFSET 0` barrier** helps that actor (>300 s → 4.4 s) but is
catastrophic for a heavy one (90 ms → **69.5 s**), because it forces a full
8.1M-row bitmap heap scan where abort-early was finding 25 rows immediately.
This filter's selectivity spans four orders of magnitude BETWEEN ACTORS, so no
static plan choice is right for all of them — unlike WC-053's date range, where
one barrier fits.

**The change.** `matrix_activity_who_ts_idx
((relation->'dd543'->0->>'section_id'), (relation->'dd543'->0->>'section_tipo'),
"timestamp" DESC, id DESC)` — leading actor equality leaves the trailing sort
key free, so ONE index answers the filter AND the order, index-served with no
sort node, O(LIMIT) for every actor class. It needs the predicate written as an
equality on the same expression, so `builder_relation` gained an activity twin
(`buildActivityWhoFragment`), exactly as it already had one for
`matrix_time_machine`'s flat `user_id` column. `'*'`/`'!*'` existence stay on the
cheap `?` key test; `!=`/`!==` negate the same expression.

**Scoped, and resting on a gated invariant.** dd542/dd543 only — dd545 What on
the same column, every ordinary section, and the TM twin are untouched and keep
containment. The predicate reads element 0, so it is exact only while a row
carries exactly ONE actor locator: that is how `activity_log.ts` writes, and how
the data reads (2.5M rows sampled on mdcat — 2M newest + 500k oldest — all
`length 1`, all `dd128`). `activity_log_single_actor.test.ts` gates the WRITER,
because a second locator would be invisible to Who search rather than an error.
`section_tipo` is bound explicitly rather than assumed, so a locator addressing
another section can never be a false positive.

**The GIN is restored anyway** (`matrix_index_policy`: `drop-dead` → `keep`,
434 MB, 96 s to build). It is what makes a rare-value search fast for every
OTHER relation component and every other section, and its drop-dead
classification was unsound: the stated reason ("the planner picks the ordered
btree + Filter, never this GIN") described the symptom of the ordering trap, and
the `idxScan > 0` safety gate could not object because this cluster came up with
`stats_reset` NULL — the STATS CAVEAT recorded in that same file, realized. It
is also asset-provisioned for every matrix table
(`all_matrix_relation_gin_idx`), so the prune was dropping an index
`recreateDbAssets` immediately put back.

### Gate

`test/unit/activity_who_expression_search.test.ts` (the emitted predicate for
default/`==`/`!=`/`!==`, bound params not interpolation, malformed locators drop
the clause instead of matching everything, plus three negative controls: dd545
on the same table, dd543 in an ordinary section, and the TM twin all still emit
containment) · `test/unit/activity_log_single_actor.test.ts` (the writer-side
invariant) · `matrix_index_policy.test.ts` + `matrix_index_prune.test.ts` (both
indexes classified `keep`, so "Optimize tables" can no longer drop them) ·
`test/unit/user_stats_paging.test.ts` (the second emitter's paging seam — see the
addendum).

### Addendum 2026-07-30 — a SECOND emitter, and the index now carries writes too

`matrix_activity_who_ts_idx` has **two** dependent emitters, not one. The new one
is `area_maintenance/user_stats.ts` `whoScope`, and it leans on the index HARDER
than the dd542 list does: the list only needs O(LIMIT) paging, while the stats
rebuild walks the actor's whole history in `("timestamp", id)` KEYSET pages —
the trailing sort key is what makes each page an index range scan instead of a
whole-actor bitmap.

Why it exists: `rebuild_user_stats` was written as containment, so its window
bound was a Filter and every run scanned the entire actor. On the 8.1M-row mdcat
actor that died on `DB_STATEMENT_TIMEOUT_MS` (`count(*)` alone: 57 s of a 60 s
ceiling), reported from the running client as a `widget_request` exception. The
same window now aggregates server-side in 127 s over ~82 pages, worst page 5.3 s.

Consequences for anyone touching either side:

- Relaxing the index, the predicate, or the single-actor invariant now breaks the
  maintenance action too — not only the dd542 list. `matrix_index_policy.ts` and
  `db_pg_definitions.json` (`all_matrix_activity_who_ts_idx` `info`) name both.
- The totals payload is UNCHANGED — this is a plan/shape fix, not a wire change.
  Parity was verified against a verbatim replica of the replaced TS row loop over
  6 real mdcat windows (2.6M rows, 135 days): identical per-day dimension maps,
  ORDER included, at page sizes forcing up to 211 pages.
- The first-encounter totals ORDER is carried by `min(id)` per group, because an
  aggregate cannot re-derive it. `user_stats_paging.test.ts` pins that the page
  size is a performance knob and nothing else.

---
