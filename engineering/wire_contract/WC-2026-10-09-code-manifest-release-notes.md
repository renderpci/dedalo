# WC-2026-10-09-code-manifest-release-notes — `get_code_update_info` items carry their release's notes; `release.json` freezes them

- **Date:** 2026-10-09 (installer unification, item D3).
- **Decision:** installer unification plan D3 — the operator reads what a release
  changes before choosing it, on every installation (tree swap and image alike).

## Shape before (TS)

- **`dd_utils_api` `get_code_update_info` → `files[]`:** `{ version, url, date,
  sha256?, channel?: 'dev' }`.
- **`changes/<version>/release.json`:** `{ version, date, from, to, commits,
  wire_contract }` (scripts/lib/change_log.ts, closed shape).

## Shape after (TS)

- **`files[]` PUBLISHED items** (no `channel` key) gain an optional
  `notes` — present only when the master's own `changes/<version>/release.json`
  froze them:

  ```
  notes: {
    date: 'yyyy-mm-dd',                       // release.json `date`
    action_needed: string[],                  // titles of the release's breaking fragments, newest first
    entries: [{ type: 'security'|'removed'|'deprecated'|'changed'|'added'|'fixed',
                audience: 'user'|'admin'|'developer',
                title: string }]               // one per fragment, in the change log page's order
  }
  ```

  Developer items (`channel: 'dev'`) NEVER carry `notes`. No snapshot, a snapshot
  without notes (every beta snapshot), or anything malformed ⇒ the key is
  absent. The engine reads JSON only (`src/core/update/code_manifest.ts`
  `readReleaseNotes`); the master passes `changesDir = <projectRoot>/changes`.
- **`release.json`** gains an optional `notes: { action_needed, entries }`
  (closed shape, validated by `parseRelease`), written by
  `bun run changelog release` from `deriveReleaseNotes(fragments)` — the ONE
  derivation. Snapshots cut before 2026-10-09 have none.

## Reason

A code server advertises each release to every installation's update panel; an
operator choosing a version had only a version number and a date. The notes the
change log already publishes are the right content, but the engine must not
parse markdown fragments at runtime, so the release cut freezes a machine-read
digest next to the snapshot it already writes.

## Gate reconciliation

- TS-native, no parity gate involved: `code_manifest.test` (notes on published
  items only, absent without a snapshot, never on dev items, malformed never
  throws), `change_log_tripwire` (every snapshot's notes equal
  `deriveReleaseNotes` of its fragments; the closed shape refuses anything else;
  the REAL `changelog release` writes them, executed in a scratch copy), the
  browser suite `test_update_code.js` (the modal renders them).
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen fixtures never
  contained a code-update manifest item with `notes`, and items without a
  snapshot are byte-unchanged.
