# WC-2026-10-21-target-statement-lock-wait — a MariaDB target statement waits for another session's lock at most 30 s; R4 narrows

- **Date:** 2026-10-21 (W4 cross-diffusion:r4, review-diff finding S2 "Fence keepalive holds a
  target lock with no time limit while a MariaDB statement that has no timeout hangs"). Amends
  `WC-2026-09-30-diffusion-target-fence` residual R4.
- **Decision:** DEC-12 (gated: `test/unit/diffusion_target_statement_lock_wait_native.test.ts`).
- **Shape before (TS):** a door's unit keeps its publication-target lock (`sql:<db>`) for as long as
  its work runs — the keepalive refreshes the Postgres idle bound by design. No statement the doors
  ran on the MariaDB target had a lock-wait bound, so a statement WAITING for a lock another session
  held kept the target that long: the writer's `ALTER TABLE … ADD` behind the public site's long read
  (a metadata lock — MariaDB's `lock_wait_timeout` defaults to a day), its `CREATE TABLE IF NOT
  EXISTS`/upsert/DELETE queued behind someone's pending schema change, an upsert or DELETE behind a
  row lock (`innodb_lock_wait_timeout`, server-configurable). Every other run waited, every
  request-path unpublish went pending, the operator doors burned their budget, and the record-delete
  request itself hung behind its DELETE.
- **Shape after (TS):** every statement a door runs on a `sql:` target inside its unit goes through
  `boundSqlTargetStatement` (`core/diffusion_bridge/target_lock.ts`):
  `SET STATEMENT lock_wait_timeout=30, innodb_lock_wait_timeout=30 FOR <statement>`
  (`SQL_TARGET_LOCK_WAIT_S`; merged into a statement's own `SET STATEMENT`, never leaking to the
  pooled connection). Doors: the writer (`writers/mariadb_sql.ts` CREATE, ALTER ADD, upsert, unpublish
  DELETE — not the INFORMATION_SCHEMA read, whose metadata lock is high-priority and never queues),
  the record-delete executor (`targets/mariadb/delete_record.ts`, which also serves the ghost
  unpublish), the phantom-lang sweep (its default target pool, `targets/mariadb/lang_sweep.ts`), the
  media-index rebuild's read (`targets/mediastore/media_index.ts`). Waited out, the statement fails
  with errno 1205 and the unit rolls back, releasing the target:
  - a run: `failed` (`diffusion.run_failed`, the 1205 as its logged cause); re-run it;
  - the record delete / ghost unpublish: `'<db>|<table>: Lock wait timeout exceeded; …'` in `errors`
    — the dd1758 row stays `pending` for the retry queue (R3);
  - the sweep: `'<db>.<table> [<lang>]: Lock wait timeout exceeded; …'` in `errors`, nothing swept;
  - the media-index rebuild: `'<db>.<table>: Lock wait timeout exceeded; …'` in `errors`, that
    table's markers kept.
- **R4 narrows:** a unit no longer holds its target while a statement WAITS for someone else's lock.
  What is left is unchanged and still an owner call: a statement that WORKS for long (a long ALTER
  that holds its locks), and one that never returns at all (a write on a half-open TCP connection —
  the target pool sets no socket timeout). The bound here fails nothing legitimate in R4's sense: it
  never interrupts a statement's work, only its wait.
- **Reason:** a publication target must not be held hostage by a session outside the engine.
  Bounding the wait also protects the public site: while the writer's ALTER queues for its metadata
  lock, every new read of that table queues behind it.
- **Gate reconciliation:** TS-only (the fence has no oracle shape; no re-harvest).
  `diffusion_target_statement_lock_wait_native` W1–W4, D1, S1, M1 on the suite MariaDB, each door in
  its real unit with the bound shortened to 1 s by `withSqlTargetLockWaitForTests`: errno 1205 inside
  15 s, and the target lock free while the blocker still holds. Mutation-verified, each red alone: any
  one door unwrapped; the bound without `lock_wait_timeout`; without `innodb_lock_wait_timeout`;
  without the merge; the seam ignored.
