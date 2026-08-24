# WC-2026-08-23-build-provenance — dedalo_build and the prerelease tag derive from git archive provenance

- **Date:** 2026-08-23.
- **Decision:** none specific; retires two `[install]`-pinned literals under the
  premise rule (a frozen "Current build" stamp lies to the operator after every
  code update — the single most important evidence in the update flow).

## Shape before (PHP)

PHP composed `DEDALO_VERSION` as the triple plus `'.dev'` whenever
`DEVELOPMENT_SERVER` was set (config, not provenance), and `dedalo_build` was a
config constant. The TS port pinned both as `[install]` literals: a hardcoded
`PRERELEASE_TAG = '.dev'` in `src/core/update/version.ts` and the frozen string
`'2026-03-14T13:52:19+02:00'` in three places (`environment.ts`
`buildPageGlobals`/`buildInfoData`, `login_context.ts` info rows). After a code
update the client still displayed the same build stamp — no way to tell whether
new code was live.

## Shape after (TS)

Build provenance is carried IN the release artifact via `git archive`
export-subst:

- `src/core/update/build_info.txt` is committed as the literal
  `$Format:%H %cI$`; `.gitattributes` marks it `export-subst`, so inside every
  release zip (built by `code_build.ts`, `git archive --format=zip
  --prefix=dedalo_code/`) it holds the real `<commit sha> <commit ISO date>`.
- New leaf `src/core/update/build_stamp.ts` reads the file once at init:
  - placeholder / missing / malformed → DEV tree: `DEDALO_BUILD = null`,
    prerelease tag `'.dev'`;
  - expanded → RELEASE: `DEDALO_BUILD = <commit ISO date>`, tag `''`.
- On the wire:
  - `page_globals.dedalo_build`: still always present, still `null` for
    anonymous callers (API-03); for authenticated callers the value is now the
    release commit date, or `null` on a dev checkout (was: the frozen literal).
  - `buildInfoData.dedalo_build` and the login info row `Code Build`: same
    value (was: the frozen literal).
  - `dedalo_version` / login `Code version`: unchanged on dev checkouts
    (`7.0.0.dev`); on a RELEASE archive the tag is now `''` (`7.0.0`) — the tag
    reports provenance, not config.

## Reason

The `update_code` widget displays "Current build". With a frozen literal the
operator cannot verify that an update actually swapped the code. The commit
date (and the sha behind it) is ground truth the artifact itself carries, needs
no build machinery beyond the existing `git archive`, and makes dev checkouts
self-identifying (`null` build, `.dev` tag) instead of impersonating a release.

## Gate reconciliation

`test/parity/environment_differential.test.ts` lists `dedalo_build` in
`ENGINE_SPECIFIC_KEYS` (presence-only, value not compared) — no change, no
re-harvest. `dedalo_version` IS value-compared against the frozen fixture, but
the suite runs on a dev checkout where the tag stays `.dev`, so the compared
bytes are unchanged. Native gates: `test/unit/build_stamp_native.test.ts`
(parser contract, dev fallback never throws, and the tripwire that the
COMMITTED `build_info.txt` keeps the literal placeholder — an expanded commit
would stamp every dev checkout as a release);
`test/unit/update_version.test.ts` (engine version = version + provenance tag);
the `update_ownership_tripwire` version-literal ratchet now DERIVES its
forbidden literals from the triple, with a self-check that the derived regexes
match the live version.
