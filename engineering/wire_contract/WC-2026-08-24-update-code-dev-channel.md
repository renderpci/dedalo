# WC-2026-08-24-update-code-dev-channel — the code updater grows a developer channel, and the installed tree gains an identity that is not its version

- **Date:** 2026-08-24.
- **Decision:** a code master may OFFER developer builds (`<v>-dev.zip`) to
  installations that explicitly ask for them, and such a build installs OVER
  THE SAME VERSION. Because the version then no longer distinguishes the new
  tree from the old one, the installed ARCHIVE DIGEST becomes the tree's
  identity everywhere that question is asked.

## Why

Developers make small changes on the `v7` development branch and need to test
them on remote installations. Cutting a release on `master` for each is not a
cost problem, it is a correctness one: a version number that moves without a
release means the version stops naming a release. So the version stays put and
the update is allowed to repeat it.

Nothing about a branch build being unreleased is hidden — the opposite: it is
labelled on the wire, in the panel, and in the version string.

## Shape before

- `code_manifest.buildCodeUpdateInfo` only ever looked for `<v>.zip` and only
  for the next linear rung. A `-dev.zip` was servable by URL and advertised to
  nobody, under the stated rule "do not teach the manifest the `-dev` name".
- `code_update.assertLinearUpgrade` refused `target === current` with
  `refusing a downgrade or same-version install`.
- `/health` answered `{result, entity, version, db, request_id}`.
- `boot_confirm.confirmBootedCodeUpdate` flipped the pending sentinel to
  `confirmed` when `sentinel.version === runningVersion`.
- The sentinel was `{version, previousVersion, updateMode, stamp, backupDir,
  status, rollback_attempted}`.
- `DEDALO_PRERELEASE_TAG` was `.dev` iff `build_info.txt` was unexpanded.

## Shape after

REQUEST — `dd_utils_api.get_code_update_info`
- `options.channel`: `'master'` (default, and the value of anything that is not
  exactly `'dev'`) | `'dev'`. Unknown to older masters, which ignore it.

MANIFEST — `CodeReleaseItem`
- New OPTIONAL `channel: 'dev'`, present only on developer items. A published
  release carries NO `channel` key: **the release manifest is byte-unchanged**
  (gated in `test/unit/code_manifest.test.ts`).
- Developer items are emitted only when the consumer asked `channel:'dev'` AND
  this master set `DEDALO_CODE_SERVER_DEV_CHANNEL=true`. They lead the list
  (the client pre-selects the first row) and include the consumer's CURRENT
  version — which is the feature: a branch build has no bump to offer.
- A dev item without a `.sha256` sidecar is still uninstallable (WC-024).

REQUEST — `update_code.update_code`
- `options.file.channel` is forwarded verbatim from the manifest item. On
  `'dev'`, `assertLinearUpgrade` accepts `target === current`. Downgrades and
  rung skips stay refused on both channels.

`/health`
- New key `install_digest: string | null` — sha256 of the archive this tree was
  installed from; ALWAYS present (null on a dev checkout or a pre-stamp
  install), because a client cannot tell an absent key from a changed value.

SENTINEL (`<backupRoot>/last_code_update.json`)
- New key `installDigest`. `deploy/dedalo-code-rollback.sh` REWRITES the
  sentinel and now carries the key through verbatim; a sentinel written before
  today has no key and is rewritten without one.
- `confirmBootedCodeUpdate` compares `installDigest` when present, falling back
  to `version` for legacy sentinels.

THE TREE
- The updater writes `src/core/update/install_stamp.json` into the tree it
  swaps in (`{digest, channel, source_url, installed_at}`), before the smoke
  boot, so the validated tree is byte-for-byte the tree that lands. It is
  gitignored: it is per-install provenance, never source.
- `DEDALO_PRERELEASE_TAG` is `.dev` when the build stamp is unexpanded OR the
  install channel is `dev`, so a branch build reports `7.0.1.dev` in
  `/health`, `page_globals.dedalo_version` and the login About panel instead of
  impersonating the published `7.0.1`.
- `codeServerStatus` gains `dev_channel`; `consumerStatus.engine` gains
  `install_channel` and `install_digest`, and its `posture` is `dev` for a
  developer build even though `git archive` expanded its build stamp.

RESTORE POINTS
- `dedalo_<version>_<sha7>_<stamp>` when the replaced tree carried a stamp
  (`dedalo_<version>_<stamp>` otherwise). Same-version iterations were
  otherwise distinguishable only by timestamp.

## What this does NOT relax

The dev channel relaxes an ORDERING guard, never an AUTHENTICITY one.
`file.channel` is client-supplied and forgeable, and forging it buys exactly
one thing: installing a same-version archive **the configured master really
published**. Unchanged and still enforced: the origin must match a configured
`CODE_SERVERS` entry, redirects are refused, the archive must match the
master's own `.sha256` sidecar, and the operator must be a superuser, in
maintenance mode, with a recent backup (or an explicit, logged waiver).

`install_digest` on an anonymous `/health` names a public archive that is
published next to its own public digest, so it discloses nothing the release
URL does not.

## Gates

- `test/unit/code_update.test.ts` — the same-version dev swap (stamp, sentinel
  digest, restore-point name), the dev/release version-guard matrix, and
  **`boot_confirm` under a same-version install**: the rolled-back old tree
  must NOT confirm. That last one is the regression gate for the defect this
  design was rebuilt around.
- `test/unit/code_manifest.test.ts` — both switches required; release manifest
  unchanged; the same-version dev item advertised with its digest.
- `test/unit/update_install_stamp_native.test.ts`, `build_stamp_native.test.ts`
  (`prereleaseTagFor`), `health_payload_native.test.ts`,
  `update_status_native.test.ts` (`enginePosture`, `dev_channel`).
- `test/unit/client_update_code_render.test.ts` — the switch, the digest
  plumbing (including across a panel resume), and `resolve_health_outcome` on
  the same-version path.
- `bun run test:update:dev` — the real-scenario drill on the dev channel: a
  branch build, served as `-dev.zip`, installed over the same version, proven
  live by `install_digest` rather than by a version that cannot move.
