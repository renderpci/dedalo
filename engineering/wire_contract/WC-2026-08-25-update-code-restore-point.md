# WC-2026-08-25-update-code-restore-point — a restore point becomes an ACTION, and its wire row grows the facts the action turns on

- **Date:** 2026-08-25.
- **Decision:** the `update_code` widget gains a third action, `restore_code`,
  which puts a listed restore point back on the tree; and `RestorePoint` — a
  read-only listing until today — grows the five fields the panel needs to
  offer, refuse, or explain that action.

## Why

Every code update renames the live tree aside into a restore point under
`<backupRoot>/dedalo_<version>[_<digest7>]_<stamp>`, keeping its `node_modules`
so a bare `mv` boots with no network. The panel LISTED those points
(`status.ts readRestorePoints` → `render_update_status.js`) but they were
inert facts: the only human path back was a manual `mv` over ssh, since
`deploy/dedalo-code-rollback.sh` is fired by systemd alone and only for a
still-PENDING sentinel. A rollback affordance that exists only for the
supervisor is not an operator affordance.

The listing could not carry the button either. A row said "bootable"; it could
not say WHICH code it held, whether the pipeline would accept it, or why not.

## Shape before

- `update_code.apiActions`: `update_code`, `build_version_from_git_master`.
- `consumerStatus().restore_points[]`: `{ name, stamp, bootable }`.

## Shape after

REQUEST — `update_code.restore_code` (new action, ownership-gated exactly like
`update_code.update_code`: closed installs get the frozen `engine_denied`
refusal)
- `options.name: string` — the restore point's NAME, never a path. Refused
  before it is joined when it carries `/`, `\`, a NUL, a `..` segment, or does
  not start with `dedalo_`; then matched against `readRestorePoints(backupRoot)`
  by name. A name that is not in the listing is not a restore point.
- `options.confirm_downgrade: boolean` — the ONLY waiver for the database
  hazard, read with a strict `=== true` on both sides. Required exactly when the
  point's declared version differs from the running one, because restoring code
  does NOT revert applied migrations. The waiver is logged loudly
  (`[code restore] VERSION CHANGE CONFIRMED by request …`), the `waive_backup`
  idiom.
- RESPONSE: the `updateCodeOwned` shape verbatim — `data:true`, `msg`, and the
  `{pid, pfile}` extension keys of a background mediaJobs job. Its progress
  frames are `UpdatePhaseFrame`s, unchanged, with `download`/`verify`/`extract`/
  `deps` arriving `skipped` (a restore fetches and installs nothing) and
  `preflight` arriving `skipped` on a point that predates `DEDALO_SMOKE_BOOT`.
  The client's phase reducer therefore needs no restore-specific branch.

STATUS — `consumerStatus().restore_points[]` gains five fields, all read from
the point's own tree:
- `version: string | null` — what its own `src/core/update/version.ts` declares
  (a BARE triple: no prerelease tag, so it compares against the server's
  `DEDALO_VERSION_TRIPLE.join('.')`, never against
  `page_globals.dedalo_version`).
- `digest: string | null` — the sha256 of the archive it was installed from
  (its `install_stamp.json`), null on an unstamped tree. The restore's sentinel
  carries THIS digest so the restored tree confirms itself
  (`boot_confirm.ts`) instead of screaming a mismatch forever.
- `bun_pin: string | null` — the Bun its `.bun-version` pins, null when it pins
  none.
- `restorable: boolean` + `restorable_reason: 'not_bootable' |
  'unknown_version' | 'bun_pin_mismatch' | null` — the pipeline's OWN verdict.
  Both are computed by `code_restore.ts restorabilityOf`, which the restore
  pipeline refuses on and `status.ts` imports: the panel may never reach a
  verdict the pipeline reaches differently (`status.ts`'s header states that
  law). The wire carries the reason ID; the sentence is the client's, keyed
  `update_code_restore_reason_<id>` in the label catalog.

A version MISMATCH is deliberately NOT a `restorable:false` reason — it is the
waivable hazard `confirm_downgrade` exists for.

## Reason

PHP had no restore path at all (`update_code::update_code` overlaid the tree
in place and kept no backup), so there is no fossil to diverge from: this is
TS-only surface. It is recorded here because it is new WIRE — a new action verb
and five new fields on a payload the client already consumed — and the ledger is
the wire law.

## Gate reconciliation

No re-harvest. The widget is post-cutover surface, so no fixture in
`test/parity/fixtures/oracle_harvest/` carries an `update_code` widget PAYLOAD —
the two that name the widget at all name something else, and neither moves:
`widgets_differential.json` holds only the string `update_code` as a datalist id
(the widget EXISTS; nothing about its shape), and `dedalo_files_differential.json`
holds the client FILE LIST, which this change does not grow — every file it
touches under `widgets/update_code/js/` already existed. That second gate is a
frozen red (`engineering/parity_baseline.json`) over exactly two of this widget's
post-harvest files, `render_update_status.js` and `update_code_phases.js`, so
ADDING a `.js` here would move a frozen number and needs the baseline in the same
commit. Modifying these files, as this entry does, does not.

- `test/unit/update_restore_native.test.ts` — the pipeline: the name grammar and
  the membership check, each `restorable_reason`, the downgrade waiver, the
  live-tree secret gate (root and nested), that an OLDER point restores across
  a release that added root entries, the pre-flight boot — its skip on a
  flag-blind tree AND its failure leaving the live tree untouched —, the
  sentinel's ordering and its digest, the double-rename repair, and the shared
  run lock. Also that `readRestorePoints` rows and
  `restorabilityOf` agree, row by row.
- `test/unit/update_status_native.test.ts` — the listing's shape.
- `test/unit/update_ownership_tripwire.test.ts` — `restore_code` is
  ownership-gated with the rest.
- `test/unit/client_update_code_render.test.ts` — the client reads the SERVER's
  version for the downgrade decision, the reason ids all have labels, and the
  waiver label carries the `%s` the client substitutes.
- `client/dedalo/test/client/js/test_update_code.js` — the modal's decision in a
  real DOM: no waiver at an equal version, a locked submit until it is ticked.
