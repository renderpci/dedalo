# Performance metrics

> See also: [Runtime & request-scoped context](runtime_and_workers.md) · [Testing](testing.md)

!!! warning "Not ported to the TS server"
    The PHP work system carried a dedicated performance-diagnostics subsystem — a
    `metrics` aggregation class (`core/common/class.metrics.php`) plus a
    `performance_monitor` request monitor — that recorded per-subsystem timings
    (search, ontology, DB reads/writes, tools, datalist, save, …) into the debug
    log and a dashboard. **The TypeScript/Bun server does not implement this
    subsystem.** There is no `metrics` module, no `performance_monitor`, no
    `add_metric` / `observe_max` recording API, and no per-subsystem debug-log
    breakdown. This page documents the honest gap and what latency signal the TS
    runtime *does* carry.

    Do not confuse this with the **area dashboard** activity metrics
    (`src/core/area/dashboard.ts` — `metric_total` / `metric_activity_30d`): those
    are a *data-domain* feature (record counts and activity charts per section)
    and are ported. They are unrelated to the developer-facing performance
    diagnostics described here.

## What exists today

### Per-request latency handle

Every request carries a start timestamp. `RequestContext` (in `src/server.ts`)
records `startedAt: performance.now()` when the context is created, so any code
holding the context can compute wall-clock latency:

```ts
export interface RequestContext {
    readonly requestId: string;   // for log correlation
    readonly startedAt: number;   // performance.now() at request start
}
```

This is a single per-request wall-clock, not a per-subsystem breakdown. There is
no accumulation of `*_total_time` / `*_max_time` / `*_slow_calls` counters across
the subsystems the way the PHP `metrics` class produced them.

### Parity harness as a comparative benchmark

Because the differential harness (`test/parity/`) replays identical RQOs against
both the PHP oracle and the TS server (see [Testing](testing.md)), it is the
practical place to observe relative performance — the TS server's headline design
goal is *lower* latency than sequential PHP (resolve independent components /
subdatums with `Promise.all`, parallel per-section `UNION` branches, in-process
structure-context caching). A parity test can time both calls and compare, but
this is measurement-in-a-test, not a shipped metrics facility.

### Postgres-level timing

Slow-query investigation currently leans on the database itself (Postgres
`EXPLAIN ANALYZE`, `pg_stat_statements`) rather than an in-process
`exec_search` / `exec_write` split. The read/write classification the PHP
`matrix_db_manager` did (counting mutations as `exec_write`, reads as
`exec_search`) has no TS counterpart yet.

## If the subsystem is reintroduced

Should a per-subsystem performance facility be built for the TS server, the PHP
design remains a good reference for *what to measure* — the concepts below are
preserved for that purpose. The key structural difference is that PHP recorded
into process-global statics that had to be reset every request; a TS
reimplementation must instead hang its counters off the request-scoped context
(or an `AsyncLocalStorage` scope), consistent with the
[request-scoped runtime discipline](runtime_and_workers.md) — never module-level
mutable statics.

### Metric groupings worth reproducing

The PHP `metrics` class bucketed timings by subsystem; the same buckets map
cleanly onto the TS engines:

| Group | TS engine it would time |
|-------|--------------------------|
| Search | the SQO → SQL builders (`src/core/search/`) |
| Ontology load | ontology reads (`src/core/db/dd_ontology.ts`) |
| Matrix load | matrix reads (`src/core/db/matrix.ts`) |
| Read exec / Write exec | the split between `SELECT`/`WITH` and `INSERT`/`UPDATE`/`DELETE` on `src/core/db/postgres.ts` |
| Structure context | `src/core/resolve/structure_context.ts` |
| Data (components) | per-component resolution in `src/core/section/read.ts` |
| Datalist | option-list resolution (`src/core/resolve/`, `src/core/relations/datalist.ts`) |
| Section / record save | `src/core/section/record/save_component.ts` |

### Tail latency

The single most useful signal the PHP design captured — beyond totals — was
**tail latency**: the slowest single call (`*_max_time`) and the count over a
slow threshold (`*_slow_calls`). A moderate `exec_write_total_time` hiding one
180 ms write is invisible in a total but obvious in the max. Any TS
reimplementation should keep that per-call-max idea rather than only summing.

## See also

- [Runtime & request-scoped context](runtime_and_workers.md) — the `RequestContext`
  and why counters must be request-scoped, not process-global.
- [Testing](testing.md) — the differential harness, the practical place to
  observe relative TS-vs-PHP latency today.
