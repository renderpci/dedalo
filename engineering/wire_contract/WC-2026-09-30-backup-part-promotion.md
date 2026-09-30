# WC-2026-09-30-backup-part-promotion — a dump being written is invisible; a `*.backup` name only ever holds a promoted dump

- **Date:** 2026-09-30 (audit 2026-09-26, OPS-2).
- **Decision:** none (a defect fix with a wire effect).
- **Doors:** `dd_area_maintenance_api::widget_request` → `make_backup.make_psql_backup`,
  `make_backup.get_dedalo_backup_files`, and `make_backup`'s `get_value`
  (`file_name`), through `src/core/area_maintenance/backup.ts`.

## Shape before

- `initBackupSequence` pointed pg_dump's `-f` at the FINAL
  `<Y-m-d_His>.<db>.postgresql_<user>_forced_dbv<v>.custom.backup` name. For the
  whole life of the dump the partial archive sat under that name, so
  `get_dedalo_backup_files` LISTED a running dump (with a growing size), and the
  freshness scan judged it.
- A second `make_psql_backup` landing on the same name (same second) judged the
  live dump — a header-only prefix — `not_an_archive`, retired it as `.failed`
  from under its own pg_dump, and started a second pg_dump on the same path.
- `make_psql_backup`'s `extend.file_path` named a file that existed (partially)
  at once.
- The widget's `get_value.file_name` was built from its own copy of the name
  grammar.

## Shape after

- pg_dump writes `<final>.part`, claimed atomically (`open wx`). `.part` is not a
  `*.backup` name, so **`get_dedalo_backup_files` omits running dumps**; its
  entries are only ever promoted dumps (or foreign files under that suffix).
- A second claimant of the same name answers the existing ` Skipped backup. A
  recent backup already exists ('<final>'). It is not necessary to build another
  one` message and never touches the live dump.
- **`extend.file_path` still names the FINAL artifact, which now appears only on
  success**: after pg_dump exits 0 AND a full `pg_restore -f /dev/null` read
  proves the bytes (then with its `<final>.verified` proof), or — on a host that
  cannot finish the read (no pg_restore, the read outran its budget) — after
  exit 0 alone, WITHOUT a proof ("completed, not verified"; see the second
  addendum for the exact law). The process record
  (`get_process_status`) reports `done` with `OK. Backup done: <name> (<bytes>
  bytes, verified_deep)`; on a host that cannot verify, `(… completed, not
  verified (<reason>))`.
- Every failure (non-zero exit, a truncated or non-archive result) keeps the bytes
  as `<final>.failed` (an empty one is deleted) and the process record ends
  `error` — no `.part` and no `.backup` is left behind.
- A `*.custom.backup.part` older than 24 h (an orphan of a server that restarted
  mid-dump) is **adopted, never deleted**, by the next dump (detached from its
  request): a full read that proves it → it gets its final name and sidecar;
  disproved, or proven but the name is taken → `<final>.orphaned`; undecided →
  left for the next pass. A younger one is never touched. Same rule in
  `deploy/dedalo-db-backup.sh`.
- A `*.custom.backup` (our suffix) whose first bytes are not the `PGDMP` archive
  magic is `not_an_archive` (disproved, cached, retired on a name collision) —
  it used to be `unverifiable_foreign_format` (counted). Other names keep the
  foreign-format degradation.
- `get_value.file_name` comes from the ONE builder (`backupFileName`) the engine
  names dumps with. Bytes unchanged for the forced/user -1 case the panel shows.

### Addendum (same day, OPS-2 review) — the status record is a job

- **The process record is a registered `mediaJobs` job**, kind `backup`, lane
  `maintenance`, no deadline — no longer a pfile written by hand and owned by the
  pg_dump child. The record stays live (served from the job registry) through
  pg_dump AND the full read that follows it, so a `get_process_status` poll
  during verification reads `is_running: true`; before, the lazy reconcile saw a
  dead owner and ended a SUCCESSFUL backup as `interrupted: owning server process
  died (lazy reconcile)`.
- Frames: `pid` is `null` (the job, not the child, owns the record).
  ~~`make_psql_backup`'s `extend.pid` still names the child when it was spawned
  inside the fast-fail window, else `null`~~ — SUPERSEDED by the second
  addendum: `extend.pid` is always the server's pid (the job's owner). `data.msg` moves `Backup running: <name>` →
  `Verifying backup: <name>` → `OK. Backup done: …`. A failure ends `error` with
  `errors: ['Error. Backup failed (<reason>)[: <pg_dump log tail>]']` and the
  typed `error` body of `maintenance.action_failed` (public disclosure: that
  sentence).
- The record now carries `user_id` (the caller — see the third addendum: until
  it, the widget passed its FILE-NAME identity, -1, so the owner was always
  root): it streams to its owner and to global admins only (it was unowned). `stop_process` on it kills the dump
  (SIGTERM) — the part is retired as `.failed`, the frame ends `stopped`; a
  server shutdown ends the frame `interrupted` but leaves pg_dump running for the
  adoption above.
- `make_psql_backup` waits for a fast-exiting dump's verdict at most
  `min(5 s, idleTimeout/2)`; past that it answers `OK. backup process running…`
  with the pfile (the request never awaits a queued full read).
- A pg_dump that exited non-zero is retired whatever its bytes (a complete,
  readable archive included); a file that appeared at the final name while the
  dump ran is never overwritten (the dump is retired instead, `error`:
  `another file took the backup name while the dump ran`).
- The rename and the sidecar are durable (sidecar tmp + fsync + rename; directory
  fsync after the promotion rename), and so is the nightly script's `mv` (`sync`).

### Addendum (same day, second review round) — the exact law, and what changed on the wire

- **Two doors name a dump, and they prove different things** (the text above
  said "exit 0 → full read → sidecar → rename" is the ONLY way; it was not):
  - the dump's own promotion: pg_dump exited 0 AND a full read proved it →
    named WITH `<final>.verified`; exit 0 but the read could not look (no
    pg_restore, or it outran its budget) → named WITHOUT a sidecar,
    "completed, not verified" (every later freshness ask reads it again);
  - orphan adoption: a part older than 24 h, whose exit status nobody saw, is
    named only when a full read PROVES it (with its sidecar).
  A `*.backup` of ours is therefore either proven (sidecar present) or a dump
  that exited 0 and was not read yet — never one known to have failed. Neither
  door ever names bytes over an existing file (a no-clobber rename).
- **`make_psql_backup`'s `extend.pid` is the server's pid** (the job's owner),
  never `null`: a job queued behind a full maintenance lane has no pg_dump child
  yet, and a `null` pid made the client refuse to poll (`get_process_status`
  answered `Error: pfile and pid are mandatory`). The `pfile` identifies the job,
  as for `update_code` / `update_data_version`.
- **Retirement never overwrites**: a failure whose `<final>.failed` is taken is
  kept as `<final>.failed.1`, `.2`, … (an earlier failure used to be unlinked);
  an orphan whose `.orphaned` name is taken likewise gets `.orphaned.<n>`.
- **An EMPTY orphaned part is left in place** (engine and `deploy/`): a
  custom-format pg_dump writes nothing until it holds every table lock, so a day
  of lock wait is a live 0-byte part; removing it made that dump write into an
  unlinked file. The deploy script's adoption asks the FULL read (not only
  `--list`) and never renames onto a taken name — both now gated by a fake
  pg_restore that tells the two reads apart.

### Addendum (same day, third review round) — only the bytes disprove, at both doors

- **The dump's own promotion names a read that FAILED FOR A HOST REASON**: a
  dump that exited 0 whose read-back is `unverifiable_read_failed` (the read
  killed from outside — the OOM killer —, an I/O error on the backup storage, a
  pg_restore older than the archive) is named WITHOUT a sidecar, `done` with
  `OK. Backup done: <name> (<bytes> bytes, completed, not verified
  (unverifiable_read_failed))`. It used to be retired as `<final>.failed` and
  the job ended `error` — a complete restore point lost to a transient event.
  The dump door now retires on exit ≠ 0, a DISPROOF (empty / not an archive /
  truncated), a part that moved after pg_dump exited, or a taken name — never
  on a verdict that only says the host could not judge.
- **The nightly script's orphan adoption follows the engine**: a day-old part
  whose read fails is moved to `.orphaned` only when pg_restore's words say the
  BYTES are damaged (the engine's ARCHIVE_DAMAGE list); a read killed by a
  signal, an I/O error, an old pg_restore or uncatalogued words leave the part
  in place for the next pass (`left <part> in place — …` on stderr). Every
  move is no-clobber (`ln`, then the old name is dropped).
- **`user_id` is the CALLER**: `make_psql_backup` gives the job the caller's
  principal (who may stream and stop it); the FILE keeps the forced dump's `-1`
  grammar (`get_value.file_name` unchanged). `initBackupSequence` takes the two
  identities apart (`userId` names the file, `ownerId` owns the job).

## Reason

An operator watching the list saw a backup that was not one; the freshness gate
could count it; and a double click destroyed the dump it was waiting for.

## Gate reconciliation

No re-harvest (DEC-14b): `make_backup` is post-cutover surface with no frozen
payload of these actions. Gates: `test/unit/backup_inflight_native.test.ts`
(legs a–r: liveness during verification, the timeout / no-pg_restore /
read-killed-from-outside promotions, the caller owning the widget's job, the name collision, a complete archive with exit 1, adoption as
initBackupSequence starts it — a taken name, an empty part —, the throttle, a
QUEUED dump's pollable handle, this process's own live part, stop vs shutdown,
no-overwrite retirement), `test/unit/operator_commands_tripwire.test.ts` (the
deploy script's adoption — proven, disproved, taken names, and the undecided
EIO / killed reads left in place), `test/unit/ops_backup.test.ts` (no `.part` / `.backup` after a
failure; the listing seam), `test/unit/backup_recency_native.test.ts` (a `.part`
is not recency), `test/unit/backup_freshness_deep_native.test.ts` leg N and
`backup_restorability_native` (our suffix without the magic).
