# WC-2026-08-25-update-code-waive-backup — the backup waiver becomes an operator control, and the readiness panel stops calling a waivable gate a block

- **Date:** 2026-08-25.
- **Decision:** the `waive_backup` flag the code updater has always accepted is
  now reachable from the update_code panel, offered at the moment of decision
  and only when it would change the outcome; and `backup_fresh` — the one
  precondition a request may waive — reports `warn`, not `blocked`.

## Why

Since 2026-08-23 a code update REFUSES without a recent DATABASE backup
(`preconditions.checkUpdatePreconditions`, `backupRequire`). The refusal
sentence names the way through — `(or pass waive_backup to proceed without
one)` — and `code_update.parseUpdateRequest` has read the flag, strictly and
with a loud log line, ever since. But nothing in `client/` ever put the key on
the wire: the panel's request body was exactly `{file, info}`. The only callers
able to waive were `scripts/update_drill.ts` and `scripts/update_probe.ts`.

So an operator whose backup was a day stale met a dead-end refusal quoting a
flag they had no way to send. A guard whose documented escape hatch is
unreachable is not a guard with an escape hatch.

The second half follows from the first. `consumerStatus.ready` is exactly "no
check is blocked" (`status.ts`), and `backupFreshnessCheck` returned `blocked`.
A panel that headlines **Update blocked** over a run the pipeline will accept is
the panel/pipeline disagreement `status.ts`'s own header forbids ("a readiness
panel that disagrees with the pipeline is worse than no panel: it would earn
trust it cannot keep").

## Shape before

- REQUEST `update_code.update_code` from the panel: `options = {file, info}`.
  `waive_backup` was readable by the server and sendable by nobody but a script.
- `consumerStatus().checks[id='backup_fresh'].state`: `'blocked'` when no backup
  was found (`detail:'none'`) or the newest one is older than
  `config.ops.backupTimeRangeHours`; `'ok'` otherwise. A stale backup therefore
  forced `ready:false`.

## Shape after

REQUEST — `update_code.update_code`
- `options.waive_backup: boolean`. The panel now ALWAYS sends the key; its value
  is `false` unless the operator ticked the modal's checkbox. Read on both sides
  with a strict `=== true` — a truthy stray must never be what disarms a guard.
  Semantics are unchanged from the server's side: `true` swaps the precondition
  to `{backupWarn:false}` and logs
  `[code update] BACKUP REQUIREMENT WAIVED by request (waive_backup: true, user <id>)`.
- It waives the DATABASE backup precondition ONLY. The code backup is the swap
  itself (two renames of a tree already on disk) and is never optional.

STATUS — `consumerStatus().checks[id='backup_fresh']`
- `state` is now `'ok' | 'warn'`; it is never `'blocked'`. `warn` is the check
  vocabulary's own word for a waivable condition ("allowed, but the operator
  should know"). `detail` is unchanged: the rounded age in hours, or `'none'`.
- Consequence: a stale or absent backup no longer forces `ready:false`. Every
  other `blocked` check still does.
- **`ready` therefore stops meaning "the default request will succeed"**, and
  the panel says so rather than pretending otherwise. `ready:true` with the
  backup waiver PENDING headlines *Ready to update, but only with a waiver*, in
  the warning voice — because the request the Update button sends by DEFAULT is
  `waive_backup:false`, which is still refused on that account. A bare "Ready to
  update" there would over-report exactly as loudly as the "Update blocked" it
  replaced. `ready:false` still headlines blocked, waiver or not. The wording is
  the client's (`render_update_status.js`); the wire keeps reporting states and
  facts.
- **"Pending waiver" is `backup_fresh` specifically, never "any warning".** The
  consumer half has three warn-capable checks — `backup_fresh`, `bun_pin`,
  `staging_clean` — and only the first is waivable. A headline keyed on any
  `warn` demanded a waiver over a leftover `.code_staging` dir or a bun-pin
  drift, with a fresh backup and no checkbox anywhere in the modal to give one:
  the same panel/pipeline disagreement, entered from the other side. The
  headline and the checkbox therefore read ONE exported predicate,
  `backup_waiver_check` (`render_update_status.js`), so they cannot drift — down
  to agreeing that an `unknown` backup check (a probe that threw) is a pending
  waiver rather than a stranded operator.

THE PANEL
- The readiness half is re-stated from the fresh value when the modal opens, so
  the panel behind it can never show the same freshness fact in a different
  state than the modal in front of it.
- The waiver is a checkbox in the version modal's footer, above the Update
  button — not on the panel beside the developer-builds switch — because it is a
  decision about this run, taken where the run is started.
- It is rendered ONLY when the payload's `backup_fresh` check is not `ok`, so a
  fresh install is never invited to disarm a guard that is not in its way. The
  panel value is re-read (`get_value`) before the modal opens, because freshness
  ages and `self.value` is seeded at `build()` time.
- A ticked box is restated in the `ui.confirm` note before the job is submitted.

## What this does NOT relax

The REFUSAL is untouched. An unwaived request with a stale or absent backup
still throws `update.refused` with the byte-frozen sentence
(`test/unit/update_preconditions.test.ts`). Superuser, maintenance mode,
supervisor, deployment channel, the runtime-path census, backup-root
containment, the origin allowlist and the sha256 sidecar check are all
unchanged and all still `blocked` when they fail.

Making `backup_fresh` a `warn` changes what the panel SAYS, never what the
pipeline DOES: the pipeline's verdict on an unwaived request is the same
refusal it was yesterday. The panel now agrees with it instead of over-reporting.

## Gate reconciliation

No re-harvest (DEC-14b). The `update_code` widget is post-cutover surface, so the
frozen store holds no payload of it to re-cut: `widgets_differential.json` names
`update_code` only as a datalist id, and `dedalo_files_differential.json` holds
the client file list, which this change does not grow.

- `test/unit/update_status_native.test.ts` — `backup_fresh` is never `blocked`,
  agrees with `backupFreshness()`, and keeps the age fact.
- `test/unit/update_preconditions.test.ts` — unchanged: the refusal path, and
  that its sentence still names `waive_backup`.
- `test/unit/client_update_code_render.test.ts` — the flag reaches the wire bag
  with a strict `=== true`; the row is conditional on `backup_fresh`; the label
  wraps the input; the confirm restates the waiver; the modal re-reads a fresh
  panel value; the labels exist in `master.json`; the CSS is scoped to the modal
  footer, not `.role_body`.
- `bun run test:update` — the real-scenario drill, whose `updateRequestBody()`
  is now literally the body the client puts on the wire.
