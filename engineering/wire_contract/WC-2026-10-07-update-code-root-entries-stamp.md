# WC-2026-10-07-update-code-root-entries-stamp — the install stamp records the release root, and the root whitelist retires what a later release dropped

- **Date:** 2026-10-07.
- **Decision:** the install stamp records the top-level entries of the archive
  the tree was installed from. The code updater's root whitelist then accepts a
  live root entry that the installed release SHIPPED and the incoming release
  DROPPED (it moves into the backup with the old tree), and refuses everything
  else exactly as before.

## Why

The root whitelist (`code_update.ts` `refuseUnaccountedLiveEntries`) compared
the live root with the incoming release only. That covers growth, never
removal: `.vscode` shipped in every release until it was untracked
(0ebc82b616), and every install that had taken such a release then refused the
next update with "Unknown entries at the code-tree root … .vscode". The
operator was told to delete a file the PROJECT had shipped, and an install
without shell access could not update at all. Any future root removal (a
renamed config, a retired script) would repeat it.

Without the old release's root list, a removed release file and an operator
drop-in look the same. The live tree's own stamp is where that list lives.

## Shape before

- `src/core/update/install_stamp.json`: `{digest, channel, source_url, installed_at}`.
- Swap: every live root entry not shipped by the incoming release (and not
  preserved, OS metadata or `node_modules`) refused with `update.refused`.
- `consumerStatus.tree.unaccounted_root_entries`: every live root entry minus
  preserved/ignored/census entries; the `root_entries` check was always
  `unknown`, its detail the count.

## Shape after

THE TREE
- The stamp gains `root_entries: string[]`: the archive's root, sorted, read
  at extract (before `installDeps`, so never `node_modules`). Parsed alone: a
  malformed list (a non-array, an item with `/` or `\`, `.`, `..`, empty, NUL)
  drops only that field, and the digest and channel stay trusted.

SWAP
- An unshipped live root entry listed in the LIVE tree's stamp is RETIRED: it
  rides the old tree into the backup, with one `console.warn` line naming it.
- An entry not listed, or any entry of a tree whose stamp has no list
  (pre-2026-10-07, unstamped, dev checkout), refuses with the
  **byte-unchanged** sentence.
- The secret walk still covers retired dirs: it walks the whole live tree.

STATUS (`consumerStatus`)
- On a tree whose stamp records `root_entries`, `unaccounted_root_entries`
  excludes them (what remains is operator-added), and the `root_entries` check
  reports a verdict: `ok` when empty, `warn` with the names as `detail`
  otherwise. Without the list, unchanged: `unknown`, count as detail.
- The client renders it generically (`render_update_status.js`, state chip +
  detail); no client change.

## Bootstrapping

The list helps only installs stamped by a release carrying this change. An
install taken before it still refuses once on a retired entry, which must be
removed by hand that one time.

## Prevention

`test/unit/release_root_entries_tripwire.test.ts` pins the shipped root set to
`engineering/release_root_entries.json` (adding an entry is a reviewed edit)
and fails on any editor/OS config at the root.

## Gates

- `test/unit/code_update.test.ts` — the stamp records the archive root; a retired
  entry passes; an unlisted drop-in refuses with the unchanged sentence; an
  unstamped tree and a list-less stamp both refuse; a secret inside a retired
  dir refuses.
- `test/unit/update_install_stamp_native.test.ts` — the list round-trips; each
  malformed shape drops only the list; `installedRootEntriesOf` reads the given tree.
- `test/unit/update_status_native.test.ts` — the `ok`/`warn` verdict on a stamped tree.
- `test/unit/release_root_entries_tripwire.test.ts`.

No parity fixture is affected: the update wire is TS-native (no oracle harvest).
