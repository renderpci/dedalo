# logger

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [section_record](../sections/section_record.md)

The server class `logger` is Dédalo's central logging facade: a small factory/registry over numeric severity levels and pluggable backends, sitting underneath both the `debug_log()` error-log stream and the persisted user-activity audit trail.

This page is the **class-level reference** for the logger subsystem. It covers
the `logger` facade, the `logger_backend` contract, the one shipped backend
(`logger_backend_activity`), the global `debug_log()` helper that consumes the
logger's severity scale, and how all of it is wired up in `config.php`.

## Role

`logger` (in `core/logger/class.logger.php`) is a **static facade** — it has a
private constructor and is never instantiated. It does two things:

1. Defines the **severity scale** as class constants (`DEBUG`, `INFO`, …,
   `CRITICAL`).
2. Implements a tiny **factory/registry** for *backends*: `register()` parses a
   connection string, autoloads and instantiates the matching
   `logger_backend_*` class, and stores it under a name; `get_instance($name)`
   returns it.

The logger does **not** itself write anything. Writing is the job of the
registered backend. There are two independent consumers of the severity scale:

| consumer | what it does | where |
| --- | --- | --- |
| **`debug_log()`** | A global function in `shared/core_functions.php`. Takes a message + a `logger::*` level and writes (or skips) a line to the PHP `error_log`. This is the developer/diagnostic stream. It does **not** go through a backend. | `shared/core_functions.php` |
| **`logger_backend_activity`** | The audit backend. Writes a structured record per user action to the `matrix_activity` section so the back office can show "who did what, where, when". Reached via `logger::$obj['activity']->log_message(...)`. | `core/logger/class.logger_backend_activity.php` |

It sits beneath the rest of the system: `section`, `section_record`, the media
components, `login`, the API layer and several tools all call
`logger::$obj['activity']->log_message(...)`, while almost every class in the
codebase calls `debug_log()` (~1,700 call sites). The activity backend persists
through the normal matrix machinery — it builds a `section_record_data`-shaped
payload and hands it to `matrix_activity_db_manager::create()` — so it is a
client of [sections](../sections/index.md), not a parallel storage path.

!!! note "Not a PSR-3 logger"
    Despite the level names, this is not PSR-3. Levels are **numeric** with
    `DEBUG` as the *highest* number (least important) and `CRITICAL` the lowest,
    and there is no instance logger object — `logger` is a static facade plus a
    `logger::$obj[...]` registry of backends.

## Responsibilities

- **Severity scale** — own the six level constants and the
  `level_to_string()` converter.
- **Backend registry** — `register()` / `get_instance()` / the private
  `manage_backends()` store implement a name → backend-instance map (a function
  static inside `manage_backends`, plus the public `logger::$obj` array
  populated by config).
- **Backend resolution** — from a connection string scheme (`activity://…`)
  derive the class name (`logger_backend_<scheme>`), autoload
  `core/logger/class.<class_name>.php`, validate it `extends logger_backend`,
  and instantiate it with the parsed URL parts.

The logger does **not** decide *what* gets logged, *when* a line is dropped by
level, or *how* a record is stored — those belong to `debug_log()` and the
backend respectively.

## Key concepts

### Severity levels

Defined as constants on `logger`. Higher number = *less* important; the gaps are
intentional so future intermediate levels can be inserted.

| constant | value | meaning |
| --- | --- | --- |
| `logger::DEBUG` | 100 | Most verbose; development diagnostics. |
| `logger::INFO` | 75 | General operational information (the default for `log_message`). |
| `logger::NOTICE` | 50 | Normal but significant events. |
| `logger::WARNING` | 25 | Potential issues that don't stop operation. |
| `logger::ERROR` | 10 | Runtime errors needing attention. |
| `logger::CRITICAL` | 5 | Severe errors requiring immediate action. |

`logger::level_to_string($level)` maps these to `'DEBUG'`, `'INFO'`, … and
returns `'[unknown]'` for any other value.

### The `LOGGER_LEVEL` threshold (config-driven)

`debug_log()` is gated by the `LOGGER_LEVEL` constant defined in `config.php`:

```php
// config (sample.config.php)
define('LOGGER_LEVEL', (SHOW_DEBUG===true || SHOW_DEVELOPER===true)
    ? logger::DEBUG   // log everything
    : logger::ERROR   // log only ERROR/CRITICAL
);
```

The gate in `debug_log()` is:

```php
function debug_log(string $info, int $level=logger::DEBUG) : void {
    if(!defined('LOGGER_LEVEL') || ($level > LOGGER_LEVEL && SHOW_DEBUG===false)) {
        return; // skipped: this message is less important than the threshold
    }
    // … build $msg, then error_log($msg);
}
```

So a message is written when its level is **at least as important** as
`LOGGER_LEVEL` (`$level <= LOGGER_LEVEL`), unless `SHOW_DEBUG===true`, which
forces everything through regardless of level. Output goes to PHP's
`error_log` (the path set by `php.ini`'s `error_log`, e.g.
`/var/log/php_errors.log`).

!!! info "Level shapes the message"
    `debug_log()` formats by level: `WARNING` appends the backtrace call
    sequence (`[seq]`); `ERROR` and `CRITICAL` add `[File]`/`[Line]` and ANSI
    color (yellow / red), set `$_ENV['DEDALO_LAST_ERROR']`, and `CRITICAL` also
    prints the full backtrace. Levels below `NOTICE` (i.e. `< 50`) trigger a
    `debug_backtrace()` capture.

### The activity audit model

`logger_backend_activity` records each user action as a record in the
`matrix_activity` table (section tipo `DEDALO_ACTIVITY_SECTION_TIPO`). Each
record carries six columns, built directly as a `section_record_data` payload:

| field | component tipo | model | source |
| --- | --- | --- | --- |
| IP address | `dd544` | `component_input_text` | `$_SERVER['REMOTE_ADDR']` (`::1` → `localhost`) |
| WHO | `dd543` | `component_portal` | a `locator` into the Users section (`user_id` or `logged_user_id()`) |
| WHAT | `dd545` | `component_select` | the `$message`, mapped via the `$what` table to an event id locator into `dd42` |
| WHERE | `dd546` | `component_input_text` | `$tipo_where` — the tipo being acted on |
| WHEN | `dd547` | `component_date` | `component_date::get_date_now()` |
| DATA | `dd551` | `component_json` | the `$log_data` associative array (context) |

The known activity messages live in the static `$what` map: `LOG IN`,
`LOG OUT`, `NEW`, `DELETE`, `SAVE`, `LOAD EDIT`, `LOAD LIST`, `SEARCH`,
`UPLOAD`, `DOWNLOAD`, `UPLOAD COMPLETE`, `DELETE FILE`, `RECOVER SECTION`,
`RECOVER COMPONENT`, `STATS`, `NEW VERSION`.

!!! note "Loop guard and exclusions"
    The backend refuses to log its own elements (`$ar_elements_activity_tipo`,
    checked through an `array_flip` O(1) map) to avoid an infinite
    self-logging loop, and skips a set of volatile/utility sections
    (`$excluded_section_tipos`: temp presets `dd655`, time machine `dd15`, user
    activity `dd1521`). It can be globally switched off via
    `logger_backend_activity::$enable_log = false`.

### Batching and deferral

`log_message()` does **not** write immediately. It pushes an options object onto
a static `$log_queue` and registers a single `register_shutdown_function`
(`flush_queue`) on the first message of the request. The queue is flushed at
shutdown, or early when it reaches `MAX_QUEUE_SIZE` (100). `flush_queue()`
atomically swaps the queue, then calls `log_message_defer()` per item to perform
the actual `matrix_activity_db_manager::create()`. This keeps logging off the
hot path and avoids registering thousands of shutdown callbacks.

## Files & structure

```text
core/logger/
├── class.logger.php                  # the static facade: levels + backend registry
├── class.logger_backend.php          # abstract base: log_message() contract + url_data
└── class.logger_backend_activity.php # the 'activity' backend → matrix_activity table
```

Related, outside `core/logger/`:

- `shared/core_functions.php` — defines the global `debug_log()` function that
  consumes `logger::*` levels and `LOGGER_LEVEL`.
- `config/sample.config.php` — defines `LOGGER_LEVEL`, calls
  `logger::register('activity', …)` and populates `logger::$obj['activity']`.
- `core/base/class.loader.php` — `include`s the three logger class files at
  bootstrap.
- `core/db/class.matrix_activity_db_manager.php` — the DB manager the activity
  backend writes through.

## Instantiation & lifecycle

`logger` is a **static facade** with a private constructor; you never `new` it.
Backends are registered once at bootstrap (from config) and reached through the
`logger::$obj` registry.

```php
// logger facade — backend resolution
public static function register(
    string $log_name,          // registry key, e.g. 'activity'
    string $connection_string  // e.g. 'activity://auto:auto@auto:5432/log_data?table=matrix_activity'
) : bool

public static function get_instance(string $name) : ?logger_backend
public static function level_to_string(int $log_level) : string
```

Wiring in `config.php` (after the level threshold is defined):

```php
// 1. register the 'activity' backend (scheme → logger_backend_activity)
logger::register('activity', 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');

// 2. store the resolved backend instance in the global registry array
logger::$obj['activity'] = logger::get_instance('activity');
```

`register()` parses the connection string, builds the class name from its
**scheme** (`activity` → `logger_backend_activity`), autoloads
`core/logger/class.logger_backend_activity.php` if needed, asserts it
`is_subclass_of('logger_backend')`, instantiates it with the parsed URL array,
and stores it. After that, callers use the populated `logger::$obj['activity']`
directly. (`logger::get_instance('activity')` would return the same instance,
throwing if the name was never registered.)

The abstract backend contract:

```php
// core/logger/class.logger_backend.php
abstract class logger_backend {
    protected ?array $url_data;
    public function __construct( ?array $url_data ) { $this->url_data = $url_data; }
    abstract function log_message(
        string  $message,
        int     $log_level   = logger::INFO,
        ?string $tipo_where  = null,
        ?string $operations  = null,
        ?array  $log_data    = null,
        ?int    $user_id     = null
    ) : void;
}
```

## Public API

### `logger` facade

| method | static? | purpose |
| --- | --- | --- |
| `level_to_string($log_level)` | ✓ | Map a numeric level constant to its name (`'DEBUG'` … `'CRITICAL'`, else `'[unknown]'`). |
| `register($log_name, $connection_string)` | ✓ | Parse the connection string, autoload + instantiate the `logger_backend_<scheme>` class, validate it extends `logger_backend`, and store it under `$log_name`. Throws on a bad scheme or missing/invalid backend class. Returns `true`. |
| `get_instance($name)` | ✓ | Return the registered backend for `$name`. Throws if it was never registered. |
| `manage_backends($name, $obj_back=null)` | ✓ (private) | The internal name → instance store (function-static array): stores when `$obj_back` is given, retrieves when `null`. |

State: `public static array $obj` — the global registry of resolved backend
instances, populated by config (e.g. `logger::$obj['activity']`).

### `logger_backend` (abstract base)

| member | static? | purpose |
| --- | --- | --- |
| `__construct($url_data)` | | Store the parsed connection-string array on `$url_data`. |
| `log_message($message, $log_level, $tipo_where, $operations, $log_data, $user_id)` | | **Abstract** — the write contract each backend implements. |

### `logger_backend_activity` (the `activity` backend)

| member | static? | purpose |
| --- | --- | --- |
| `__construct($url_data)` | | Precompute the activity element tipos, the O(1) loop-guard map, and the cached typed-column names (`section_record_data::get_column_name(...)`), then call the parent. |
| `log_message($message, $log_level=logger::INFO, $tipo_where=null, $operations=null, $log_data=null, $user_id=null)` | | Public entry point. Returns early if logging is disabled or the `$tipo_where` is excluded; otherwise queues the options and arranges a deferred flush. |
| `log_message_defer($options)` | | Build the six-column `matrix_activity` payload and persist it via `matrix_activity_db_manager::create()`. Validates `tipo_where`/`message`, applies the self-log loop guard. |
| `flush_queue()` | ✓ (private) | Drain `$log_queue` at shutdown (or when full), calling `log_message_defer()` per item with per-item error handling. |
| `$what` | ✓ | Map of human activity names → numeric event section ids. |
| `$enable_log` | ✓ | Global on/off switch for activity logging (`bool`, default `true`). |
| `$excluded_section_tipos` | ✓ | Section tipos never tracked (temp presets, time machine, user activity). |
| `$ar_elements_activity_tipo` / `$ar_elements_activity_tipo_map` | ✓ | The activity's own element tipos and their flipped lookup map (loop guard). |

### Global helper (not a method of `logger`)

| function | purpose |
| --- | --- |
| `debug_log(string $info, int $level=logger::DEBUG)` | Write a developer/diagnostic line to PHP's `error_log`, gated by `LOGGER_LEVEL` (and forced on by `SHOW_DEBUG`). Lives in `shared/core_functions.php`. |

## How it fits with the rest of Dédalo

- **[Sections](../sections/index.md) / [section_record](../sections/section_record.md)** —
  the activity backend does not own its own table machinery; it builds a
  `section_record_data`-shaped payload (typed columns resolved via
  `section_record_data::get_column_name()`) and persists through
  `matrix_activity_db_manager::create()`. Activity records are therefore ordinary
  matrix records of section `DEDALO_ACTIVITY_SECTION_TIPO`. `section::create_record()`
  and `section_record` save/delete emit `NEW` / `SAVE` / `DELETE` activity.
- **API layer** — `dd_core_api::log_activity()` (called from `dd_core_api::read`)
  emits `LOAD EDIT` / `LOAD LIST` navigation activity, applying its own model and
  loop-guard exclusions before calling the backend.
- **[Components](../components/index.md)** — media components
  (`component_av`, `component_image`, `component_media_common`, `component_3d`)
  and `component_common` emit `UPLOAD` / `DOWNLOAD` / file activity.
- **`login`** — emits `LOG IN` / `LOG OUT`.
- **Tools** — `tool_upload`, `tool_import_files`, `tool_time_machine` and the
  `area_maintenance` update widgets emit upload/recover/update activity.
- **Diffusion** — `diffusion/class.diffusion_activity_logger.php` is a separate
  activity logger for the diffusion side and is loaded alongside the core logger
  by `class.loader.php`; it is not part of `core/logger/`.

## Examples

### Developer logging with `debug_log()`

```php
// most common: a development trace (DEBUG = default; shown only when LOGGER_LEVEL allows)
debug_log(__METHOD__ . ' resolved tipo: ' . to_string($tipo), logger::DEBUG);

// an error: always shown (LOGGER_LEVEL defaults to ERROR in production),
// adds [File]/[Line]/[seq] and sets $_ENV['DEDALO_LAST_ERROR']
debug_log(__METHOD__ . ' Error: tipo_where is empty', logger::ERROR);
```

### Writing a user-activity record

```php
// from section::create_record() — record a 'NEW' activity
logger::$obj['activity']->log_message(
    'NEW',          // string  $message   (mapped via $what)
    logger::INFO,   // int     $log_level
    $tipo,          // ?string $tipo_where (the section/component acted on)
    null,           // ?string $operations (legacy)
    [               // ?array  $log_data   (free-form context, stored as JSON)
        'msg'          => 'Created section record',
        'section_id'   => $section_id,
        'section_tipo' => $tipo,
        'tipo'         => $tipo,
        'table'        => common::get_matrix_table_from_tipo($tipo)
    ],
    $user_id        // ?int    $user_id    (defaults to logged_user_id())
);
```

!!! note "The write is deferred"
    `log_message()` only queues the entry; the real insert happens in
    `flush_queue()` → `log_message_defer()` at request shutdown (or when the
    queue hits 100). Do not rely on the activity row existing mid-request.

### Registering a backend (config)

```php
define('LOGGER_LEVEL', (SHOW_DEBUG===true || SHOW_DEVELOPER===true)
    ? logger::DEBUG
    : logger::ERROR
);
logger::register('activity', 'activity://auto:auto@auto:5432/log_data?table=matrix_activity');
logger::$obj['activity'] = logger::get_instance('activity');
```

To add a new backend `foo`, create `core/logger/class.logger_backend_foo.php`
extending `logger_backend` (implementing `log_message()`), then
`logger::register('foo', 'foo://…')`. The scheme of the connection string is the
only thing that selects the class.

## Related

- [Architecture overview](../architecture_overview.md) — where the work-system
  server sits relative to data and diffusion.
- [Sections](../sections/index.md) · [section_record](../sections/section_record.md)
  — the matrix storage the activity backend writes through.
- [Components](../components/index.md) — the field models whose tipos make up an
  activity record (input_text, portal, select, date, json).
- [Locator](../locator.md) — the pointer type stored in the WHO / WHAT columns of
  an activity record.
