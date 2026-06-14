# base

> The bootstrap / loader layer (`core/base/`) — the very first Dédalo code to
> run: it registers the class autoloader, installs the error handlers, and
> provides the low-level utilities (file cache, OS/system probing, background
> process tracking) that everything above `common` is built on.

> See also: [Architecture overview](../architecture_overview.md) ·
> [Sections](../sections/index.md) · [Components](../components/index.md)

This page is the **developer reference** for the `base` subsystem. `base` is not
a single class — it is the *bootstrap directory* (`core/base/`) holding the
handful of classes and bootstrap files that load **before** `common` (and
before sections, components, the ontology and the API). If you want the
conceptual model of the whole system first, read the
[Architecture overview](../architecture_overview.md).

## Role

`base` is the foundation layer. When `config/config.php` boots, it pulls in a
short prelude (version constants, the logger, core functions, the DB config,
the `dd_tipos.php` constant map) and then includes
`core/base/class.loader.php`. That file is the heart of `base`: it
**eagerly includes** the rest of the core class graph in dependency order and
then **registers an SPL autoloader** for everything that wasn't pre-included.

Where it sits relative to its neighbours:

| layer | role | loads… |
| --- | --- | --- |
| **config** | environment + constants | …includes `base/class.loader.php` |
| **base** *(this subsystem)* | autoloader, error handlers, low-level utilities | …eagerly includes logger, db, **common**, section, ontology, components, security, search, diffusion, api, tools |
| **common** | the shared object machinery (`common`, `dd_object`, `locator`, `lang`, …) | extended by `section` and every `component_*` |
| **section / component / ontology / api** | the runtime | resolved on demand by the autoloader |

So `base` is *below* `common`: nothing in `base` extends `common`, and
`common` (plus everything above it) is included **by** `base/class.loader.php`.
The classes in `base` are deliberately self-contained — they depend only on a
few global helper functions (`debug_log()`, `logged_user_id()`, `to_string()`,
`safe_xss()`, `get_base_binary_path()`), the `logger` constants and, for two of
them, the DB manager — never on the section/component object graph.

!!! note "No shared base class"
    Unlike `section` or the `component_*` family, the `base` classes do **not**
    share a common ancestor and do not `extend` anything. They are independent
    utility classes (mostly all-static), so this document is a *multi-file
    subsystem* reference, not a single class reference.

## Responsibilities

- **Autoloading** — register the SPL autoloader (`class_loader::loader()`) that
  maps a class name to a file path following Dédalo's directory conventions,
  with a security allowlist on the class name and a resolved-path root check.
- **Eager bootstrap** — `class.loader.php` includes the rest of the core class
  graph (logger, db, backup, common, section, time-machine, ontology, media
  engine, dd_grid, component bases, security, search, diffusion, api, tools,
  shared) in a fixed dependency order.
- **Error handling** — `dd_error` installs the PHP error / exception / shutdown
  handlers and centralises error logging (CLI-aware, debug-aware).
- **File cache** — `dd_cache` provides user-scoped, OPcache-backed file caching
  (`cache_to_file` / `cache_from_file` / `cache_file_exists` /
  `delete_cache_files`) and a background-process variant
  (`process_and_cache_to_file`).
- **Atomic cache serialisation** — `OpcacheObjectManager` turns PHP data into
  minified `<?php return [...];` files written atomically (temp file +
  `rename()` + `opcache_invalidate()`).
- **Background-process registry** — `processes` tracks running background PIDs
  in the `matrix_notifications` table and stops them under an ownership /
  superuser check.
- **System probing** — `system` reports and validates the host environment:
  RAM, CPU MHz, PHP / Apache / PostgreSQL / MariaDB versions, disk info,
  GD/cURL availability, sessions/backup directory checks, and old-file cleanup.

## Files & structure

`core/base/` mixes **class files** (the subsystem proper), **bootstrap
includes** (constants/version), **CLI runners** and **maintenance/migration**
helpers. The six class files are the documented surface; the rest are listed
for orientation.

```text
core/base/
├── class.loader.php              # class_loader — SPL autoloader + eager core bootstrap
├── class.Error.php               # dd_error — error / exception / shutdown handlers
├── class.dd_cache.php            # dd_cache — user-scoped OPcache-backed file cache
├── class.OpcacheObjectManager.php# OpcacheObjectManager — atomic PHP-code serialisation
├── class.processes.php           # processes — background-PID registry (matrix_notifications)
├── class.system.php              # system — host/OS/library probing & checks
│
├── dd_tipos.php                  # bootstrap: defines the DEDALO_*_TIPO constant map
├── version.inc                   # bootstrap: DEDALO_VERSION / DEDALO_BUILD constants
├── dd_init_test.php              # boot-time system integrity check (login/boot)
├── process_runner.php            # CLI entry run in background by exec_::request_cli
├── cache_test_file.php           # test fixture used by the dd_init test sequence
│
├── include/                      # seed SQL + ontology JSON used by install/upgrade
├── update/                       # class.update — data-update runner (updates.php)
├── upgrade/                      # v6→v7 migration helpers (class.v6_to_v7, …)
└── transform_definition_files/   # field-transform definitions (move_lang, move_tld, …)
```

!!! warning "`process` lives in `common`, not `base`"
    `processes::stop()` instantiates a `process` object (`new process()`),
    but the `process` class is **not** in `base` — it is defined alongside
    `exec_` in `core/common/class.exec_.php`. `processes` (in `base`) is the
    DB-backed *registry* of background jobs; `process` (in `common`) is the
    OS-level wrapper that actually checks status and kills a PID. They are
    different classes with similar names.

## The bootstrap sequence

`base` is the point in boot where "Dédalo" stops being a config file and
becomes a running class graph. The order, as included by `config.php` and then
`class.loader.php`:

```text
config/config.php
 ├─ base/version.inc           → DEDALO_VERSION, DEDALO_BUILD
 ├─ logger/class.logger.php    → logger (so debug_log() works immediately)
 ├─ shared/core_functions.php  → global helpers (debug_log, to_string, safe_xss…)
 ├─ config/config_core.php     → core constants
 ├─ config/config_db.php       → DB connection constants
 ├─ base/dd_tipos.php          → the DEDALO_*_TIPO constant map (dd1, dd100, …)
 └─ base/class.loader.php      ← THE base entry point
      ├─ include base/class.Error.php           → dd_error::initialize() runs at file end
      ├─ include base/class.dd_cache.php
      ├─ include base/class.processes.php
      ├─ include base/class.system.php
      ├─ include base/class.OpcacheObjectManager.php
      ├─ include logger/* , db/* , backup/*
      ├─ include common/* (common, lang, locator, dd_object, RQO, SQO, …)
      ├─ include section/* , section_record/* , tm_record/*
      ├─ include ontology/* , media_engine/* , dd_grid/*
      ├─ include component_common/* , component_media_common, component_relation_common
      ├─ include security/* , search/* , widgets/*
      ├─ include (optional) DEDALO_DIFFUSION_CUSTOM , then diffusion/*
      ├─ include api/v1/common/* (dd_manager, dd_core_api, dd_*_api…)
      ├─ include tools/tool_common/* (tool_common, tool_paths)
      ├─ include shared/* (TR, OptimizeTC, subtitles, agent_view_builder)
      └─ new class_loader()  → spl_autoload_register([class_loader,'loader'])
```

Two side effects fire **as files are included**, not when a method is called:

- `class.Error.php` ends with `dd_error::initialize();` — the error handlers are
  active the moment the file is included.
- `class.loader.php` ends with `$autoloader = new class_loader();` — the
  constructor registers the SPL autoloader, so any class **not** in the eager
  include list (most components, areas, tools, diffusion classes) is resolved
  lazily on first use.

!!! note "Eager vs. lazy"
    The bootstrap pre-includes the *hot* core (common, section, the component
    base classes, the API, search, security). Leaf classes — individual
    `component_*` models, areas, tools, `diffusion_*` classes, and a few
    co-located helpers — are left to the autoloader. The commented-out
    `$ar_components` block near the end of `class.loader.php` is the historical
    eager-include list for components, kept disabled because the autoloader now
    handles them.

## The autoloader (`class_loader`)

`class_loader::loader($class_name)` is the SPL callback. It resolves a class
name to a file path with this precedence:

1. **`tool*`** — tool-subsystem infrastructure
   (`tools_register`, `tool_ontology_map`, `tool_security`, `tool_paths`) loads
   from `tools/tool_common/`; any other `tool*` is resolved via
   `tool_paths::get_tool_class_file()` (multi-root, honouring
   `DEDALO_ADDITIONAL_TOOLS`) and falls back to the primary tools root.
2. **`diffusion_*`** — loads from `DEDALO_DIFFUSION_PATH/class.<name>.php`.
3. **co-located helpers** — `ts_node_repository` / `ts_term_resolver` resolve
   into `core/ts_object/`, and `section_map` resolves into `core/section/`
   (these live beside their owner class instead of in their own one-class
   directory).
4. **default** — `DEDALO_CORE_PATH/<name>/class.<name>.php` (the standard
   one-directory-per-class convention components and areas follow).

Two security rails wrap the resolution (tracked as **SEC-048**):

- a class-name allowlist regex (`^[A-Za-z_][A-Za-z0-9_]{0,127}$`) refuses any
  name with path characters before resolution;
- a resolved-path root check (`realpath()` must sit inside one of
  `DEDALO_CORE_PATH` / `DEDALO_TOOLS_PATH` / `DEDALO_DIFFUSION_PATH` /
  `DEDALO_SHARED_PATH` or an additional tools root) refuses an out-of-tree
  include even if a compromised config pointed a `DEDALO_*` constant elsewhere.

A failed resolution `trigger_error()`s with a hint and returns `false`; it does
not throw.

## Public API / Key methods

Grouped by class. *static?* marks class-level (static) methods. All six classes
expose **only** static methods except where noted.

### `class_loader` — autoloader

| method | static? | purpose |
| --- | --- | --- |
| `__construct()` | | Sets `spl_autoload_extensions('.php')` and registers `loader()` with SPL. Auto-instanced at the end of `class.loader.php`. |
| `loader($class_name)` | ✓ | The SPL callback: resolve a class name to a file path (tool / diffusion / co-located / default), enforce the SEC-048 name allowlist and root check, `include` the file. Returns `bool`. |

### `dd_error` — error handlers

| method | static? | purpose |
| --- | --- | --- |
| `initialize()` | ✓ | Configure `error_reporting` per `SHOW_DEBUG`, then register the error / exception / shutdown handlers. Called at file include time. |
| `captureError($number, $message, $file, $line)` | ✓ | `set_error_handler` callback: log a catchable PHP error and stash it in `$_ENV['DEDALO_LAST_ERROR']`. |
| `captureException($exception)` | ✓ | `set_exception_handler` callback: log an uncaught `Throwable` (with a nested-exception guard). |
| `captureShutdown()` | ✓ | `register_shutdown_function` callback: log a fatal error captured via `error_get_last()`. |

> The remaining `dd_error` methods (`log_error`, `handle_nested_exception`,
> `output_cli_error`, `format_error_message`, `get_handler_name`) are
> **private** helpers.

### `dd_cache` — file cache

| method | static? | purpose |
| --- | --- | --- |
| `get_cache_file_prefix()` | ✓ | Build the user-scoped prefix `"{DEDALO_ENTITY}_{user_id}_"` (uses `anonymous` when no user is logged in). |
| `cache_to_file($options)` | ✓ | Write `$options->data` to `{prefix}{file_name}` via `OpcacheObjectManager::save()`. Rejects `file_name` containing `..` or `/`. Returns `bool`. |
| `cache_from_file($options)` | ✓ | Load a cache file via `OpcacheObjectManager::load()`. Returns the cached value or `null`. |
| `cache_file_exists($options)` | ✓ | Test for a cache file without loading it. Returns `bool`. |
| `process_and_cache_to_file($options)` | ✓ | Run a PHP `$options->process_file` (validated to live under `DEDALO_CORE_PATH`/`DEDALO_LIB_PATH`) via `exec()`, redirecting its stdout into the cache file; non-blocking unless `$options->wait`. Returns the last output line or `false`. |
| `delete_cache_files($cache_files=null, $prefix=null)` | ✓ | Delete a named list of cache files, or (when `null`) every file matching the prefix glob. Called on logout for default-prefix files. Returns `bool`. |

> `get_cache_files_path()` is **private**: it validates `DEDALO_CACHE_MANAGER`
> and that the configured `files_path` is a writable directory.

!!! note "Custom prefixes are not auto-deleted"
    Cache files written with the default (user-scoped) prefix are removed on
    logout/quit. If you pass a custom `prefix` (e.g. a shared cache), you own
    its lifecycle — `delete_cache_files()` must be called explicitly.

### `OpcacheObjectManager` — atomic serialisation

| method | static? | purpose |
| --- | --- | --- |
| `generateCode($data)` | ✓ | Turn a PHP value into a minified `<?php return [...];` string (short-array syntax, sparse-key-aware, trailing commas stripped). |
| `save($path, $data)` | ✓ | Atomic write: generate code → write to a random temp file with `LOCK_EX` → `rename()` over `$path` → `opcache_invalidate()`. Returns `bool`. |
| `load($path)` | ✓ | `include` the cached file (so OPcache serves it from shared memory). Returns the data, or `null` when the file is missing. |

> The lookahead helpers `isNextSignificantTokenAnArrow()` and
> `skipToAfterArrow()` are **private**.

### `processes` — background-PID registry

State lives in the `matrix_notifications` table (`PROCESSES_TABLE`), in the
single record `RECORD_ID = 2`, as a JSON array of
`{user_id, pid, pfile, date}` entries.

| method | static? | purpose |
| --- | --- | --- |
| `add($user_id, $pid, $pfile)` | ✓ | Register a process. Locks the row (`SELECT … FOR UPDATE`), de-duplicates by `(pid, user_id)`, `basename()`-sanitises `pfile`, appends and saves. Returns a response object with `result` / `msg` / `data_item`. |
| `stop($pid, $user_id)` | ✓ | Stop a process **after** an authorisation check (must be the logged owner or the superuser — gated by the *session*, not the caller-supplied `$user_id`). Checks OS status via `process`, kills it, and removes the registry entry. Returns a response object. |
| `delete_process_item($pid, $user_id)` | ✓ | Remove one entry from the registry (same session-gated authorisation as `stop()`). Returns `bool`. |
| `get_process_item($pid, $pfile=null)` | ✓ | Look up a registry entry by `pid` (optionally also matching `pfile`) to verify ownership before reading its output. Returns the entry object or `null`. |

!!! warning "Authorisation is session-gated, not parameter-gated"
    `stop()` and `delete_process_item()` derive the privileged path from
    `logged_user_id()` / `DEDALO_SUPERUSER`, **never** from the `$user_id`
    argument (which the caller controls via the RQO). A previous version that
    trusted `$user_id === DEDALO_SUPERUSER` let any logged user stop superuser
    jobs by passing `user_id = -1`. Keep this invariant if you touch these
    methods.

### `system` — host / library probing

The only instance state is the static `system::$info_instance` (a memoised
[Linfo](https://github.com/jrgp/linfo) instance, loaded lazily via Composer).

| method | static? | purpose |
| --- | --- | --- |
| `get_info()` | ✓ | Lazily load Composer's Linfo and memoise the instance. Returns the Linfo object or `null` if unavailable. |
| `get_ram()` | ✓ | Installed physical RAM in GB (`0` if unavailable). |
| `get_mhz()` | ✓ | Max CPU clock in MHz (`null` if unresolved). |
| `get_php_memory()` | ✓ | PHP `memory_limit` in GB. |
| `return_bytes($val)` | ✓ | Convert PHP shorthand memory notation (`512M`, `2G`, `-1`) to bytes. |
| `get_php_user_info()` | ✓ | Resolve the current PHP/OS user. |
| `get_error_log_path()` | ✓ | The active PHP `error_log` path. |
| `test_php_version_supported($min='8.1.0')` | ✓ | Assert the PHP version is `>= $min`. |
| `test_apache_version_supported($min='2.4.6')` | ✓ | Assert the Apache version is `>= $min`. |
| `test_postgresql_version_supported($min='16.1')` | ✓ | Assert the PostgreSQL version is `>= $min`. |
| `get_apache_version()` | ✓ | Probe the Apache (`httpd`/`apache2`) version via shell. |
| `get_postgresql_version()` | ✓ | Probe the PostgreSQL (`pg_config`/`psql`) version via shell. |
| `get_mysql_server()` | ✓ | Detect whether `mariadb` or `mysql` is installed (`null` if neither). |
| `get_mysql_version($server=null)` | ✓ | Probe the MariaDB/MySQL version. |
| `check_gd_lib()` / `check_curl()` | ✓ | Test for the GD extension / cURL availability. |
| `check_sessions_path()` / `check_backup_path()` / `check_directory($name)` | ✓ | Verify (and create if missing) the sessions / backup / a named directory. |
| `check_pgpass_file()` | ✓ | Verify `~/.pgpass` exists with `0600` permissions (fixing them if it can). |
| `delete_old_sessions_files()` | ✓ | Purge session/cache files older than 2 days from `DEDALO_SESSIONS_PATH`. |
| `remove_old_chunk_files()` | ✓ | Move upload chunk `.blob` files older than 12 h to a `to_delete` folder. |
| `get_disk_info()` / `get_disk_free_space()` | ✓ | Report disk layout (per-OS) / free space in MB. |

> The MariaDB/MySQL probing here is **only** for environment reporting and
> version checks. Per the Dédalo v7 rule, PHP never *connects* to MariaDB at
> runtime — all MariaDB data operations go through the Bun diffusion API. See
> [Architecture overview](../architecture_overview.md).

## How it fits with the rest of Dédalo

- **config → base.** `config/config.php` includes
  `base/class.loader.php` after defining the environment constants; that file
  is the single entry point that bootstraps the entire core class graph.
- **base → common.** `common` (and `section`, the component bases, the API,
  search, security, diffusion, tools) is *included by* the loader. Nothing in
  `base` extends `common`; the dependency points strictly upward. See
  [Components](../components/index.md) and [Sections](../sections/index.md) for
  what those layers add.
- **base ← everything (autoload).** Every class not in the eager list reaches
  `base` through `class_loader::loader()` on first reference — every
  `component_*`, every `tool_*`, every `diffusion_*`, areas, and the
  co-located tree/section helpers.
- **dd_cache ↔ OpcacheObjectManager.** `dd_cache` is the policy layer
  (user-scoping, validation, background processing); `OpcacheObjectManager` is
  the mechanism (atomic PHP-code files). The primary consumer is
  `component_security_access` (permission-tree caching); cleanup is wired into
  `login::logout()`.
- **processes ↔ exec_ / process.** `exec_::request_cli()` launches background
  jobs via `process_runner.php`; the `processes` registry records them, and the
  `process` class (in `common`) checks/kills the OS PID.
- **system ↔ dd_init_test / area_maintenance.** `system`'s probes feed the
  boot-time integrity check (`dd_init_test.php`) and the maintenance UI's
  environment report.

## Examples

### Cache an expensive calculation to a file

```php
// write
$options = (object)[
    'data'      => ['users' => $user_list, 'timestamp' => time()],
    'file_name' => 'user_list.php' // no '/' or '..' allowed
];
dd_cache::cache_to_file($options); // -> bool

// read back (returns null on a miss)
$cached = dd_cache::cache_from_file((object)['file_name' => 'user_list.php']);
if ($cached !== null) {
    $users = $cached['users'];
}
```

### Atomic serialisation directly

```php
$path = DEDALO_CACHE_MANAGER['files_path'] . '/my_data.php';
OpcacheObjectManager::save($path, ['a' => 1, 'b' => [10, 20]]);
// my_data.php now contains:  <?php return ['a'=>1,'b'=>[10,20]];
$data = OpcacheObjectManager::load($path); // ['a' => 1, 'b' => [10, 20]]
```

### Register and stop a background process

```php
// register a job in the matrix_notifications registry
$response = processes::add($user_id, $pid, $pfile);
if ($response->result === true) {
    $item = $response->data_item; // {user_id, pid, pfile, date}
}

// stop it later — authorisation is gated by the LOGGED session,
// not by the $user_id argument passed here
$response = processes::stop($pid, $user_id);
// $response->result === true on success (or if already stopped)
```

### Validate the host environment at boot

```php
if (!system::test_php_version_supported('8.1.0')) {
    // halt boot / report unsupported PHP
}
$ram_gb        = system::get_ram();              // e.g. 32
$pg_version    = system::get_postgresql_version();// e.g. '16.2'
$has_gd        = system::check_gd_lib();          // bool
```

!!! note "Accuracy caveats"
    - `processes::add()` references `dd_date::get_timestamp_now_for_db()` and
      `matrix_db_manager` — both defined in layers (`common`, `db`) that the
      loader includes *before* any `processes` method is reached at runtime, so
      the call sites are valid even though `processes` itself is in `base`.
    - The `process` class used by `processes::stop()` is in
      `core/common/class.exec_.php`, **not** in `base` (see the warning above).

## Related

- [Architecture overview](../architecture_overview.md) — the whole-system map
  (work vs. diffusion, the matrix model, the request lifecycle).
- [Sections](../sections/index.md) · [section](../sections/section.md) — the
  table abstraction the loader bootstraps above `common`.
- [Components](../components/index.md) — the field models the autoloader
  resolves on demand.
- [OpcacheObjectManager (development note)](../../development/OpcacheObjectManager.md)
  — the OPcache tuning / mechanism deep-dive for the serialiser used by
  `dd_cache`.
- [Glossary](../glossary.md) — nomenclature (tipo, entity, section_tipo, …).
</content>
</invoke>
