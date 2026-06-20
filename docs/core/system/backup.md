# backup

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [Diffusion](diffusion.md)

The static helper class that dumps, lists and restores Dédalo's databases: the PostgreSQL work database (`pg_dump`), the MariaDB/MySQL publication database (delegated to Bun), and the COPY-format restore path used to seed ontology and matrix data.

## Role

`backup` (in `core/backup/class.backup.php`, declared `abstract class backup`)
is a **stateless, all-static utility class**. It does **not** extend `common` —
it is not an ontology-driven object, has no `tipo`, no `get_instance()` and no
context/data datum. It is a thin orchestration layer over the database command
line tools (`pg_dump`, `psql`, `gunzip`) and the Bun diffusion API, called
directly as `backup::method(...)`.

!!! note "Not a `common` subclass"
    Unlike `section` / `component_*`, `backup` has no constructor, no instance
    state and no factory. Its only state is two public static flags
    (`$dd_ontology_columns`, `$checked_download_str_dir`). Every method is
    `public static`. Do not look for a `get_instance()`; there isn't one.

It sits at the boundary between the two Dédalo systems (see
[Architecture overview](../architecture_overview.md#the-two-systems)):

| concern | who owns it | how `backup` handles it |
| --- | --- | --- |
| **Work DB (PostgreSQL)** | PHP directly | `init_backup_sequence()` runs `pg_dump` to a custom-format file. |
| **Publication DB (MariaDB/MySQL)** | Bun engine | `make_mysql_backup()` computes the target path and asks the Bun diffusion API (`backup_database` → `mysqldump`) to do the dump. PHP never connects to MariaDB. |
| **Restore / data seeding** | PostgreSQL COPY | `copy_from_file()` / `import_from_copy_file()` load PostgreSQL `COPY`-format files into matrix/ontology tables. |

The class is consumed from three main surfaces: the **login flow**
(`login::login_user()` fires a backup on login), the **maintenance widget**
(`make_backup` in `area_maintenance`, the on-screen "make backup" / "list
backups" UI) and the **ontology / install import path**
(`ontology_data_io`, `install_hierarchy_manager`).

## Responsibilities

- **PostgreSQL work-DB dump** — build a compressed custom-format `pg_dump`
  backup of the current Dédalo database, in the background, with a time-range
  guard so logins don't dump on every visit.
- **MariaDB publication-DB dump** — delegate `mysqldump` of every configured
  publication database to the Bun diffusion engine.
- **Backup file listing** — enumerate the existing `.backup` (PostgreSQL) and
  `.sql` (MySQL) files on disk for the maintenance UI.
- **COPY-format restore / import** — delete-then-`\copy` data from a PostgreSQL
  COPY file into `dd_ontology`, `matrix_dd`, `matrix_ontology` and other matrix
  tables (the ontology-update and install seeding path), including gzip
  decompression and `id` sequence repair.
- **Schema introspection** — list the database's base tables.
- **Ontology-server reachability check** — `curl` the configured ontology server
  to verify it is up before an ontology update.
- **Language file generation** — compute and write the per-language JS label
  file (`core/common/js/lang/<lang>.js`) and bust its cache.

!!! warning "No restore of media, config or the work matrix itself"
    `backup` backs up the **databases** (PostgreSQL dump + MariaDB dump). It does
    **not** back up uploaded media files, the `config/` PHP files, or the source
    code. (Code backup is a separate concern handled by the `update_code`
    widget, which writes to `DEDALO_BACKUP_PATH/code`.) The COPY-import methods
    restore *into* tables but are used for ontology/install seeding, not as a
    general "restore my whole installation" tool.

## Key concepts

### What gets backed up, and where it lands

| target | method | tool | output | directory |
| --- | --- | --- | --- | --- |
| PostgreSQL work DB | `init_backup_sequence()` | `pg_dump -F c -b -v` | `<date>.<conn>.<dbtype>_<user>_dbv<ver>.custom.backup` | `DEDALO_BACKUP_PATH_DB` (`…/backups/db`) |
| MariaDB publication DB(s) | `make_mysql_backup()` | `mysqldump` (via Bun) | `<date>_<dbname>_<user>.sql` | `DEDALO_BACKUP_PATH/mysql` |

Backups are deliberately kept **outside the web root** for security
(`DEDALO_BACKUP_PATH` defaults to `dirname(DEDALO_ROOT_PATH, 2) . '/backups'`).

### Configuration constants

Defined in `config/sample.config.php` (and `config_db.php`):

| constant | default | meaning |
| --- | --- | --- |
| `DEDALO_BACKUP_ON_LOGIN` | `true` | Whether a login fires `init_backup_sequence()`. |
| `DEDALO_BACKUP_TIME_RANGE` | `8` | Minimum hours between automatic (login-triggered) backups. `init_backup_sequence()` self-defaults this to `8` if undefined. |
| `DEDALO_BACKUP_PATH` | `…/backups` | Root backups dir (outside `httpdocs`). |
| `DEDALO_BACKUP_PATH_DB` | `…/backups/db` | PostgreSQL `.backup` files. |
| `DEDALO_BACKUP_PATH_TEMP` | `…/backups/temp` | Temp backup workspace. |
| `DEDALO_BACKUP_PATH_ONTOLOGY` | `…/backups/ontology` | Ontology backup files. |
| `DEDALO_DB_MANAGEMENT` | `true` | When `false`, PostgreSQL backups are **skipped** (DB is on an external server / managed elsewhere). `init_backup_sequence()` returns OK without dumping. |

### Static state

| field | type | purpose |
| --- | --- | --- |
| `$dd_ontology_columns` | `array` | The explicit column list (`tipo`, `parent`, `term`, `model`, `order_number`, `relations`, `tld`, `properties`, `model_tipo`, `is_model`, `is_translatable`, `propiedades`) used when COPYing into `dd_ontology`. **`id` is intentionally excluded** so a restore re-derives ids cleanly. |
| `$checked_download_str_dir` | `bool` | Guard flag to avoid repeated filesystem checks during backup operations. |

### Scheduling

There is **no cron/daemon scheduler inside `backup`**. "Scheduling" is
event-driven and lazy:

1. **On login** — `login::login_user()` calls `init_backup_sequence()` when
   `DEDALO_BACKUP_ON_LOGIN` is true.
2. **Time-range guard** — inside `init_backup_sequence()`, if the newest
   existing `.backup` file is younger than `DEDALO_BACKUP_TIME_RANGE` hours
   (computed via `get_last_modification_date()`), the run is skipped. A backup
   less than an hour old (same filename, one-hour resolution) is also skipped.
   This makes the login-time backup effectively "at most one per `DEDALO_BACKUP_TIME_RANGE` hours".
3. **Forced (on demand)** — the `make_backup` maintenance widget passes
   `skip_backup_time_range = true` (the file then uses second-resolution
   `Y-m-d_His` naming and the `_forced_` marker) so the curator can dump
   immediately, ignoring the time range.

The actual `pg_dump` runs **detached in the background** via `nohup … nice -n 19
… & echo $!` using the `process` class; the method returns the PID and process
file rather than waiting for the dump to finish.

## Public API

All methods are `public static`. Grouped by concern.

### Make backups

| method | static? | purpose |
| --- | --- | --- |
| `init_backup_sequence($options)` | ✓ | The main PostgreSQL backup entry point. `$options = {user_id, username, skip_backup_time_range}`. Creates `DEDALO_BACKUP_PATH_DB` if missing, applies the time-range guard (unless skipped), builds the dated filename, and launches `pg_dump -F c -b -v` in the background. Returns `{result, msg, errors, pid?, pfile?}`. Skips entirely (returns OK) when `DEDALO_DB_MANAGEMENT===false`. |
| `make_mysql_backup()` | ✓ | Dump every publication DB listed in `API_WEB_USER_CODE_MULTIPLE`. For each, computes the `…/mysql/<date>_<db>_<user>.sql` target and calls the Bun diffusion API action `backup_database` (`diffusion_api_client::call`, 600 s timeout) to run `mysqldump`. Returns `{result:[…per-db results], msg}`. |

### List backups

| method | static? | purpose |
| --- | --- | --- |
| `get_backup_files()` | ✓ | Read `DEDALO_BACKUP_PATH/db`, return `[{name, size}]` for every `.backup` file, newest first (only `.backup` extension is kept). |
| `get_mysql_backup_files()` | ✓ | Same, for `DEDALO_BACKUP_PATH/mysql`, keeping only `.sql` files. |

### Restore / COPY import

| method | static? | purpose |
| --- | --- | --- |
| `copy_from_file($table, $path_file, $tld=null)` | ✓ | Restore a PostgreSQL `COPY`-format file into a table. Validates the table name (`^[a-zA-Z_][a-zA-Z0-9_]*$`) and file existence. Handles `dd_ontology` (requires `$tld`; creates a `dd_ontology_copy` safety duplicate, `DELETE … WHERE tld=`, then `\copy` the `$dd_ontology_columns`) and `matrix_dd` (safety copy, full delete, full `\copy`). Runs `psql` via `shell_exec`. Returns the concatenated command output. |
| `import_from_copy_file($options)` | ✓ | The richer restore path used by ontology/install imports. `$options = {section_tipo?, file_path, matrix_table, delete_table=false, columns=…}`. Validates all inputs against safe-character regexes, **gunzips** the `.gz` file, deletes existing rows (whole table when `delete_table===true`, else `WHERE section_tipo=…`), `\copy`s the columns in, then `setval(...)` repairs the `<table>_id_seq` sequence and removes the temp uncompressed file. Returns `{result, msg, errors}`. |

### Introspection / sync / lang

| method | static? | purpose |
| --- | --- | --- |
| `get_tables()` | ✓ | Return the names of all `BASE TABLE`s in the `public` schema (used to detect a non-imported / empty DB). |
| `check_remote_server()` | ✓ | `curl` the configured ontology server (`ONTOLOGY_SERVERS[0]`, or legacy `STRUCTURE_SERVER_*`) with `{code, check_connection, dedalo_version}` to verify reachability (5 s timeout, optional `SERVER_PROXY`). Returns the curl response object. |
| `write_lang_file($lang)` | ✓ | Compute the full label set for `$lang` (`label::get_ar_label`), write it as JSON to `core/common/js/lang/<lang>.js`, and bust the lang cache (`dd_cache::delete_cache_files`). Returns `bool`. |

!!! note "Naming caveat — `check_remote_server` exists twice"
    There is a `backup::check_remote_server()` (ontology-server ping), and a
    **separate** `ontology_data_io::check_remote_server($server)` /
    `update_code::check_remote_server($server)` used by the update widgets. They
    are distinct methods on different classes; don't confuse the parameterless
    `backup::` one with the per-server ones.

## How it fits with the rest of Dédalo

`backup` is a leaf utility wired into several flows rather than a hub:

- **[Login](login.md)** — `login::login_user()` calls `init_backup_sequence()`
  when `DEDALO_BACKUP_ON_LOGIN` is true, giving the "backup on first login of the
  day" behavior via the time-range guard.
- **`area_maintenance` → `make_backup` widget** — the on-screen UI. Its
  `API_ACTIONS` are `make_psql_backup` (alias of `init_backup_sequence` with
  `skip_backup_time_range=true`), `make_mysql_backup` (alias of
  `make_mysql_backup`) and `get_dedalo_backup_files` (wraps `get_backup_files` +
  `get_mysql_backup_files`). See `core/area_maintenance/widgets/make_backup/`.
- **Diffusion / Bun** — `make_mysql_backup()` is the PHP side of the
  PHP→Bun contract: PHP never touches MariaDB, it asks the Bun diffusion API
  (`diffusion/api/v1/index.ts`, action `backup_database`, which requires the
  internal privileged token) to run `mysqldump`. See
  [Diffusion](../architecture_overview.md#the-two-systems).
- **Ontology / install import** — `ontology_data_io::import_from_file()` /
  `import_private_lists_from_file()` and `install_hierarchy_manager` call
  `import_from_copy_file()` to seed `matrix_ontology` / `matrix_dd` from
  COPY files fetched from the ontology server. `copy_from_file()` is the
  lower-level `dd_ontology` / `matrix_dd` restore used during updates.
- **API surfaces** — `dd_utils_api` and `dd_init_test` use `get_tables()` to
  detect an empty/not-yet-imported database; `dd_core_api` and the maintenance
  / install flows call `write_lang_file()` after ontology changes to regenerate
  the client label files.

## Examples

### Force an immediate PostgreSQL backup (maintenance UI path)

```php
// what make_backup::make_psql_backup() does: ignore the time range
$response = backup::init_backup_sequence((object)[
    'user_id'                => logged_user_id(),
    'username'               => logged_user_username(),
    'skip_backup_time_range' => true   // dump now, '_forced_' filename
]);
// $response->result === true, $response->pid / $response->pfile set
// the pg_dump runs detached in the background (nice -n 19)
```

### Login-time backup (respects the time range)

```php
// login::login_user() — only when DEDALO_BACKUP_ON_LOGIN is true
$make_backup_response = backup::init_backup_sequence((object)[
    'user_id'                => $user_id,
    'username'               => $username,
    'skip_backup_time_range' => false  // skipped if a recent backup exists
]);
```

### Dump the MariaDB publication database(s)

```php
// PHP computes the target path; Bun runs mysqldump
$response = backup::make_mysql_backup();
// $response->result is an array, one entry per database in API_WEB_USER_CODE_MULTIPLE
```

### List existing backups for the widget

```php
$psql_files  = backup::get_backup_files();        // [{name, size}, …] *.backup, newest first
$mysql_files = backup::get_mysql_backup_files();  // [{name, size}, …] *.sql, newest first
```

### Restore a gzip COPY file into a matrix table

```php
$response = backup::import_from_copy_file((object)[
    'file_path'    => $ontology_io_path . '/matrix_dd.copy.gz',
    'matrix_table' => 'matrix_dd',
    'delete_table' => true            // wipe the whole table first
]);
// or scope the delete to one section_tipo (delete_table defaults to false):
$response = backup::import_from_copy_file((object)[
    'section_tipo' => 'es1',
    'file_path'    => $ontology_io_path . '/es1.copy.gz',
    'matrix_table' => 'matrix_ontology'
]);
```

!!! warning "Restore is destructive"
    Both `copy_from_file()` and `import_from_copy_file()` **delete before they
    copy** (whole-table or `WHERE section_tipo`/`WHERE tld`). `copy_from_file()`
    first makes a `<table>_copy` safety duplicate for `dd_ontology` / `matrix_dd`;
    `import_from_copy_file()` does **not** make a safety copy — it relies on the
    caller having a real backup. Always have a current `init_backup_sequence()`
    dump before importing.

## Related

- [Architecture overview](../architecture_overview.md) — the two-system
  (work PostgreSQL vs publication MariaDB) split that `backup` straddles.
- [Sections](../sections/index.md) — the `matrix` tables whose data the COPY
  import methods load.
- [Ontology](../ontology/index.md) — `dd_ontology` / `matrix_dd` /
  `matrix_ontology`, the tables seeded by `copy_from_file()` /
  `import_from_copy_file()` during ontology updates.
- `core/area_maintenance/widgets/make_backup/` — the curator-facing widget that
  wraps these methods.
- `diffusion/api/v1/index.ts` (`backup_database`) — the Bun side of
  `make_mysql_backup()`.
