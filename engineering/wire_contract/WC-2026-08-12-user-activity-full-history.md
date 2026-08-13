# WC-2026-08-12-user-activity-full-history — the user_activity widget reports the user's WHOLE history, not the last 365 days

- **Date:** 2026-08-12 (engineering/TODO.md "component_info (dd128 → dd1537) user
  stats does not work correctly. It only shows the last activity, not the
  expected whole user activity history").
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (gate in the same change).

## What was wrong

`dd1537`'s ontology calls this widget *"a graphic visualization of whole user
activity"*, and the client renders it as one: **Total actions**, **Sections
touched**, **Peak hour**, four charts, no period label anywhere. The window was
nevertheless hardcoded to the last 365 days
(`activityWindow`: `dateIn = today − 1 year`).

Measured on the oral-history archive (2026-08-12, user `dd128/1`):

| | |
|---|---|
| raw `matrix_activity` rows, 2015-12-05 … 2026-05-06 | **284,743** |
| pre-aggregated `dd1521` stats days for that user, 2015 … 2025 | **705** |
| what the widget reported | **21 events** |

Nothing was broken *inside* the pipeline — the whole history was sitting in the
pre-aggregated store, and the widget refused to look at it.

## Shape before (PHP, and TS until now) — three tiers over a fixed window

```
window = [today − 1 year, today]
  tier 1  saved dd1521 rows, window.dateIn … yesterday
  tier 2  + today's raw activity merged on top
  tier 3  if 1+2 produced NOTHING: re-aggregate the whole window from the raw log
```

PHP's optional `options.date_in` / `date_out` never reach the widget through the
`get_widget_data` channel (its `widget_options` bag carries no date keys), so the
365-day default was the only behaviour either engine ever had.

## Shape after (TS) — the span comes from the data

```
bounds = savedStatsDayBounds(userId)        -- min/max dd1530 day, one query

bounds !== null:   saved  = crossUsersRangeData(bounds.firstDay, bounds.lastDay)
                   tail   = raw activity (bounds.lastDay + 1 day … tomorrow)
                   totals = merge(saved, tail)

bounds === null:   totals = raw activity (today − 1 year … tomorrow)
```

Three consequences, all deliberate:

1. **The reported span is the user's own history**, however old. The cost is the
   aggregate the nightly catch-up already built — 705 folded rows for the user
   above, answered in milliseconds.
2. **The tail replaces the "today supplement".** It runs from the day after the
   last SAVED day rather than from today, so days the catch-up has not reached
   yet are no longer invisible. On a healthy install that is one day; on an
   install whose catch-up is behind it is exactly the backlog, which is the data
   the operator is asking about.
3. **Tier 3 is gone as a tier.** "Saved rows exist but fold to zero" no longer
   triggers a second, wider scan — the tail is the only live aggregation and it
   is bounded by the last saved day. The no-saved-history case became its own
   branch and keeps the 365-day bound.

## The duplicate-day rule this uncovered

Reading the whole history made a second defect visible immediately: the widget
reported **41,051** events for a user whose activity log holds **35,123** rows.

A `dd1521` row IS that day's totals, so two rows for one day are two aggregation
RUNS, not two facts — and the writer (`updateUserActivityStats`) resumes from its
newest row and only ever APPENDS, so re-aggregating a user whose old rows were
never swept leaves byte-identical twins behind. Measured on the oral-history
archive: user `dd128/2` has 191 duplicated days out of 416 (the pairs verified
identical by digest).

`crossUsersRangeData` therefore now folds **one row per day, highest `id` wins**
(`DISTINCT ON (day) … ORDER BY day, id DESC`, re-ordered `day, id` for the fold,
so the wire's first-encounter ordering is unchanged). The same four users after
the rule: 269,111 / 31,159 / 15,407 / 3,286 events against logs of 284,743 /
35,123 / 15,844 / 3,286 — every total at or below its log, where one was above.

Two things this does NOT do, deliberately:

- it does not delete the duplicate rows (a read never sweeps the store; the
  writer-side defect keeps its own life);
- it does not fill mid-history gaps. Days the catch-up never aggregated stay
  invisible — the tail read starts after the LAST saved day, not at every hole.
  That is the aggregation's coverage to fix, and it is why the totals above sit
  below their raw logs.

## The one bound that is still imposed, and why

A user with **no** `dd1521` rows has nothing to derive a span from. That branch
keeps `today − 1 year` instead of scanning the actor's whole log, because an
unbounded live aggregation is the exact failure this subsystem was rewritten to
avoid: on the 32.9M-row mdcat log, actor `dd128/2` has 8.1M rows and `count(*)`
alone took 57 s against a 60 s statement timeout (`user_stats.ts`
`aggregateActivity`). The branch logs a warning naming the user and the window,
so the state is visible rather than silent — the answer is "run the catch-up",
not "scan everything on every widget open".

## What does NOT change

- The response shape: still one item per IPO entry,
  `{widget, key, widget_id:'totals', value}` with the canonical
  `{who, what, where, when, publish}` (or `null`). Only the numbers grow.
- `who` stays permanently empty (the stats rows key `relation` per tipo — the
  same dead dimension both engines have).
- The widget stays async: the read-time aggregate still skips it and
  `get_widget_data` is still its only delivery.
- The date arithmetic stays wall-clock in `DEDALO_TIMEZONE` via the UTC-noon
  anchor (`dayAfter` shares it), so the today/tail boundary cannot slip a day on
  a UTC-hosted process.

## Gate reconciliation

`test/unit/user_activity_totals_native.test.ts` — rewritten for the two
branches, with the regression pinned explicitly: a bounds span starting in 2015
must reach `crossUsersRangeData` VERBATIM and must be older than the fallback
window's `dateIn`. Also gated: the tail's start day (`lastDay + 1`), no tail read
when the store is saved through today, an all-zero saved range issuing no second
scan, the null-base merge in the no-history branch, and `dayAfter`'s
month/year/leap rollovers. The `activityWindow` calendar and TZ-pinned subprocess
cases are unchanged — the fallback window still exists and is still what they
describe.

`test/unit/user_stats_range_native.test.ts` — a duplicate-day case (the same day
aggregated twice; the newest run is the one folded), and its dual-form probe
fixture moved to one id form per DAY so that contract is no longer entangled with
the one-row-per-day rule.

`test/parity/get_widget_data_differential.test.ts` needs no edit: its scratch
fixture is one saved stats day two days ago plus one activity row today, so the
saved span is that day and the tail (`day+1 … tomorrow`) still picks the today
row up — the same totals it already pins for each engine.

**No re-harvest.** The frozen store's `get_widget_data` interaction is that same
scratch fixture; no fixture response changes.
