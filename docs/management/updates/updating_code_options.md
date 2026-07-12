# Updating code options

> See also: [Updating code](updating_code.md) · [Updates](index.md)

The panel self-update (`update_code` widget, `src/core/update/code_update.ts`) offers two swap strategies once a release archive has been downloaded, verified and extracted into a quarantine directory: **Incremental** and **Clean**.

Both strategies preserve `node_modules` and `.git` from the live tree across the swap, and neither touches `../private/` — your configuration and secrets live outside the code tree entirely, so there is nothing to restore there.

## Incremental

The incremental option overlays the new release's files onto the live tree: every file the release ships is copied over, and anything the live tree has that the release does not touch is left in place. This is the default `update_mode`.

This option is valid for patches and minor versions.

## Clean

The "clean" option performs an atomic, rename-based swap: the current tree is moved into `../backups/code/dedalo_<version>_<timestamp>/` and the newly extracted release becomes the live tree in one rename. This guarantees no stale files survive from the previous version — appropriate for major upgrades, where the directory layout itself may have changed.

The swap requires the backup directory to be on the same filesystem as the install (so the renames are atomic); it refuses otherwise rather than risk a partial, non-atomic move.

## Choosing between them

For patches and certain minor versions, Incremental is usually sufficient. For major updates, prefer Clean — the previous tree is fully preserved in the backup directory either way, so you can always recover an old file if the incremental overlay ever left something unexpected behind.

## After the swap

Whichever mode you choose, the server needs to restart onto the new code —
this requires a detected process supervisor (see
[Updating code](updating_code.md#panel-self-update)). A record of the last
code update (`version`, `updateMode`, timestamp, success) is written to
`last_code_update.json` in the backup directory.
