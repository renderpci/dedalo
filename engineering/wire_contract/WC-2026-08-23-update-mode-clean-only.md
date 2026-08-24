# WC-2026-08-23-update-mode-clean-only — the code update is clean-only: `options.update_mode` and `force_update_mode` leave the wire

- **Date:** 2026-08-23.
- **Decision:** the incremental code-update mode is DELETED (not defaulted
  away) under the premise rule; the wire keys that selected it go with it.

## Shape before (PHP + early TS)

PHP `update_code::update_code` accepted an `update_mode` option
(`'incremental'` default, `'clean'` opt-in) and its manifest could force the
choice per release via a `force_update_mode: 'clean'` key on each advertised
`files[]` item (`render_update_code.js` branched on the key's presence). The
TS port carried all three surfaces: `options.update_mode` on the
`update_code.update_code` widget request, `file.force_update_mode` echoed back
inside `options.file`, `force_update_mode` on the manifest's `CodeReleaseItem`
(fed by a catalog `forceUpdateMode` descriptor field), and an `update_mode`
key in the success response `data`.

## Shape after (TS)

- `options.update_mode` and `file.force_update_mode` are IGNORED on the
  request wire (unknown keys, no refusal — additive tolerance).
- The manifest (`core/update/code_manifest.ts`) never emits
  `force_update_mode`; `UpdateDescriptor` has no `forceUpdateMode` field.
- The success `data` is `{version}` — no `update_mode` key.
- The pipeline (`core/update/code_update.ts`) has ONE swap path: rename-based
  clean swap (old tree → backup, quarantine → target).

## Reason

An incremental swap is a `cpSync` overlay of the new tree onto the live one.
That is structurally wrong twice over:

1. an overlay NEVER DELETES files the release removed, so the "updated" tree
   is a superposition of two releases — dead modules stay importable and the
   tree matches no release's manifest or hash;
2. it CANNOT BE ROLLED BACK: there is no backed-up old tree to restore, which
   is incompatible with the 2026-08-23 rollback contract
   (`<backupRoot>/last_code_update.json` sentinel +
   `deploy/dedalo-code-rollback.sh` + `boot_confirm.ts`), whose whole premise
   is that the previous tree exists intact, `node_modules` included.

Clean is therefore the only path, not the default.

## Gate reconciliation

`test/unit/code_update.test.ts` (success `data` = `{version}`, no
`update_mode`; the pipeline tests drive no mode option) and
`test/unit/code_manifest.test.ts` (pins the ABSENCE of `force_update_mode` on
every advertised item). No frozen-fixture replay covers these widget surfaces
(the update_code EXECUTE was never harvested), so no parity gate moves.
