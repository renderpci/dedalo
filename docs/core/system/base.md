# base

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [Components](../components/index.md) · [common (engine layer)](common.md)

In the PHP server, `core/base/` was the bootstrap directory: it registered the
class autoloader, ran the dependency-ordered eager include of the whole core class
graph, installed the error/exception/shutdown handlers, and provided the low-level
utilities (OPcache-backed file cache, atomic serialisation, background-process
registry, host/OS probing). Almost all of that is **PHP-runtime machinery that has
no counterpart in the TS server** — a single long-lived Bun process with native
ES-module resolution needs no autoloader, no OPcache, and no worker-boot ritual.

This page maps each `base` responsibility to what replaces it in the TS rewrite,
and is honest about the pieces that are simply **gone** or **not yet ported**.

## Role

There is no `core/base/` directory and no bootstrap subsystem in the TS server.
Where PHP's `config/config.php` pulled in a prelude and then handed control to
`base/class.loader.php` (which eagerly included everything and registered an SPL
autoloader), the TS server boots as an ordinary Bun program:

| PHP `base` role | TS replacement | notes |
| --- | --- | --- |
| SPL autoloader (`class_loader`) mapping class name → file | native **ES-module resolution** (`import` statements) | no name→path resolver, no registration step. |
| dependency-ordered eager include of the core class graph | the module graph itself (each file `import`s exactly what it needs) | resolved by Bun at load, statically. |
| model→class / `$column_map` lookup | the component **registry** (`src/core/components/registry.ts`) + per-model descriptors | one line per model; a load-time integrity check throws on a broken registry. |
| environment + constants bootstrap (`config/config.php`) | `src/config/env.ts` + `src/config/config.ts` | the private `.env` loader and the frozen typed config catalog. |
| process entry / worker boot | `src/server.ts` (`Bun.serve` on a unix socket) | one long-lived process; a per-request `RequestContext` is created here. |
| error/exception/shutdown handlers (`dd_error`) | JS `try/catch` + the API dispatch envelope | no global PHP handlers; see [Error handling](#error-handling). |
| OPcache file cache (`dd_cache` / `OpcacheObjectManager`) | in-memory module-level caches | see the gap note below. |
| background-PID registry (`processes`) | — | not ported (gap). |
| host/library probing (`system`) | partial (`resolve/system_info.ts`, `api/environment_view.ts`) | only the subsets the client needs; see the gap note. |

!!! note "No shared base class, and no bootstrap subsystem"
    PHP's `base` classes were independent all-static utilities that loaded before
    `common`. The TS server has neither a `common` base class (see
    [common — the engine layer](common.md)) nor a `base` bootstrap subsystem: the
    concepts that survive are the config catalog and the process entry point.

## Responsibilities (and where they went)

- **Module loading** — native ES modules. Every symbol is reached by an explicit
  `import`; there is no autoloader, no class-name allowlist to enforce, and no
  resolved-path root check. The whole SEC-048 dynamic-include attack surface
  (a compromised `DEDALO_*` constant redirecting an include) **does not exist** —
  the module graph is static and cannot be redirected at runtime.
- **Registry** — `src/core/components/registry.ts` maps every component `model` to
  its `component_<model>/descriptor.ts` (replacing PHP's autoload-by-name +
  `$column_map`). A boot-time integrity check throws on a duplicate model or an
  alias pointing at a non-existent/storeless model.
- **Config bootstrap** — `src/config/env.ts` reads the private `../private/.env`
  (process env wins), and `src/config/config.ts` builds the frozen, typed config
  catalog once at import. A missing required key throws at boot (`requireEnv`) —
  the same "misconfigured server refuses to start" posture PHP had, expressed as a
  typed catalog rather than `DEDALO_*` constants.
- **Process entry** — `src/server.ts` runs `Bun.serve` on a **unix socket** (the
  reverse proxy owns TCP), and creates a per-request `RequestContext`
  (`requestId`, `startedAt`) threaded explicitly — the one place request identity
  exists.
- **Error handling** — the API dispatch path catches throws and returns the
  standard JSON envelope; audit writes swallow-and-log their own failures. There
  is no global `set_error_handler`/`set_exception_handler`/shutdown handler.
- **Caching** — the few module-level caches (ontology nodes, structure-context
  cores, permission tables) hold request-invariant content; there is no
  OPcache-backed file cache and no atomic PHP-code serialiser (both are PHP
  bytecode-cache mechanisms with no meaning in a JS runtime).

## Files & structure

There is no `base/` directory. The bootstrap-adjacent files are:

```text
src/
├── config/
│   ├── env.ts        # private ../private/.env loader (readEnv / requireEnv)
│   └── config.ts     # the frozen typed config catalog (built once at import)
├── server.ts         # Bun.serve entry (unix socket) + per-request RequestContext
└── core/
    └── components/
        └── registry.ts   # model → descriptor map (replaces autoload + $column_map)
```

!!! note "`../private/` is shared in spirit, separate on disk"
    Like PHP, secrets and per-instance settings live OUTSIDE the web root in a
    sibling `private/` directory. But the two servers **never share config files**
    (spec §5): the TS server reads its own `../private/.env`, not the PHP tree's
    config.

## The bootstrap sequence

Booting the TS server is a plain module load, not an include-and-register ritual:

```text
bun src/server.ts
 ├─ import src/config/config.ts
 │    └─ import src/config/env.ts   → read ../private/.env (requireEnv throws on a missing key)
 │       → build + freeze the config catalog once
 ├─ import src/core/... (the module graph resolves statically as files are imported)
 │    └─ src/core/components/registry.ts runs its load-time integrity check
 ├─ initRagHooks()                  → wire the AI/RAG hooks (Phase 8)
 └─ Bun.serve({ unix: config.server.unixSocketPath, fetch: handleRequest })
```

Two things that PHP did at include time are simply absent:

- **no eager include list** — nothing pre-includes a "hot core"; Bun resolves each
  module the first time it is `import`ed, and the dependency order is the import
  graph itself. The commented-out PHP `$ar_components` eager list has no analogue.
- **no autoloader registration** — there is no `spl_autoload_register`; a missing
  symbol is a static import error at load, not a runtime resolution miss.

## The registry (what replaced the autoloader)

PHP resolved a class name to a file via `class_loader::loader()` with a precedence
chain (tool / diffusion / co-located / default) and two security rails. The TS
server has no such resolver. The equivalent "given a model, find its behavior"
lookup is the **component registry**:

- every component model lives in `src/core/components/component_<model>/descriptor.ts`
  and is imported + listed once in `registry.ts`;
- `getComponentModel(model)` returns the descriptor (`column`,
  `classSupportsTranslation`, `resolveData`, `search`, `alias`, …) the horizontal
  engines read;
- `buildRegistry()` runs at import and **throws** on a duplicate model or an alias
  that points at a non-existent or storeless model — the class of "scattered
  runtime surprise" the PHP autoloader could hit is turned into a boot-time
  guarantee.

Tools and diffusion resolve through their own registries/serving layers
(`src/core/tools/`, `diffusion/api/v1/`), not through a shared class loader.

## Public API / Key methods

The `base` classes' surfaces do not exist. Their conceptual replacements:

### Config (`src/config/env.ts`, `src/config/config.ts`)

| symbol | purpose |
| --- | --- |
| `readEnv(key, fallback?)` | Read one env value (process env > `../private/.env` > fallback). |
| `requireEnv(key)` | Like `readEnv` but throws a clear boot-time error when the key is missing/empty. |
| `config` | The frozen `DedaloConfig` catalog (db, server, menu, tools, media, …) built once at import. |

### Registry (`src/core/components/registry.ts`)

| symbol | purpose |
| --- | --- |
| `getComponentModel(model)` | The descriptor for a component model (undefined for non-component models). |
| `allComponentModels()` | All registered descriptors (coverage/equivalence tests). |

### Process entry (`src/server.ts`)

| symbol | purpose |
| --- | --- |
| `handleRequest(request, context)` | Route one request (health, media, API, raw/environment views, client assets). Kept as a plain function so tests can call it without a socket. |
| `RequestContext` | Per-request state (`requestId`, `startedAt`), created per request and threaded explicitly. |

## Error handling

There is no `dd_error` and no global PHP error/exception/shutdown handler. Instead:

- the API dispatch layer (`src/core/api/dispatch.ts`) wraps handler execution and
  returns the standard `{result, msg, …}` JSON envelope on failure;
- audit writes (`resolve/activity_log.ts`) catch-and-log their own failures so an
  audit write can never break the user action (the PHP posture, preserved);
- uncaught throws surface through Bun's normal process error path.

## Gaps vs PHP `base`

Documented honestly rather than papered over (see
[STATUS.md](../../../rewrite/STATUS.md)):

- **`dd_cache` / `OpcacheObjectManager`** — not ported and not planned as-is.
  OPcache is a PHP bytecode/opcode cache; the TS server caches request-invariant
  data in ordinary in-memory maps (ontology nodes, structure-context cores,
  permission tables) instead of serialising `<?php return […];` files. The primary
  PHP consumer was `component_security_access` permission-tree caching, which the
  TS `security/permissions.ts` handles with its own in-memory cache.
- **`processes` (background-PID registry)** — the `matrix_notifications`-backed
  registry of background jobs is **not ported**. Long-running work in the TS server
  is structured differently; there is no session-gated `stop()`/`delete_process_item()`
  equivalent yet.
- **`system` (host/library probing)** — only the subsets the client needs are
  ported: `resolve/system_info.ts` reports the upload-limit numbers
  (temp dir, max size, chunk size, OCR-engine presence) for the upload/import
  services, and `api/environment_view.ts` serves the developer environment view.
  The broad host report (installed RAM, CPU MHz, Apache/PostgreSQL/MariaDB version
  probes, GD/cURL checks, session/backup directory checks, old-file cleanup) is
  PHP-runtime specific and **not** reproduced.
- **`dd_init_test` boot integrity check** — no direct analogue; boot failures
  surface as `requireEnv` throws and the registry integrity check.

## How it fits with the rest of Dédalo

- **config → everything.** `src/config/config.ts` is the only module the rest of
  the codebase imports configuration from; nothing else reads `process.env` or the
  `.env` file directly. A boot failure here refuses to start the server.
- **registry → the engine layer.** `components/registry.ts` is read by the
  horizontal engines ([common — the engine layer](common.md)): `getColumnNameByModel`
  and `getModelByTipo` in `ontology/resolver.ts`, the relation dispatch in
  `relations/registry.ts`, and the datum emitter in `section/read.ts`.
- **server.ts → the API.** `handleRequest` routes API traffic into
  `core/api/dispatch.ts` (the security gates) and serves the copied client assets
  at the same paths the PHP deployment used, so the client needs no path edits.

## Examples

### Read a required config value at boot

```ts
import { requireEnv, readEnv } from './config/env.ts';

const dbName = requireEnv('DB_NAME');           // throws at boot if unset
const port   = Number(readEnv('DB_PORT', '5432')); // fallback when unset
```

### Resolve a component model's behavior (the registry, not an autoloader)

```ts
import { getComponentModel } from './core/components/registry.ts';

const descriptor = getComponentModel('component_input_text');
descriptor?.column;                    // 'string' (the matrix column it stores in)
descriptor?.classSupportsTranslation;  // true
```

### The process entry (testable without a socket)

```ts
import { handleRequest } from './server.ts';

const context = { requestId: crypto.randomUUID(), startedAt: performance.now() };
const response = await handleRequest(new Request('http://x/health'), context);
```

## Related

- [Architecture overview](../architecture_overview.md) — the whole-system map
  (work vs. diffusion, the matrix model, the request lifecycle).
- [common — the engine layer](common.md) — where the per-element machinery lives
  now that there is no base class.
- [Components](../components/index.md) — the field models the registry maps to
  descriptors.
- [Sections](../sections/index.md) · [section](../sections/section.md) — the table
  abstraction resolved above the config/registry bootstrap.
- [Glossary](../glossary.md) — nomenclature (tipo, entity, section_tipo, …).
