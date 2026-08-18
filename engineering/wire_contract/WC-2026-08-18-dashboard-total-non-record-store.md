# WC-2026-08-18-dashboard-total-non-record-store — a section whose table is not a matrix RECORD store counts as `null`

- **Date:** 2026-08-18.
- **Decision:** none (bug fix; the divergence is the honest half of it).
- **Scope:** `src/core/search/count.ts` (`countSectionRecords`),
  `src/core/db/matrix.ts` (new `isMatrixTable` — the allowlist without the throw),
  observable in `src/core/area/dashboard.ts` (`metric_total`).

## Shape before (PHP)

`count_section_records()` (class.area_common.php:288) nulls only two cases: read
permission `< 1`, and an **untabled** section. A section that DECLARES a table
always ran the SQO count. `dd15` (Time Machine) declares `matrix_time_machine`,
so PHP served a number there — the row count of the whole audit tail, which is
not "records of the section" in any sense the dashboard means.

## Shape after (TS)

`total` is `null` for `dd15`, and for any section whose declared table is not in
`MATRIX_TABLE_ALLOWLIST` (the matrix RECORD tables):

```
{ section_tipo: 'dd15', label: 'Máquina del tiempo', model: 'section', total: null }
```

`null` is the metric's existing "not countable / not accessible" value — the
client already renders it as no badge, so no client change was needed.

## Reason

`matrix_time_machine` is a FLAT column store, read only through the mode `'tm'`
source (`src/core/resolve/read_tm.ts`); it is deliberately absent from the matrix
record allowlist. The TS search assembler asserts that allowlist
(`buildSearchSql` → `assertMatrixTable`, spec §7.6), so counting `dd15` threw
`internal.invariant` — and because the dashboard resolves its sections with
`Promise.all`, that ONE section killed the whole `area_admin` (dd207) autoload:
the area rendered as a page-level error, not a missing badge.

Serving the number PHP served would mean widening the identifier allowlist to a
table with a different shape. The metric's own contract already had the right
answer for "this section has no countable record store": `null`.

## Gate reconciliation

`test/unit/dashboard_non_record_store_count_native.test.ts` — asserts dd15
declares `matrix_time_machine`, that `countSectionRecords` returns `null` for it
while a real section returns a number, and that the dd207 dashboard resolves at
all (the regression). No re-harvest: no read-path fixture carries an area
dashboard payload.
