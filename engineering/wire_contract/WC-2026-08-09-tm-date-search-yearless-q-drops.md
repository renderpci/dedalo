# WC-2026-08-09-tm-date-search-yearless-q-drops — a YEARLESS date q on a `"timestamp"` column drops its clause (PHP built an invalid date literal)

- **Date:** 2026-08-09 (remediation of the 2026-08-09 date-search rebuild —
  audits/2026-08_oh1_beta §5.5).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (tripwire in the same
  change).

## What can now reach this seam

The date-search rebuild taught `NormalizedDate` to distinguish ABSENT from zero
(`year: number | null`, likewise month/day/hour/minute/second), because
`get_final_search_range_seconds` branches on exactly that distinction — `hour: 0`
is midnight, "no hour" is not. A consequence: a CLOCK-ONLY value (`{start:{hour:14}}`,
the shape `date_mode: 'time'` sends) and a MONTH-ONLY value now normalize
successfully instead of being rejected up front. Both then have to be answered on
the two surfaces that compare against a physical `timestamptz` COLUMN rather than
JSONB:

- `search/builders/builder_date.ts` — `matrix_activity` / `matrix_time_machine`;
- `resolve/tm_filter.ts` — the dd15 Time Machine `"timestamp"` column (dd559
  "When"), whose `leaf.q` arrives straight from the client SQO.

## Shape before (PHP)

`trait.search_component_date_tm.php::resolve_date_mode_date_sql_tm` reads
`dd_date::get_shape()`. With no year, `shape->year` is false, so control falls to
the "full date" branch, which builds `$dd_date->get_dd_timestamp("Y-m-d")`. That
method pads each component from its unset field (`class.dd_date.php:727` —
`sprintf("%04d", '')`, `%02d` of `0`), producing the literal **`0000-06-00`**, and
then `strtotime()` of that string is `false`, so the exclusive bound degrades to
`1970-01-02`. The emitted sentence is
`("timestamp" >= '0000-06-00'::date AND "timestamp" < '1970-01-02'::date)`, and
Postgres REJECTS the lower literal (date field value out of range) — the whole
search fails. Recorded from the frozen source as a fossil; there is no live oracle
left to execute it against.

## Shape after (TS)

`timeMachineDatePredicates` returns `null` for a yearless date — "this value has
no expression on a timestamptz column" — and both consumers DROP the clause
(`buildDateFragment` returns `false`; `tm_filter.emitDate` returns `null`, so the
leaf simply vanishes from its `$and` group without zeroing it).

Dropping, rather than throwing, is the date family's established contract for a q
the target column cannot express — the same contract an unparseable plain-text q
already has (`'roma'` typed into a date field contributes nothing to its `$and`,
probed on the live oracle while it existed). It is also the observable behaviour
the engine had BEFORE the rebuild, when a yearless object q failed normalization
outright: no user-visible change, only a case that is now representable and
therefore has to be decided explicitly.

**The decision is taken in ONE place.** `timeMachineDatePredicates` is the single
source of truth shared by both consumers, and `periodBounds` beneath it takes
`year: number` as a required parameter, so a yearless date cannot reach the bound
arithmetic at all. This is the shape of the defect being remediated: the guard
first landed in `builder_date.ts` only, and `tm_filter.ts` — calling the same
exported normalizer with no guard — raised an unhandled `Error` instead, i.e. a
500 from ordinary user input typed into the dd15 "When" field.

## Reason

An archive query that cannot be expressed must answer the rest of the question,
not fail. PHP's alternative here is not a behaviour to port — it is a crash. And
between the two TS options, THROWING was strictly worse than PHP: PHP at least
failed only when the DB rejected the literal, while an unguarded throw fails
before any SQL is built, on input a curator can type by accident.

## Gate reconciliation

`test/unit/search_date_builder.test.ts` → *"yearless date q is DROPPED on every
`"timestamp"`-column consumer"*: clock-only and month-only q on `tm_filter`
(clause dropped, no params bound), a dropped leaf not zeroing its `$and`
siblings, a year-bearing q on the SAME column still building its range, and the
`matrix_activity` twin in `builder_date`. Observed RED with the throw restored —
the two `tm_filter` cases and the `$and` case failed with the unhandled Error,
which is the defect itself.

**No re-harvest.** The frozen store carries no Time Machine or Activity
date-search fixture, and there is no live oracle to diff against.
