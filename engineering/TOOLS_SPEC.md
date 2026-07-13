# Tools subsystem (TS/Bun engine)

Dédalo **tools** are self-contained mini-applications that extend the core (export,
time machine, transcription, indexation, import, …). This document is the standing
spec for the TS tools subsystem after the tools-architecture rewrite.

## The one rule

**A tool is a self-contained package.** Everything a tool needs lives in one
directory under the repo-root `tools/` tree — its client code, its server code,
and its registration manifest:

```
tools/tool_export/
  register.json        # registration manifest (v7 authoring or column-keyed dump)
  js/  css/  img/      # client assets — served at /dedalo/tools/tool_export/…
  server/
    index.ts           # exports `tool: ToolServerModule` — NEVER served
    …                  # private server helpers
```

The **common machinery** (registry, loader, dispatch, security, config,
registration, and the `tool_common` client base) is NOT a tool — it lives in
`src/core/tools/`. The `tools/` tree contains only tools. Third-party tools drop
a folder into an additional root (see *Roots*) and register it; core is never
edited.

`tools/` is **TS-owned**: it was seeded once from the PHP client tool tree and now
diverges deliberately. `scripts/sync_client.sh` no longer syncs it (only
`client/dedalo/core` + `lib`).

## Server module contract (`src/core/tools/module.ts`)

`server/index.ts` exports `const tool: ToolServerModule`:

```ts
interface ToolServerModule {
  name: string;                               // must equal the dir name, ^tool_[a-z0-9_]+$
  apiActions: Record<string, ToolActionSpec>;  // the remote surface (PHP API_ACTIONS)
  backgroundRunnable?: readonly string[];      // second allowlist for async (PHP BACKGROUND_RUNNABLE)
  isAvailable?: (ctx) => boolean | Promise<boolean>;  // toolbar availability (PHP is_available)
  onRegister?: () => Promise<void>;            // lifecycle hooks — NEVER inside apiActions
  onRemove?: () => Promise<void>;
}
interface ToolActionSpec {
  permission: 'section' | 'section_list' | 'tipo' | 'record' | 'developer' | null;  // declarative gate
  minLevel?: number;                            // dd774 level (1 read / 2 write / 3 admin), default 2
  sectionTipos?: (options) => unknown[];        // REQUIRED for 'section_list': the batch's targets
  handler: (context: ToolActionContext) => Promise<ToolResponse>;
}
```

**`section_list`** is for a BATCH action whose section targets ride *inside* the
payload rather than at the top level — `tool_import_dedalo_csv::import_files` posts
`files[]`, one `section_tipo` per file. `sectionTipos(options)` pulls them out and
`minLevel` is asserted on every one; an empty list or any invalid entry is a denial.
It exists so the check stays DECLARATIVE and therefore still runs **before the
background fork** (gate 7), where a denial is still observable to the caller — an
in-handler loop would be invisible to a `background_running` request. PHP's twin is
the `assert_section_permission` loop at the top of `import_files` (SEC-024 §9.2).

A handler's returned `ToolResponse` **replaces the API envelope wholesale** — the
tool owns its `result` / `msg` / `errors` (and any extra fields, e.g. a streaming
body). There is **no reflection**: a method exists on the API only if it is a
property of `apiActions`, and the handler is a typed function, so PHP's
"public + static + `(object $options)`" gates are structural here.

`tools/tool_dev_template/server/index.ts` is the exemplar (all four permission
kinds + a null-spec action, `backgroundRunnable`, `isAvailable`, lifecycle hooks).

## Dispatch gate chain (`src/core/tools/dispatch.ts`)

`dd_tools_api.tool_request` → `dispatchToolRequest`, PHP's ten gates in order
(the reflection gates are structural, so they collapse into a Map lookup):

1. `options` must be an object;
2. the tool name must match `^tool_[a-z0-9_]+$` (rejected before any lookup);
3+4. the tool must be ACTIVE in dd1324 **and** authorized for the caller
   (`getUserTools`: admins get every active tool; others the profile-granted
   dd1067 set + always_active dd1601 tools);
5. the tool must have a **loaded server module** (PHP class-file resolve);
6. the method must be in `apiActions` (PHP API_ACTIONS allowlist);
7. the declarative permission gate must pass — **before** any background fork;
8. execute directly, or (when `options.background_running === true`) via the
   background executor, which additionally enforces `backgroundRunnable`.

`dd_tools_api.user_tools` returns the caller's authorized toolbar contexts.

## Background execution (`src/core/tools/background.ts`)

A `background_running` request runs the handler inside the **process-job registry**
(`media/jobs.ts` — the same one the AV transcodes and the backup widget use), and
answers immediately with `{job_id, background_job_id, pid, pfile}`.

**Two status wires exist. New consumers use the first.**

- **PUSH (native) — `dd_utils_api::get_job_events`** (`core/api/job_stream.ts`).
  The job runs in the process serving the stream, so a consumer SUBSCRIBES to the
  job record (`mediaJobs.subscribe`) and every state change is pushed the instant it
  happens: no `{pid, pfile}` handle, no re-reading a file on a timer, no 0–1000 ms
  lag. The handle is `job_id` alone. The stream ends on the first `is_running:false`
  frame, and THAT frame's `data` is the handler's return value.
- **POLL (legacy) — `dd_utils_api::get_process_status`**. A faithful port of a PHP
  workaround: PHP forked a detached CLI child that could not talk to the web request,
  so it wrote a JSON "process file" and the web layer TAILED it. `pid` + `pfile` are
  that wire (`pfile` is a BASENAME — the endpoint refuses any separator). Still spoken
  by the AV transcodes and the area_maintenance widgets; kept for them, not extended.

Progress: a handler receives `ctx.publishProgress` under the background executor
(absent in a foreground call). Each payload it publishes replaces the job frame's
`data` and wakes every subscriber — handlers THROTTLE their own rate, because each
publish also rewrites the pfile mirror. `tool_import_dedalo_csv` publishes a typed
`ImportProgressFrame` (`core/tools/import_wire.ts`) carrying `rows_total`, which is
what lets its panel show a real progress BAR rather than a scrolling text line.

- **The handler's `ToolResponse` becomes the job's final payload**, i.e. the terminal
  frame's `data` — which is where the client reads its report from.
- **Ownership.** Job ids are derived (`kind_pid_counter`), so they are guessable: the
  job record carries its `user_id` and the status stream answers only the owner (or a
  global admin). A poll from anyone else gets the same terminal frame a non-existent
  job gets — no existence oracle, no payload. Unowned jobs (AV, backup: operational
  shape only) keep their historical behavior.
- Jobs are IN-PROCESS: they die on server restart (a PHP CLI child survived an Apache
  reload), and they share the registry's concurrency cap with media work.

## Loading (`src/core/tools/loader.ts`)

At first use, the loader scans the roots in priority order, and for every dir
matching `^tool_[a-z0-9_]+$` with a `server/index.ts`, dynamically imports it and
validates the exported `tool` against the contract. First root wins name
collisions (reported). The import specifier is never request-influenced — it is
built from an allowlisted root path + a name that already matched the pattern,
and the canonical path is confined under the root before import (TOCTOU-safe).

**Editing `server/` code requires a server restart** (Bun module cache). Running
the registration widget refreshes the DB registry and rescans for NEW tool dirs,
but does not hot-reload changed modules.

> `bun build --compile` does not see runtime dynamic imports. The project runs
> from source (`bun run src/server.ts`), so this is fine; a compiled deployment
> would need a generated manifest embedding the tool modules (the contract is
> unchanged either way). — ledgered.

## Roots & static serving

Roots come from `paths.ts::getRoots()`: index 0 is the in-repo `tools/`; extra
roots come from `config.tools.additionalRoots` (env `DEDALO_ADDITIONAL_TOOLS`,
JSON `[{path,url}]`). A root that is missing, not a directory, or a system temp
dir is refused. Additional-root URLs must be same-origin (root-relative) — the
browser `import()`s tool JS from them.

`server.ts` serves tool assets via `serving.ts` (before the generic client
handler):

- `/dedalo/core/tools_common/*` → `src/core/tools/client/` (the tool_common client
  base). It lives in CORE, not the tools tree, and is served under a **core URL**;
  every importer (16 core client files + 39 tool client files) points here
  directly (`…/core/tools_common/js/tool_common.js`). The 16 core files are
  PHP-synced, so `sync_client.sh` re-applies the `tools/tool_common/` →
  `core/tools_common/` rewrite after each sync (idempotent) — hand edits are never
  lost.
- `/dedalo/tools/<tool>/*` → the tool's assets over the roots, realpath-confined,
  **refusing the `server/` subtree and any non-asset extension**. `register.json`
  IS servable (public registry data). Everything fails closed (404).

> Inert reference (ledgered): `client/dedalo/core/page/css/main.less` still
> `@import`s the old `tools/tool_common/css/tool_common` path. The TS engine has
> no LESS build step (CSS is pre-compiled and served), so this compile-time import
> is never executed; the served `main.css` already contains tool_common's styles.
> Wire the new path only if a LESS build is added.

The client env exposes `DEDALO_TOOLS_URL` (`/dedalo/tools`) and, for
additional-root tools only, `DEDALO_TOOLS_URLS` (name → base URL);
primary-root tools fall back to the relative path in the client.

## Config (`src/core/tools/config.ts`)

Per-key resolution: install config (dd996 / dd999) → register default
(dd1324 / dd1633) → caller default. Only options flagged `"client": true` reach
the browser (`getToolClientConfig` resolves values; `getToolClientConfigRaw`
keeps the full prop definitions, used by the tool element context). Secrets never
carry a `client` flag. Tool config is per-tool (via the tool context), **not** in
the environment payload.

## Registration (`src/core/tools/register.ts`)

`importTools({dryRun})` scans the roots, parses each `register.json`, detects the
format (`components` key → v6, not supported this wave; `name` key → authoring →
converted; column-keyed → pass-through), validates it (zod for authoring +
`validateRegister` mirroring PHP), and reconciles the dd1324 registry.

**Shared-DB safety.** dd1324 is shared with the live PHP install. `importTools`
defaults to **dry-run** (`config.tools.enableRegistryImport = false`): it
validates every tool and reports, per tool, whether the registry already reflects
its declared identity (empty diff = no-op) — writing nothing. The area_maintenance
"Register tools" widget runs this dry-run.

**Write-parity gate (before enabling writes).** The parity test
`test/parity/tools_register_differential.test.ts` asserts that a TS dry-run import
is a **no-op** against the PHP-populated registry (every seeded tool valid, in the
registry, empty diff). Only after that is green — plus one manual scratch-DB
write-parity run (snapshot dd1324 after a PHP import, reset, TS import with the
flag on, diff normalized only for created dates) — may
`TOOLS_ENABLE_REGISTRY_IMPORT=true` be documented as supported. The write path
(`writeRegistryRecord`) writes the identity columns; the dd1353 simple-tool-object
cache blob and ontology tipo renumeration are ledgered for that milestone.

**TS-only tools (`TS_ONLY_TOOLS`).** A tool that exists ONLY in this engine's
`tools/` tree (no PHP class — e.g. `tool_error_report`, WC-019) can never satisfy
the "in the registry" half of the no-op assertion until its TS-side registration
runs (the Register tools widget with the flag on, once). Such tools are carved
out of that ONE requirement via the named `TS_ONLY_TOOLS` set in the parity test
(each entry cites its WC ledger line, with a staleness self-test); they must
still VALIDATE and, once registered, stay diff-free. PHP-served admins will see
the dd1324 row but the tool fails cleanly there (COEXISTENCE row; PHP must never
re-import tools).

## Section tools ("processes", e.g. oh81 Transcription / oh83 Indexation)

`section_tool` is a virtual ontology model, not a class: a node whose `properties`
bind a tool + custom config/visualization to a target section. The menu builder
(`src/core/api/handlers/menu.ts`) rewrites section_tool nodes for display (tipo/model
swap, enriched tool_config, `self` resolution) — this is the load-bearing path and
is menu-differential-gated. Opening a process renders the target section normally
with the tool config; the client (`section.js`) handles
`config.source_model === 'section_tool'`. A dedicated server read-path
interception (PHP `dd_core_api` model overwrite) is not reachable via the request
shapes tested (PHP returns false/errors for naive get_element_context/read on a
section_tool node) — ledgered.

## Tool element context (open_tool string branch)

When the client's `open_tool` receives a tool NAME string (not a full context
object), it calls `get_element_context` with `source:{model:'tool_x'}` and no
tipo. `dispatch.ts` handles this before the tipo check: it requires the tool to be
authorized, then returns `buildToolElementContext(name)` — the full tool context
(tipo/lang/labels/description/developer + the client-visible `config`). Byte-parity
gated (`test/parity/tool_element_context_differential.test.ts`).

## Scaffolding

`bun run scripts/create_tool.ts --name=tool_x --label="X" [--models=a,b]` copies
`tool_dev_template`, renames identifiers, and writes an authoring-format
`register.json`. The new tool is created but not registered — run the "Register
tools" widget to reconcile it.

## Cache invalidation

`src/core/tools/cache.ts::invalidateAllToolCaches()` is THE single entry point
(clears the registry reader, config caches, paths memo, and the loaded-tools
registry). Call it after any dd1324 / dd996 / dd234 write. The registry reader
also carries a TTL (`config.tools.registryCacheTtlMs`) because the PHP engine
writes those sections without notifying us.

## Migrated endpoints

`tool_export.get_export_grid` and `tool_time_machine.apply_value` (plus
`tool_ontology`, `tool_ontology_parser`, `tool_hierarchy`) now live in their
`tools/<name>/server/` packages. The other ~29 tools have client code present but
no server module yet (a warning at registration, `unauthorized_method` at
dispatch) — each is a drop-in `server/index.ts` away.

## Files

- Machinery: `src/core/tools/{module,types,ontology_map,registry,paths,loader,security,dispatch,config,cache,background,register,register_schema}.ts` + `client/`.
- Serving: `src/core/tools/serving.ts`, wired in `src/server.ts`.
- Dispatch entry: `src/core/api/dispatch.ts` (`dd_tools_api` + the get_element_context tool branch).
- Widget: `src/core/resolve/widget_request.ts` (`register_tools`).
- Tests: `test/unit/tools_{static_serving,loader,security,dispatch,config,background,register_validate}.test.ts`, `test/unit/tool_request.test.ts`, `test/parity/{user_tools,section_tools,component_tools,tool_export,tool_element_context,tools_register}_differential.test.ts`.
