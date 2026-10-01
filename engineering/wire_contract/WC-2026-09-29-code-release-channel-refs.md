# WC-2026-09-29-code-release-channel-refs — a published release is a TAG; the developer channel is `master`

- **Date:** 2026-09-29.
- **Decision:** the two code channels are bound to fixed git refs, resolved on
  the server. RELEASE (wire token `master`, `<v>.zip`, advertised) = the newest
  PUBLISHABLE tag of the build checkout: stable canonical `vX.Y.Z` (no
  prerelease suffix, no leading zeros) AND a tree of this engine (it carries
  `src/core/update/version.ts` — the repository also holds the PHP-era `v6.x`
  tags, and `v6.9.7` is its newest stable tag while v7 is in beta). While a
  major is in beta there is no publishable tag: its code is exposed ONLY
  through the developer channel. DEVELOPER (`dev`, `<v>-dev.zip`,
  advertised only on request — WC-2026-08-24-update-code-dev-channel) = the tip
  of branch `master`. The checked-out branch no longer selects anything.
- **Shape before (TS):**
  - `code_build_plan.releaseFileName`: ref `master` / `refs/heads/master` →
    `<v>.zip`; any other ref → `<v>-dev.zip`. Omitted ref defaulted to the raw
    version string (→ `-dev`).
  - `serve_code.build_version_from_git_master` options: `{branch}` (the panel
    sent `'master'` or the server's checked-out branch) + optional
    `{version, ref}`; `buildVersionFromGit` defaulted `ref` to `version ??
    'master'`.
  - `codeServerStatus().source`: `release_ref: 'master'` (constant),
    `release_sha/date/version` of `master`, `divergence` = `master...HEAD`.
    Check `release_ref_current` (warn when HEAD had commits `master` lacked);
    `master_ref` blocked when `master` was missing; `build_plan` planned
    `DEDALO_VERSION` @ `master`.
- **Shape after (TS):**
  - `releaseFileName`: only a release-tag ref (`vX.Y.Z` / `refs/tags/vX.Y.Z`,
    no prerelease suffix) → `<v>.zip`; everything else, `master` included →
    `<v>-dev.zip`. NEW planner refusal after the ref gate: a tag whose name
    disagrees with the version its `version.ts` declares (`tag/version
    mismatch`). Omitted ref defaults to `refs/tags/v<version>`.
  - build options: `{channel: 'master'|'dev'}` (what the panel sends) →
    newest release tag / `master`; `{ref}` explicit (a bare `vX.Y.Z` is
    qualified to `refs/tags/…`); `{version}` alone → that version's tag, which
    must EXIST (else `update.refused` "No release tag v<version>…", before any
    dir is provisioned). Legacy `{branch}` is honoured as an explicit `ref`. No
    publishable tag and no ref → `update.refused` ("No release tag…"). The
    planner's code-server / dirs gates run FIRST (`refuseUnlessBuildable`), so
    a tag lookup never pre-empts them.
  - `source`: `release_ref: string | null` (newest tag, short name),
    `release_sha/date/version` of the tag; NEW `dev_ref: 'master'`, `dev_sha`,
    `dev_date`, `dev_version`; `divergence` = `<tag>...master` (`behind` =
    commits on `master` not released). `has_master_ref` now means the dev ref.
  - checks: NEW `release_tag` (blocked without a publishable tag — the normal
    state during a beta); `build_plan` is `unknown` when the tag's version is
    unreadable (never planned under the running version); `release_ref_current`
    REMOVED (master ahead of the release is the steady state, now a fact row);
    `master_ref` warns (not blocks) — a tag still publishes;
    `release_version_matches_ref` also blocks a tag/version disagreement;
    `build_plan` is `unknown` without a tag; `archive_installable` reads the
    tag (fallback `master`). Scopes name the tag's short name.
  - Unchanged: the manifest (`get_code_update_info`), the `channel` request
    token, the `-dev` file grammar, serving, the consumer install path.
- **Reason:** "released" meant "whatever `master` held when the button was
  pressed", and the dev channel depended on which branch the code server had
  checked out (the `v7` concept). A release must be a version that was cut and
  tagged; `master` is the latest integrated code before release. The master
  install (v7.master.dedalo.dev) tracks the git remote's `master`.
- **Gate reconciliation:** TS-only surfaces, no PHP fixture involved.
  `test/unit/code_build_native.test.ts` (channel naming, tag/version refusal,
  newest-tag resolution + no-tag refusal on a real git repo, dev build keeps
  the release archive), `update_status_native.test.ts` (scopes, `release_tag`,
  retired check), `serve_code_widget_native.test.ts` (channel mapping, legacy
  `branch`), `client_serve_code_render.test.ts` (channel-only request, both
  confirm placeholders in every catalog), `update_drill_config_tripwire.test.ts`
  (release clone tags the commit). End to end: `bun run test:update` /
  `test:update:dev` (`scripts/update_drill.ts`), `probe:update`.
