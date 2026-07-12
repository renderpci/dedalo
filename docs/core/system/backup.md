# backup

> See also: [Architecture overview](../architecture_overview.md) ·
> [area_maintenance](../areas/area_maintenance.md) · [db](db.md) ·
> [Diffusion](diffusion.md)

`src/core/area_maintenance/backup.ts` dumps and lists Dédalo's PostgreSQL work
database. It is a stateless module of exported functions, driven by the
`make_backup` maintenance widget.

## Scope

This module backs up **one database with one method**: a custom-format `pg_dump`
of the PostgreSQL work database, into the server's own backup directory.

!!! warning "What backup does NOT cover"
    It does **not** back up the publication database, uploaded media files,
    configuration, or source code — and it has **no restore path**. Restoring is
    an operator procedure with `pg_restore`, not an in-app action.

    The publication database (MariaDB) belongs to the diffusion engine; this
    server never connects to it. The widget's MySQL file list is therefore always
    empty, by design.

## Where backups land

| target | function | tool | output |
| --- | --- | --- | --- |
| PostgreSQL work DB | `initBackupSequence()` | `pg_dump -F c -b` | `<date>.<db>.postgresql_<user>[_forced]_dbv<ver>.custom.backup`, plus a sibling `.log` capturing the dump's stderr |

`getBackupDir()` resolves the directory: the `DEDALO_BACKUP_DIR` config override
if set, otherwise `<privateDir>/backups/db`.

!!! warning "The directory derives from privateDir, never from the working directory"
    It is derived from the same `privateDir` constant the session store and the
    `.env` loader use. An earlier cwd-based derivation meant the backup directory
    silently changed depending on where the server was launched from — which is
    exactly how a backup ends up somewhere nobody looks.

## Version-matched `pg_dump`

A `pg_dump` **client** older than the **server** refuses to dump at all. That is
not a theoretical hazard: it silently produces zero-byte files while the calling
process reports success.

`resolvePgDump()` guards against it: it probes the version-suffixed installs
(`postgresql@18` down to `@15`) **newest-first** before falling back to a bare
`pg_dump` on `PATH`. `config.ops.pgBinPath` overrides the probe.

## Failure is surfaced, not swallowed

The dump runs **detached** (`Bun.spawn` + `child.unref()`), so
`initBackupSequence()` returns the pid and file path immediately rather than
blocking on a multi-gigabyte dump. That makes reporting failure the hard part, and
the module does three things about it:

- **The password is threaded** from `config.db.password`, so a password-auth
  Postgres does not fail with an authentication error into a log file nobody
  reads while the widget reports success.
- **A short fast-fail window** catches an immediate exit — an authentication or
  connection error — and reports it as a **failure**, with the tail of the `.log`
  in the widget's message.
- **The completion check verifies a non-empty artifact.** On failure it logs the
  `.log` tail and **deletes the empty file**, so the backup list can never offer a
  zero-byte "backup" as restorable.

The widget feeds the returned pid and log path into the process-status stream, so
an operator watches the dump run and sees the failure tail live.

## Naming and the throttle window

`initBackupSequence(userId, skipTimeRange, overrides?)`:

- **`skipTimeRange = true`** (forced — the maintenance widget's path):
  second-resolution `Y-m-d_His` naming with a `_forced` marker, no throttle check.
- **`skipTimeRange = false`**: hour-resolution `Y-m-d_H` naming. If the newest
  existing `.backup` file is younger than `config.ops.backupTimeRangeHours`
  (`DEDALO_BACKUP_TIME_RANGE`, default 8), the call returns `result: true` with a
  "skipped, a recent backup already exists" message instead of dumping.

## The surface

`src/core/area_maintenance/backup.ts`:

| function | purpose |
| --- | --- |
| `initBackupSequence(userId, skipTimeRange=true, overrides?)` | Create the backup directory if missing, apply the throttle window unless forced, build the dated filename, and spawn `pg_dump -F c -b -f <path> …` detached. Returns `{result, msg, errors, pid?, file_path?, pfile?}`. |
| `getBackupFiles()` | Read the backup directory and return `[{name, size}]` for every `.backup` file, newest first, with a human-readable size. Returns `[]` when the directory does not exist. |
| `newestBackupMtimeMs(backupDir?)` | The newest `.backup` file's mtime (`0` when there are none). The recency primitive behind the throttle window and the update preconditions' "a recent backup exists" check. |
| `getBackupDir()` | Resolve the backup directory. |
| `resolvePgDump()` | Resolve the `pg_dump` binary path. |
| `getCurrentDataVersion()` | Read `matrix_updates` for the highest `dedalo_version`, parsed into `[major, minor, patch]`. `[]` on a fresh database. |

## How it fits with the rest of Dédalo

- **The `make_backup` widget** (`src/core/area_maintenance/widgets/make_backup.ts`)
  is the only caller. It registers two actions — `make_psql_backup` and
  `get_dedalo_backup_files` — plus a `getValue` that reports the would-be filename
  and the backup directory. See [area_maintenance](../areas/area_maintenance.md).
- **The update preconditions** read `newestBackupMtimeMs()` to warn before a
  destructive operation runs without a recent backup.
- **Diffusion** is not involved: MariaDB belongs to the diffusion engine. See
  [Diffusion](diffusion.md).

## Examples

### Force an immediate backup

```ts
import { initBackupSequence } from './backup.ts';

// what the make_backup widget's make_psql_backup action does
const response = await initBackupSequence(-1, true); // forced → dump now, '_forced' filename
// response.result, response.pid, response.file_path
```

### List existing backups

```ts
import { getBackupFiles } from './backup.ts';

const files = getBackupFiles(); // [{name, size}, …] — *.backup, newest first
```

### Resolve the version-matched binary

```ts
import { resolvePgDump } from './backup.ts';

const pgDump = resolvePgDump();
// e.g. '/opt/homebrew/opt/postgresql@18/bin/pg_dump' when the server is v18
// and a matching install exists, else a bare 'pg_dump' from PATH
```

## Related

- [Architecture overview](../architecture_overview.md) — the work-PostgreSQL vs
  publication-MariaDB split this module only handles one side of.
- [area_maintenance](../areas/area_maintenance.md) — the widget that drives it.
- [db](db.md) — the database layer it dumps.
- [Sections](../sections/index.md) — the `matrix` tables inside the dump.
