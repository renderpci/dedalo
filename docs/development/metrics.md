# Performance metrics

> See also: [Runtime & request-scoped context](runtime_and_workers.md) · [Testing](testing.md)

Dédalo carries a deliberately small operational-metrics surface: an in-process counter registry, a structured access log, and one admin-only endpoint that aggregates everything a running server knows about its own load. This page is the developer reference for what is measured, where it is recorded, and how to add a metric of your own.

The design rule is that metrics are **process-lifetime, low-cardinality and cheap**: plain named integers plus a latency aggregate, no persistence, no time series, no per-tipo or per-user label explosion. The counters answer *"is this server healthy and busy right now"* — they are not an analytics store.

!!! warning "Not to be confused with the dashboard's activity metrics"
    The **area dashboard** has its own `metric_total` / `metric_activity_30d`
    values (`src/core/area/dashboard.ts`). Those are a *data-domain* feature —
    record counts and activity charts per section, shown to cataloguers. They are
    unrelated to the developer-facing operational metrics described here.

## The counter registry

`src/core/api/counters.ts` holds the whole facility: a `Map<string, number>` of
named integers, a request-latency aggregate, and a set of named **gauge
providers** that subsystems register at boot.

| Function | Use |
| --- | --- |
| `incrementCounter(name, by = 1)` | bump a named integer |
| `observeRequest(status, ms)` | feed one finished request into the request counters + latency aggregate |
| `recordPoolWait(waitedMs)` | called by the DB layer whenever a query had to **wait** for a pooled connection |
| `registerOpsGauge(name, provider)` | register a live gauge, resolved on demand when the endpoint is read |
| `getCounters()` | snapshot of the plain counters (tests, endpoint) |
| `collectOpsCounters()` | the full aggregated payload the endpoint serves |

The counters that always exist:

| Counter | Meaning |
| --- | --- |
| `requests_total` | every API request that reached dispatch |
| `requests_4xx` / `requests_5xx` | client-error / server-error responses |
| `requests_slow` | responses at or over `config.ops.slowRequestMs` |
| `db_pool_waits` | queries that had to wait for a free pooled connection |
| `db_pool_wait_ms_total` | cumulative milliseconds spent waiting on the pool |

`db_pool_waits` is the one to watch: a healthy server never waits for the pool, so
a rising count means `DB_POOL_MAX` is too small for the concurrency the install
actually sees.

## The access log

`src/core/api/access_log.ts` is called once per request from `dispatchRqo()`'s
logging wrapper — the timing (`startedAt`, `performance.now()`-based) and the
caller identity are already in hand there, so the module only formats and counts.

- When `DEDALO_ACCESS_LOG` is on (`config.ops.accessLog`), it emits **one parseable
  JSON object per line** on stdout, which journald/systemd captures:

    ```json
    {"ts":"…","type":"access","request_id":"…","user_id":1,"api":"dd_core_api::read","status":200,"ms":42.3}
    ```

- **Independently of that flag**, any request at or over `config.ops.slowRequestMs`
  increments `requests_slow` and emits a `[slow-request]` warning line naming the
  API action, the duration, the threshold, the request id and the user. Set the
  threshold to `0` to disable the warning.

Every request — logged or not — feeds `observeRequest()`, so the counters are
always accurate even with the access log off.

## The counters endpoint

`GET /api/v1/counters` (also reachable at `/dedalo/core/api/v1/counters`) serves
the aggregated payload built by `collectOpsCounters()`.

It is **session-gated and global-admin-only**, and it fails **closed as a `404`** —
never a `403` — exactly like every other admin surface, so its existence is not
disclosed to an unauthorized caller. Counters leak operational shape (job names,
load); they never carry record data.

The payload:

```json
{
    "ts": "2026-07-12T10:27:50.000Z",
    "pid": 4711,
    "uptime_s": 86400,
    "rss_bytes": 214958080,
    "process_poison": false,
    "counters": { "requests_total": 19844, "requests_5xx": 0, "db_pool_waits": 0 },
    "requests": { "count": 19844, "avg_ms": 31.7, "max_ms": 1840.2 },
    "media_jobs": { "has_headroom": true },
    "background_jobs": { }
}
```

- `process_poison` mirrors the health latch (`src/core/api/process_health.ts`):
  `true` means `/health` is already answering `503` and the watchdog is about to
  recycle this process.
- `requests.max_ms` is the **tail-latency** signal, and it is the reason the
  aggregate keeps a max rather than only a total: a healthy-looking average can
  comfortably hide one 1.8-second request. Watch `max_ms` and `requests_slow`
  together — the average alone will not tell you the server has a problem.
- Each registered gauge is resolved **best-effort**: a provider that throws
  contributes `{ "error": "…" }` instead of taking the diagnostics endpoint down
  with it, which is precisely when it is needed most.

## Registered gauges

Some subsystems own state the counter registry must not import directly (`core/api`
may not import `src/diffusion` — the boundary tripwire allows exactly two seams).
Those subsystems therefore **register a provider at boot** and the endpoint pulls
from them on read:

| Gauge | Owner | What it reports |
| --- | --- | --- |
| diffusion | the diffusion boot chain in `startServer()` | queue depths |
| `media_jobs` | `src/core/media/jobs.ts` (`mediaJobs.hasHeadroom()`) | whether the supervised media-job manager can take more work |
| `background_jobs` | `src/core/tools/background.ts` (`getBackgroundJobStats()`) | running/queued background tool jobs |

## Slow-query investigation

The counters tell you *that* the server is slow; they do not tell you which SQL is
to blame. There is deliberately no in-process per-statement timing — that work
belongs to the database, which already does it better. Use Postgres itself:
`EXPLAIN ANALYZE` for a suspect query, and `pg_stat_statements` for the ranking
of what actually costs the install its time.

## Adding a metric

1. **A plain counter** — `import { incrementCounter } from '../api/counters.ts'`
   and call it at the event site. Keep the name low-cardinality: `imports_failed`,
   not `imports_failed_<section_tipo>`.
2. **A live gauge** — if the value is *state* rather than an event count (a queue
   depth, a pool size), call `registerOpsGauge(name, provider)` once at boot from
   the subsystem that owns the state. This inverts the dependency, so the counters
   module never has to import the subsystem.
3. **Never a module-level mutable that is keyed by request.** The counter registry
   is process-global on purpose — it aggregates *across* requests and holds nothing
   request-specific. Anything that varies per caller belongs in the request-scoped
   context instead (see
   [Runtime & request-scoped context](runtime_and_workers.md#request-scoped-ambient-state-asynclocalstorage)),
   never in a counter.

## See also

- [Runtime & request-scoped context](runtime_and_workers.md) — where `startedAt`
  comes from and why per-request state must never live at module level.
- [Testing](testing.md) — `resetCountersForTests()` clears the registry between
  tests.
- Operations: `engineering/PRODUCTION.md` (supervision, health, the access-log
  contract).
