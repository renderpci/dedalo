# WC-2026-08-15-code-manifest-sha256-and-snake-keys — the release manifest carries the digest, in the keys the client reads

- **Date:** 2026-08-15 (pre-deployment review of the code-master feature).
- **Decision:** — (DEC-12 gates: `test/unit/code_manifest.test.ts` sidecar +
  wire-key cases, `test/unit/code_serving.test.ts`,
  `test/unit/update_code_widget_native.test.ts` probe role + build option shape,
  `test/unit/code_update.test.ts` missing-checksum refusal; `WC-024` remains the
  owning entry for `update_code` owned mode.)

### Shape before (TS, until 2026-08-15)

`buildCodeUpdateInfo` (`src/core/update/code_manifest.ts`) served each release as:

```json
{ "version": "7.0.1", "url": "…/dedalo/install/code/7.0.1/7.0.1.zip",
  "date": "…", "forceUpdateMode": "clean" }
```

Two things were wrong with those bytes, and one with the URL:

1. **No `sha256`.** `code_build.ts` has always written a `<file>.zip.sha256`
   sidecar, but nothing read it back. The consumer's check is
   `if (declaredSha !== '' && verifySha(...) !== declaredSha)` — with no hash on
   the wire the condition was never entered, so WC-024's integrity guarantee
   ("sha256 verification against the manifest hash; PHP verifies nothing") was
   inert in practice: a release was installed on TLS + origin pinning alone.
2. **`forceUpdateMode` is not a name any consumer reads.** Both the client
   (`render_update_code.js` `set_update_mode`) and the server-side executor
   (`code_update.ts`, `file.force_update_mode`) read the SNAKE_CASE spelling —
   the same one `catalog.ts:119` already emits on the data-update wire. A
   release mandating a clean install was therefore silently installed
   incremental.
3. **The advertised URL was served by nothing.** `/dedalo/install/code/…` had no
   route (only the ontology twin `/dedalo/install/import/ontology/…` existed), so
   every download 404'd after passing every gate before it.

### Shape after (TS)

```json
{ "version": "7.0.1", "url": "…/dedalo/install/code/7.0.1/7.0.1.zip",
  "date": "…", "sha256": "<64 hex>", "force_update_mode": "clean" }
```

- `sha256` is read from the build's sidecar; a missing or malformed sidecar
  omits the KEY (never a partial/false digest).
- `force_update_mode` replaces `forceUpdateMode`. The CATALOG field keeps its
  camelCase TS name (`UpdateDescriptor.forceUpdateMode`) — only the wire item
  changed.
- `src/core/update/code_serving.ts` serves the advertised URL, fail-closed on
  `IS_A_CODE_SERVER` + `DEDALO_CODE_FILES_DIR`, resolving through the same
  `codeReleasePath` confinement gate the manifest uses. The `.sha256` sidecar is
  fetchable at the same URL + `.sha256` (public digest of public code).
- **The consumer now REFUSES an unsigned release**: `updateCode` requires a
  64-hex `file.sha256` before anything is downloaded. "Verify if offered a hash"
  becomes "verify or refuse".

### Two adjacent request-shape fixes, same date

- **`get_server_ready_status` is asked for the CODE role.** The update_code panel
  probed every configured code server with `options.check: 'ontology_server'`
  (the shared `checkRemoteServer` hardcoded it). A code-only master answers only
  the `'code_server'` branch, so it refused, rendered UNREACHABLE, and its radio
  stayed disabled — no code update was startable against a master that was not
  ALSO an ontology master. `checkRemoteServer(server, check)` now takes the role.
- **`build_version_from_git_master` accepts the panel's option shape.** The two
  build buttons send `{branch: 'master'|'developer'}`; the handler read only
  `version`/`ref`, so `version` was `''` and every build refused with
  'Invalid version number'. The branch now maps to the git ref, with the release
  version defaulting to `DEDALO_VERSION`; an explicit `version`/`ref` still wins.

### Reason

A code update replaces the engine's own tree and restarts it. Every other guard
in that pipeline (TLS pin, redirect refusal, zipinfo symlink pre-validation,
quarantine extract, linear-upgrade backstop) assumes the bytes are the bytes the
master built — which only the digest establishes. Shipping the checksum but
never comparing it is worse than not having one: the posture reads as verified.

### Gate reconciliation

**No fixture re-harvest.** `get_code_update_info` has no oracle fixture and
`UPDATE_CATALOG` is empty, so no current install's served manifest changes bytes
today; the shape is pinned by the unit gates named above. A master with a
populated catalog serves the new keys from the first build.
