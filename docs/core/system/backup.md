# backup

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [Diffusion](diffusion.md)

`src/core/resolve/backup.ts` is the TS-native module that dumps and lists
Dédalo's PostgreSQL work database. Unlike most pages in this reference, this
is **not** a port of the PHP `backup` class's full surface — it is a
deliberately narrower, TS-owned reimplementation of the one piece that a
coexisting TS server can safely own: its **own** `pg_dump` into its **own**
backup directory. See [TS status](#ts-status) below for exactly what did and
did not carry over.

## TS status

`backup.ts` (`src/core/resolve/backup.ts`) is marked **TS-NATIVE** in
[STATUS.md](../../../rewrite/STATUS.md), not a byte-parity port: the TS server dumps the **shared**
PostgreSQL database with its **own** `pg_dump` process into its **own**
backup directory (`v7_ts/private/backups/db`), never the PHP install's
`DEDALO_BACKUP_PATH`. This is a direct instance of the "TS is self-contained,
not shared" design rule — coexistence during the transition must not mean
the two servers fight over one backup tree or one naming sequence.

What is **ported**:

- The PostgreSQL custom-format dump (`initBackupSequence()`), file naming
  (forced vs throttled), the 8-hour throttle window, and file listing
  (`getBackupFiles()`) — wired to the `make_backup` maintenance widget's
  `get_value`/`make_psql_backup`/`get_dedalo_backup_files` actions.
- Version-matched `pg_dump` binary resolution (`resolvePgDump()`) — a
  **stronger** guarantee than PHP had (see [Key concepts](#key-concepts)).

What is **NOT ported** (deliberate engine-boundary gaps, not oversights):

- **MariaDB/MySQL publication-DB backup** (`make_mysql_backup()`) — MariaDB is
  the diffusion engine's own database; this TS server never connects to it.
  The widget's `mysql_backup_files` list is **always `[]`**, and there is no
  `make_mysql_backup` action registered at all.
- **COPY-format restore/import** (`copy_from_file()`, `import_from_copy_file()`)
  — no TS equivalent exists anywhere in `src/`.
- **Schema introspection** (`get_tables()`) — not ported.
- **Ontology-server reachability check** (`check_remote_server()`) — not
  ported.
- **Language file generation** (`write_lang_file()`) — not ported as a
  backup-module function; its *effect* (serving the localized label
  dictionary) is instead reproduced by `src/core/resolve/environment.ts`'s
  `getLabels()`, which reads the copied client's pre-generated
  `core/common/js/lang/<lang>.js` file and falls back to rebuilding the
  dictionary straight from `dd_ontology` — a different mechanism, not a port
  of `write_lang_file()` itself.
- **Backup-on-login** — PHP's `login::login_user()` calls
  `init_backup_sequence()` automatically (gated on
  `DEDALO_BACKUP_ON_LOGIN`/the time-range guard). The TS login flow
  (`src/core/security/auth.ts`) does not call `initBackupSequence()` at all;
  the only TS trigger is the explicit maintenance-widget action.
- **`DEDALO_DB_MANAGEMENT` skip** — PHP's `init_backup_sequence()` returns OK
  without dumping when the DB is externally managed. `initBackupSequence()`
  has no equivalent check; it always attempts the dump.
- **Configurable backup paths** — PHP's `DEDALO_BACKUP_PATH`/`_DB`/`_TEMP`/
  `_ONTOLOGY` constants are `.env`-tunable. `getBackupDir()`'s only override
  hook (`config.backupDir`) is **not** a declared field on `DedaloConfig`
  (`src/config/config.ts` has no `backupDir`/`pgBinPath` key) — the cast is
  defensive scaffolding for a future config key that does not exist yet, so
  the directory is always the hardcoded default derivation described below.

Everything documented past this point describes **the TS module as it
exists**, not the PHP oracle — read the gaps above as the boundary of what
follows.

## Role

There is no `backup` class in the TS server — `src/core/resolve/backup.ts`
is a stateless module of exported functions, no instance, no static flags to
mirror PHP's `$dd_ontology_columns`/`$checked_download_str_dir` (neither is
needed: there is no COPY-import path to configure a column allowlist for).

It sits at the boundary between the two Dédalo systems (see
[Architecture overview](../architecture_overview.md)):

| concern | who owns it | how the TS module handles it |
| --- | --- | --- |
| **Work DB (PostgreSQL)** | this TS server | `initBackupSequence()` runs `pg_dump` to a custom-format file in the TS server's own directory. |
| **Publication DB (MariaDB/MySQL)** | the diffusion engine | not handled here at all — the widget reports an always-empty MySQL file list; see [TS status](#ts-status). |
| **Restore / data seeding** | — | no TS restore path exists; see [TS status](#ts-status). |

The module is consumed from one surface: the **maintenance widget**
(`make_backup` in `src/core/resolve/widget_request.ts`, the on-screen "make
backup" / "list backups" UI). There is no login-flow trigger and no
ontology/install import caller (see [TS status](#ts-status)).

## Responsibilities

- **PostgreSQL work-DB dump** — build a compressed custom-format `pg_dump`
  backup of the current Dédalo database, detached, with an optional
  time-range guard so a non-forced call doesn't dump on every request.
- **Backup file listing** — enumerate the existing `.backup` files on disk
  for the maintenance UI.
- **Data-version lookup** — read the current `dedalo_version` from
  `matrix_updates` for the backup filename's `dbv<version>` suffix.

!!! warning "No restore, no MySQL, no media/config/code backup"
    `backup.ts` backs up **one** database with **one** method. It does not
    back up MariaDB, uploaded media files, `.env`/config, or source code, and
    it has **no restore path at all** in this server — a much narrower
    surface than PHP's `backup` class. See [TS status](#ts-status) for the
    full list of what stayed PHP-only.

## Key concepts

### What gets backed up, and where it lands

| target | function | tool | output | directory |
| --- | --- | --- | --- | --- |
| PostgreSQL work DB | `initBackupSequence()` | `pg_dump -F c -b` | `<date>.<db>.postgresql_<user>[_forced]_dbv<ver>.custom.backup` (+ a sibling `.log` capturing stderr) | `getBackupDir()` — see below |

Backups land in the TS server's own tree, **not** the PHP install's
`DEDALO_BACKUP_PATH`: `getBackupDir()` resolves to
`<parent-of-cwd>/private/backups/db` when that `private` dir exists (the
convention this TS tree uses for its config/session state), else
`<cwd>/backups/db` — see the config gap noted above; there is currently no
`.env` key to override it.

### Version-matched `pg_dump` resolution (stronger than PHP)

`resolvePgDump()` mirrors PHP's binary-lookup intent but goes further: a
`pg_dump` **client** older than the **server** refuses to dump entirely (a
real operational hazard — see the note below), so `resolvePgDump()` probes
Homebrew's version-suffixed installs (`postgresql@18` down to `@15`)
**newest-first** before falling back to a bare `pg_dump` on `PATH`. There is
an optional `config.pgBinPath` override hook (also not a declared config
field today — see [TS status](#ts-status)).

!!! danger "PHP live defect this TS logic exists to avoid"
    [STATUS.md](../../../rewrite/STATUS.md) records a real, observed PHP defect (#10): the PHP install's
    backup cron has been producing **zero-byte dumps** for a period because
    its `pg_dump` (client v17) refuses to dump a PostgreSQL 18 server — the
    exact mismatch `resolvePgDump()`'s newest-first Homebrew probe is designed
    to sidestep. `/Users/render/Desktop/trabajos/dedalo/backups/db/*.backup`
    on the reference install were confirmed all `0` bytes from this cause.

### Naming & the throttle window

`initBackupSequence(userId, skipTimeRange)`:

- **`skipTimeRange = true`** (forced, the maintenance-widget path) —
  second-resolution `Y-m-d_His` naming with a `_forced` marker, no throttle
  check.
- **`skipTimeRange = false`** — hour-resolution `Y-m-d_H` naming; if the
  newest existing `.backup` file's age is under `BACKUP_TIME_RANGE_HOURS`
  (hardcoded `8`, matching PHP's `DEDALO_BACKUP_TIME_RANGE` default — not
  `.env`-configurable in TS), the call returns `result: true` with a
  "skipped, a recent backup already exists" message instead of dumping.
  Nothing in this server currently calls it with `skipTimeRange: false` —
  see the backup-on-login gap above.

The dump itself runs **detached** via `Bun.spawn` +
`child.unref()` (PHP's `nohup … nice -n 19 … & echo $!` equivalent, minus the
`nice` — see the note below); the function returns the PID and file path
immediately rather than waiting for the dump to finish.

!!! note "`nice` is not applied to the backup dump"
    Unlike the media engine's `spawn.ts` (which prefixes every binary
    invocation with `nice -n 19` for shared-host courtesy), `backup.ts`'s
    `Bun.spawn` call for `pg_dump` does not. A 9.3 GB live database dump
    (the reference-install gate's scale) runs at normal process priority.

## Public API

All functions are plain exports from `src/core/resolve/backup.ts` — no class,
no static/instance distinction.

### Make & list backups

| function | purpose |
| --- | --- |
| `initBackupSequence(userId, skipTimeRange=true)` | Create the backup dir if missing, apply the throttle window (unless `skipTimeRange`), build the dated filename, and spawn `pg_dump -F c -b -f <path> [-h host] [-p port] [-U user] <db>` detached. Returns `{result, msg, errors, pid?, file_path?}`. |
| `getBackupFiles()` | Read the backup dir, return `[{name, size}]` for every `.backup` file, newest-first by filename sort, `size` formatted like PHP's `format_size_units` (`GB`/`MB`/`KB`/`bytes`). `[]` when the directory does not exist. |
| `getBackupDir()` | Resolve the backup directory (see [Key concepts](#key-concepts)). |
| `resolvePgDump()` | Resolve the `pg_dump` binary path (see [Key concepts](#key-concepts)). |
| `getCurrentDataVersion()` | Read `matrix_updates` for the highest `dedalo_version`, parsed into `[major, minor, patch]`; `[]` on a fresh/unimported DB. |

There is no `make_mysql_backup()`, `get_mysql_backup_files()`,
`copy_from_file()`, `import_from_copy_file()`, `get_tables()`,
`check_remote_server()`, or `write_lang_file()` export — see
[TS status](#ts-status).

## How it fits with the rest of Dédalo

- **`make_backup` widget** (`src/core/resolve/widget_request.ts`) — the three
  wired actions:
  - `get_value` (`makeBackupGetValue`) — reports the would-be forced filename,
    the backup dir, `dedalo_db_management: true` (always — no
    `DEDALO_DB_MANAGEMENT` gap check), and `mysql_db: null`.
  - `make_psql_backup` (`makeBackupPsql`) — calls `initBackupSequence(-1,
    true)` (a synthetic `userId = -1`; there is no logged-in curator identity
    threaded through the maintenance-widget dispatch here) and returns
    `{result, msg, errors, pid, file_path}`.
  - `get_dedalo_backup_files` (`makeBackupGetFiles`) — returns
    `{psql_backup_files: getBackupFiles().slice(0, maxFiles),
    mysql_backup_files: []}`.
- **Diffusion / the separate diffusion engine** — not involved. PHP's
  `make_mysql_backup()` asked the Bun diffusion engine to run `mysqldump`;
  this TS server does not call it and the `mysql_backup_files` list is
  always empty, by design (the engine boundary — MariaDB belongs to the
  diffusion engine, not this server).
- **Ontology / install import** — no caller; the COPY-import path this used
  to feed (`ontology_data_io`, `install_hierarchy_manager` in PHP) has no TS
  port to call it from.

## Examples

### Force an immediate PostgreSQL backup (maintenance UI path)

```typescript
import { initBackupSequence } from './backup.ts';

// what the make_backup widget's make_psql_backup action does
const response = await initBackupSequence(-1, true); // skipTimeRange=true → dump now, '_forced' filename
// response.result === true, response.pid / response.file_path set
// pg_dump runs detached (Bun.spawn + unref)
```

### List existing backups for the widget

```typescript
import { getBackupFiles } from './backup.ts';

const files = getBackupFiles(); // [{name, size}, …] *.backup, newest-first
```

### Resolve the version-matched `pg_dump` binary

```typescript
import { resolvePgDump } from './backup.ts';

const pgDump = resolvePgDump();
// e.g. '/opt/homebrew/opt/postgresql@18/bin/pg_dump' when the server is v18
// and a matching Homebrew install exists, else a bare 'pg_dump' from PATH
```

## Related

- [Architecture overview](../architecture_overview.md) — the two-system
  (work PostgreSQL vs publication MariaDB) split `backup.ts` only handles one
  side of.
- [Sections](../sections/index.md) — the `matrix` tables the (unported) COPY
  import methods used to load.
- `src/core/resolve/backup.ts` — the source.
- `src/core/resolve/widget_request.ts` — the `make_backup` widget wiring
  (`makeBackupGetValue`/`makeBackupPsql`/`makeBackupGetFiles`).
- `src/core/resolve/environment.ts` — where the *effect* of PHP's
  `write_lang_file()` (the localized label dictionary) lives now, under a
  different mechanism.
- [STATUS.md](../../../rewrite/STATUS.md) — the `make_backup ✅ TS-NATIVE` ledger entry and PHP live
  defect #10 (zero-byte cron dumps from the client/server `pg_dump` version
  mismatch).
