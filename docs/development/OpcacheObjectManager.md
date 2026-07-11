# OpcacheObjectManager (PHP-only, obsolete in the TS server)

!!! warning "Not applicable to the TS server"
    `OpcacheObjectManager` is a **PHP** caching layer. It has **no counterpart in
    the TypeScript/Bun server** and is not ported. This page documents what it was
    and why the TS runtime does not need it.

## What it was (PHP reference)

On the PHP work system, `OpcacheObjectManager` was a high-performance data-caching
layer that serialized complex arrays and objects into minified PHP files. Instead
of JSON or `serialize()`, it wrote the data as **executable PHP code**, so that:

1. **Compilation** — PHP compiled the file into opcodes on first hit.
2. **Persistence** — those opcodes lived in OPcache **Shared Memory (SHM)**.
3. **Retrieval** — subsequent requests read the structure straight from memory,
   skipping the filesystem and the parser.

It existed to keep near-static data (ontology-like structures) hot across the
many short-lived PHP-FPM / RoadRunner request cycles, and depended on OPcache
tuning in `php.ini` (`opcache.enable`, `opcache.memory_consumption`,
`opcache.interned_strings_buffer`, `opcache.validate_timestamps`), on
`__set_state` for object reconstruction, and on an atomic `rename()` +
`opcache_invalidate()` write to avoid race conditions.

## Why the TS server does not need it

The whole premise — accelerate re-hydration of shared data across many separate
PHP process cycles — does not apply to the TS server:

- **A single long-lived Bun process.** Near-static data is loaded once and kept in
  ordinary process memory for the lifetime of the process; there is no per-request
  bootstrap to amortize (see [Runtime & request-scoped context](runtime_and_workers.md)).
- **No OPcache / SHM layer.** Bun has no PHP OPcache; there is nothing to serialize
  into executable code and nothing to invalidate. Config is built once and
  **frozen** (`Object.freeze`); other near-static caches (e.g. the tools registry
  reader) are plain in-memory structures with explicit invalidation.
- **The TS code already notes the absence.** Where the PHP behavior would have been
  relevant (e.g. widget-id resolution), the TS source explicitly records that
  "opcache/realpath resets have no TS equivalent" (`src/core/resolve/widget_request.ts`).

There is nothing to configure, warm up, or maintain for the TS deployment.

## See also

- [Runtime & request-scoped context](runtime_and_workers.md) — how the single Bun
  process keeps near-static data hot without an SHM cache, and how the
  intentionally cross-request caches (frozen config, tools registry) work.
