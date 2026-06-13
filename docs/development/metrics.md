# Performance Metrics

Dédalo records lightweight performance metrics so developers can confirm the main
processes run within reasonable timeframes and detect bottlenecks. Metrics are
**developer-facing diagnostics**, not user data: they are gathered only when
`SHOW_DEBUG` (or `SHOW_DEVELOPER`) is active, so there is no cost in production.

## Two systems

| System | Class / file | Scope | Output |
|--------|--------------|-------|--------|
| Subsystem aggregation | `metrics` — `core/common/class.metrics.php` | Per-subsystem totals across the whole request (search, ontology, DB, tools, …) | Debug log block written by `dd_manager` |
| Request monitor | `performance_monitor` — `core/api/v1/json/performance/` | Per-request wall-clock, memory and named checkpoints | Rotating log files + web dashboard |

The two are **bridged**: `performance_monitor::get_metrics()` embeds
`metrics::get_summary()` under a `subsystems` key, so the file log and dashboard
carry the same per-subsystem breakdown as the debug log. `metrics::get_summary()`
is the single source of truth for display.

## The `metrics` class

### Naming convention

The metric name suffix drives how it is reset, recorded and displayed. A metric is a
`public static` property on the `metrics` class:

| Suffix | Type | Meaning |
|--------|------|---------|
| `<group>_total_time` | `float` | accumulated milliseconds (additive) |
| `<group>_total_calls` | `int` | number of invocations |
| `<group>_total_calls_cached` | `int` | invocations served from a cache |
| `<group>_max_time` | `float` | slowest **single** call, in ms (tail latency, **not** additive) |
| `<group>_slow_calls` | `int` | calls over a slow threshold (e.g. `SLOW_QUERY_MS`) |
| `<group>_table_count` / `*_count` | `int` | set-semantics counter (absolute value) |

`reset()` and `get_summary()` discover properties by reflection, so adding a new
metric needs no second list — only the property declaration and a call site.

### Recording API

Always record through these helpers rather than mutating the statics directly:

``` php
// accumulate elapsed ms from a start_time() baseline (for *_time)
$start_time = start_time();
// ... work ...
metrics::add_metric('data_total_time', $start_time);
metrics::add_metric('data_total_calls');            // increment a *_calls / *_cached counter

// increment any integer counter
metrics::inc('search_total_calls');

// accumulate a pre-computed ms value (when the site already measured the elapsed time)
metrics::add_time_ms('search_total_time', $exec_time_ms);

// keep the slowest single call (tail latency)
metrics::observe_max('exec_search_max_time', $exec_time_ms);

// overwrite with an absolute value (set-semantics)
metrics::set('security_permissions_table_count', count($permissions_table));
```

All helpers are guarded by `property_exists()` and silently no-op on an unknown name,
so `observe_max()` / `inc()` for a `*_max_time` / `*_slow_calls` property that a given
subsystem does not declare is safe.

Recording is normally placed inside a `if(SHOW_DEBUG===true)` block at the call site,
following the surrounding code.

### What is measured

`get_summary()` buckets the properties into groups (display order below). A group is
omitted when all its values are zero.

| Group | Prefix | What it times |
|-------|--------|---------------|
| Permissions | `security_permissions` | user permission calculation |
| Tools | `get_tools`, `get_tool_config` | element context tools + tool config resolution |
| Presets (request config) | `presets` | request-config presets |
| Request config | `request_config` | `build_request_config` / `get_ar_request_config` (+ source breakdown: rqo / preset / v6 / v5, and drops) |
| Search | `search` | high-level `search` calls |
| Ontology load | `ontology` | ontology element loads (+ cache hits, and derived cache misses) |
| Matrix load | `matrix` | matrix loads |
| Search exec_search (matrix_db_manager) | `exec_search` | **read** SQL (`SELECT`/`WITH`) execution |
| Search exec_search (dd_ontology_db_manager) | `exec_dd_ontology_search` | ontology DB queries |
| Write exec (matrix_db_manager) | `exec_write` | **write** SQL (`INSERT`/`UPDATE`/`DELETE`) execution |
| Context (all) | `structure_context` | structure context build |
| Data (components) | `data` | per-component `get_data` |
| Datalist (option lists) | `datalist` | option-list resolution for select / radio / check_box / relation (+ cache hits) |
| Section save | `section_save` | section record creation |
| Section record save | `section_record_save` | per-component JSONB persist (`save_key_data`) |
| DB connection | `db_connection` | connection acquisition (+ cache hits) |

> **Reads vs writes.** All SQL flows through `matrix_db_manager::exec_search()` /
> `exec_sql()`. They classify the statement by its leading verb so mutations are
> tracked as `exec_write` instead of being counted as searches — a slow write is
> therefore distinguishable from a slow read.

### Tail latency

Totals hide outliers, but a bottleneck is usually one slow call among many. For the
SQL execution paths, the high-level search and the component save, the metrics also
capture:

- `*_max_time` — the slowest single call (e.g. `exec_write_max_time`).
- `*_slow_calls` — how many calls exceeded `SLOW_QUERY_MS` (DB exec paths).

So a request whose `exec_write_total_time` looks moderate but has
`exec_write_max_time: 180 ms` / `exec_write_slow_calls: 1` immediately reveals a
single dominating write.

### `get_summary()` output

``` php
[
    'groups' => [
        'Search exec_search (matrix_db_manager)' => [
            'exec_search_total_time'  => 132.0,
            'exec_search_total_calls' => 3,
            'exec_search_max_time'    => 120.0,
            'exec_search_slow_calls'  => 1,
        ],
        // … other active groups …
    ],
    'summary' => [
        'time_ms' => 162.0   // sum of every *_total_time only
    ]
]
```

The `summary.time_ms` aggregate sums only cumulative `*_total_time` metrics; the
non-additive `*_max_time` (and the set-semantics `*_table_time`) are excluded.

### Reading the debug log

When `SHOW_DEBUG` / `SHOW_DEVELOPER` is on, `dd_manager::manage_request()` writes the
grouped breakdown to the debug log, followed by:

- **Section record cache** — record-build counters (`section_record`,
  `section_record_data`).
- **Instance caches (hit/miss)** — hit / miss / hit-rate / size for the
  `section_record_instances_cache` and `component_instances_cache` object caches,
  read via the lightweight `getCounters()` (no `serialize()` cost). The heavier
  `getStats()` analytics export remains behind `getAnalyticsStatus()`.
- **Summary** — total server time in ms.

## The `performance_monitor`

A per-request singleton that records wall-clock, memory and named checkpoints, then
writes them to a rotating log read by the dashboard
(`performance/performance_viewer.php`). It is initialized in
`core/api/v1/json/index.php` and records checkpoints `request_parsed`,
`before_dd_manager`, `after_dd_manager`, `before_output`, `after_output`.

Configuration lives in `core/api/v1/json/performance/performance_config.php`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `PERFORMANCE_MONITORING_ENABLED` | `false` | master switch |
| `PERFORMANCE_SLOW_THRESHOLD_MS` | `1000` | flag a request as slow |
| `PERFORMANCE_SAMPLING_RATE` | `1.0` | fraction of requests to monitor (for high traffic) |
| `PERFORMANCE_LOG_DIR` | `…/logs` | log directory |
| `PERFORMANCE_LOG_FORMAT` | `json` | `json` or `text` |
| `PERFORMANCE_LOG_LEVEL` | `all` | `all` / `slow` / `error` |
| `PERFORMANCE_LOG_CHECKPOINTS` | `true` | include per-checkpoint detail |
| `PERFORMANCE_LOG_MEMORY` | `true` | include memory fields |
| `PERFORMANCE_LOG_METADATA` | `true` | include request / response metadata |

## Persistent workers (RoadRunner)

In persistent-worker mode the `metrics` statics survive between requests, so they must
be zeroed each cycle. `worker/class.cache_manager.php` calls `metrics::reset()` (which
reflects over every numeric static) and also resets the `section_record` analytics
counters, preventing cross-request bleed.

## Adding a new metric

1. Declare a `public static` property on `metrics` using the naming convention
   (e.g. `public static float $myop_total_time = 0;` and
   `public static int $myop_total_calls = 0;`).
2. Add a prefix → label entry to the `GROUPS` constant in `class.metrics.php` so it is
   grouped and ordered in the display.
3. Record at the call site (inside a `SHOW_DEBUG` guard) with the helpers above.
4. Add the property to the IDE stub in `stub.php`.

`reset()`, `get_summary()`, the `dd_manager` display and the `performance_monitor`
bridge all pick it up automatically.
