# WC-054 — Activity (dd542): the list's structural order is served by the `("timestamp", id)` index (2026-07-27)

Born of a production-scale slow-request report on the 32.9M-row / 85 GB
`matrix_activity` (dedalo7_mdcat): searching the **When** column (dd547) hung.
Same shape as WC-053's range-filter barrier — *the column that filters and the
column that sorts are not the same column* — but on the other log, and with a
stronger remedy available.

**Root cause: an abort-early plan flip, not the SQL shape.** Every dd542 list
sort is a unique monotonic key — `id DESC` (the dd549 default: insertion order)
or `section_id <dir>` (the When header; WC-044 maps When → section_id) — and
ordered alone each is index-perfect. The When SEARCH filters `timestamp`, which
neither the `id` PK nor `(section_tipo, section_id DESC)` carries. Above roughly
100k estimated matches the planner therefore drops the `("timestamp", id)`
index and walks the ORDER BY index BACKWARDS with the dates as a Filter, betting
that 30 matches turn up within ~30/selectivity rows:

```
Limit  (cost=0.56..173.48 rows=30)
  ->  Index Scan Backward using matrix_activity_pkey  (cost=0.56..18410763.51 rows=3194075)
        Filter: "timestamp" >= … AND "timestamp" < … AND section_tipo = …
```

That bet assumes the qualifying rows are spread along the key. On an APPEND-ONLY
log they are one contiguous block, so any range that does not touch "now" makes
the scan walk every newer row first — for `When = 2023-06`, ~11.4M rows, each a
heap fetch (the PK index does not carry `timestamp`). The estimates are accurate
(3,194,075 estimated vs 3,207,022 actual); it is the DISTRIBUTION assumption
that is wrong, which is why no amount of ANALYZE helps.

Reachable from the ordinary UI, not an edge case: `builder_date.periodBounds`
expands a partial date to its whole period, so a year-only value is a 12-month
range and year+month a whole month. Only a full `YYYY-MM-DD` stayed under the
flip threshold (~3 weeks of data on this install). `<` / `<=` on an old date is
the worst case; `>=` on a recent one is fast by luck (its matches sit at the
newest end). The implicit default order (`section_id ASC`, for an sqo that omits
`order`) has the same trap seen from the other end — cost 13.6 M, walking from
the OLDEST row.

**The change (SQL only, same rows).** On `matrix_activity` a single
structural-key order is emitted as `"timestamp" <dir>, id <dir>`
(`sql_assembler.timeOrderedLogOrder`), covering the `id` default, the
`section_id` When-header sort, and the implicit no-order default. The existing
`("timestamp", id) INCLUDE (section_tipo, section_id)` index then delivers the
requested order OUTRIGHT — a backward index scan with **no sort node** — so the
cost is O(LIMIT), independent of the range width. Measured on mdcat with the
emitted query (full wide-column select, `LIMIT 30`):

| When search | before | after |
|---|---|---|
| `2023-06-15` (a day) | 1.9 ms | ~1 ms |
| `2023-06` (a month, 3.2M rows) | **>300 s** (statement timeout) | **6.1 ms** |
| `2023` (a year, 6.0M rows) | **>300 s** | **1.4 ms** |
| bare browse, offset 0 | ~11 ms (WC-046) | 0.17 ms |

Why dd542 gets the reorder where dd15 got WC-053's `OFFSET 0` barrier (which
here measures 1.88 s for the month — 300x better than the trap, 300x worse than
this): on dd15, `id` and `timestamp` are two DIFFERENT user-facing columns
(dd1573 Id, dd559 When) and an `id` sort must stay an `id` sort. On dd542 there
is no Id column at all — WC-044 already established that the only sortable
column, When, IS insertion order, so re-expressing it on the timestamp index
changes nothing the user asked for.

**Divergence: equivalent order, not identical.** `timestamp` order ≡ insertion
order ≡ `id` order is WC-044's own invariant (it is what made When → section_id
legal), but it is not exact to the microsecond: measured on the real log, ~7
rows per million are stamped microseconds out of id order (busiest bulk day
2023-06-28: **10 inversions in 1,412,451 rows**, worst 224 µs — concurrent
inserts whose ids were assigned in a slightly different order than their
timestamps). Two sub-millisecond neighbours can therefore swap. The `id`
tiebreaker keeps the pair a UNIQUE total order, so pagination stays stable.

**The deep-page rewrites carry over unchanged.** `singleUniqueKeyOrder` rejects
a two-column clause by design, so the WC-046 late-row-lookup and order-flip had
to be handed the rewrite's key explicitly or every deep page would have silently
dropped back to a plain OFFSET (8.1 s at offset 16 M on the composite order,
measured). `("timestamp", id)` is still a unique total order (`id` alone is), so
both rewrites stay exact: the page is ACQUIRED by `id` — the join back is 1:1 —
while both the inner page and the outer restore ORDER BY the composite, mirrored
together by the flip. Scoped to `matrix_activity`
(`TIME_ORDERED_LOG_TABLES`): `matrix_time_machine` has its own emitter
(`read_tm.ts`) and cannot flatten; every other section is untouched.

### Gate

`test/unit/activity_time_order.test.ts` (the rewrite: dd549 default, When-header
sort both directions, same-direction pair, the date-filtered request that was
reported, the no-order default, plus two negative controls — a jsonb component
sort keeps its sort alias, an ordinary section keeps `section_id`) ·
`activity_deep_offset_flip.test.ts` (extended: the flip/late-lookup page still
equals the ground-truth `ORDER BY <key> DESC LIMIT L OFFSET O` byte-for-byte for
BOTH keys, and now asserts the composite order on both sides of the join, so a
regression to a bare key order fails loudly) · `search_order_id.test.ts`
(retargeted off dd542 onto an ordinary section — it tests the generic `column` /
`component_tipo` convention, which dd542 no longer exhibits; one boundary case
pins the rewrite).

FIXTURE STORE: `activity_read_differential.json` DOES pin a dd542 listing (the
flattened SQL shape itself does not — WC-044). It is NOT edited and needs no
re-harvest: the divergence only exists where `timestamp` and `id` disagree, and
they do not disagree on any non-scale corpus. Verified by ranking every dd542
row both ways on each install DB — `dedalo7ts` (1332 rows), `dedalo7ts_test`
(260), `dedalo7_mdcat_test` (579): **0 inversions, 0 rank differences** in all
three. Only the 32.9M-row `dedalo7_mdcat` log, whose concurrency produced the
microsecond inversions above, orders differently at all.
