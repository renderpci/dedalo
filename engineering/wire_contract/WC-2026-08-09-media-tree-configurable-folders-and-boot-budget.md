# WC-2026-08-09-media-tree-configurable-folders-and-boot-budget — the media tree reads its folder names from config, and the BOOT pass is time-bounded

- **Date:** 2026-08-09 (audit `2026-08_oh1_beta`, WS M8 "install-config"). Closes
  the two items `WC-2026-08-09-media-tree-boot-provisioning` explicitly deferred,
  and bounds the boot pass it introduced.
- **Decision:** DEC-12 (tripwire in the same change). Restoring a PHP capability
  needs no divergence entry; **the boot budget does**, and it is the only
  deliberate divergence recorded here.

## Part 1 — the three configurable folder names (a RESTORATION, not a divergence)

`DEDALO_IMAGE_WEB_FOLDER`, `DEDALO_HTML_FILES_FOLDER` and
`DEDALO_TOOL_EXPORT_FOLDER_PATH` are real settings of a v6 install. The first
media-tree port hardcoded all three (`PHP_LEGACY_FOLDERS`), because they were
classified `DROPPED` in `src/config/migration_map.ts` and `config_census_tripwire`
forbids reading a key the map has dropped — so the pin was honest about the state
of the engine, and wrong about the state of the world.

Two distinct harms:

1. **A renamed folder got an empty twin.** An install that set
   `DEDALO_IMAGE_WEB_FOLDER=/web_2` had its files in `image/web_2`; the tree
   provisioned `image/web` beside it, on every boot, forever.
2. **The export path lost a capability.** PHP's value is an ABSOLUTE path, and
   `dd_init_test` checks it in its OWN block, separately from the media loop,
   *"because it may be configured on a different volume or mount point"*. A
   media-root-relative pin cannot express a relocated export volume at all.

Shape after:

- All three have `src/config/catalog/media.ts` entries and are `SAME` in
  `migration_map.ts` (the v6 name IS the v7 key), so a migrated install carries
  its own folder names across. `PHP_LEGACY_FOLDERS` now holds only `import` and
  `import/history` — the two names PHP itself wrote as literals.
- `MediaTreeEntry` gains `base: 'media' | 'external'`. `media` is
  media-root-relative, ancestors expanded, as before. `external` is an absolute
  path on another volume; **exactly one setting can produce one**.
- `mediaTreeEntries(root)` now takes its root as a REQUIRED argument. The export
  entry is only classifiable as inside-the-tree or on-another-volume relative to
  a root, and an ambient default would have answered that question about the
  CONFIGURED install while the caller pointed at a scratch root.
- **Unset stays relative.** The catalog documents the default as
  `<media directory>/export/files`, but resolving it to a literal absolute path
  here would anchor it to `config.media.rootPath` — so a pass against the
  installer's `mediaRoot` seam, or any test's scratch root, would provision
  `export/files` back into the real install's media tree. Only an explicitly
  configured absolute path is honoured as absolute.
- **A relative configured value is REFUSED, loudly** (`throw`). `<media>/exports`
  and `<cwd>/exports` are both plausible readings of `exports`; guessing puts an
  institution's bundles somewhere it never asked for.
- **An external entry is created; the volume above it is not.** If its parent
  does not exist the pass reports `missing` and names the parent. Creating the
  mount point of a volume that has not come up is how an export lands on the
  system disk and fills it.

## Part 2 — `MEDIA_TREE_BOOT_BUDGET_MS` (the divergence)

**Shape before (PHP).** `dd_init_test` ran the whole walk on EVERY REQUEST, with
no bound of any kind. A slow media volume made every page slow; it never made the
application fail to start, because there was no start-up to fail.

**Shape after (TS).** The walk runs ONCE, at boot, before `writeRuleFiles()` and
before the socket is bound — which is strictly cheaper than the oracle per unit
of work, and strictly riskier in one respect: it is now on the critical path of
the process coming up. `provisionMediaTree` accepts `budgetMs`; the BOOT pass
always passes one (`MEDIA_TREE_BOOT_BUDGET_MS`, default 5000, clamped ≥ 100 ms),
the INSTALLER pass deliberately passes none.

When the budget is exhausted the walk STOPS at the current entry and records a
new problem kind, `timed_out` (severity `error`), naming the budget, the entry it
stopped at and how many of the tree went unchecked. The server then serves: a
slow media volume is not a reason for the archive not to open (S1-15), and the
unreached directories are provisioned on the next start. `report.result` is
`false`, so the boot log is loud.

**Why a budget on a synchronous walk, and not async I/O with a timer.** Both are
worth stating, because the async version looks like the more thorough answer:

1. It buys nothing for the case it appears to solve. A hard network mount whose
   server is down blocks the look-up inside the kernel; the JS timer fires while
   the WORKER THREAD stays parked forever. ~50 of those exhaust the fs threadpool
   and spread the hang to every other file consumer in the process — one broken
   mount becomes a broken server. The honest fix for an unreachable mount is a
   mount option (`soft`, `timeo`, an automounter), and the operator doc says so
   in those words rather than implying a setting can rescue it.
2. The pass must finish before `writeRuleFiles()` (those files are written INTO
   the media root) and before the first request, or a request can observe a
   half-provisioned tree. A bounded synchronous pass keeps that ordering by
   construction; an unawaited async one silently loses it.

The budget therefore covers the case that is actually reachable and actually
common: a mount that is SLOW but alive (~50 look-ups × 200 ms ≈ 10 s of apparent
hang, unbounded and unexplained before this).

## Also in this change (no wire effect)

`dirIsWritable` documented itself as non-throwing while the `rmSync` in its
`finally` could escape with EACCES/EPERM/EROFS and REPLACE the return value with
an exception — aborting the whole pass on the first bad directory, in the one
function every caller relies on to merely *report*. Removal now goes through
`removeProbe`, which logs the residue path and never raises.

## Gate reconciliation

`test/unit/media_tree_provision_native.test.ts`:

| describe | asserts |
|---|---|
| *media tree folder names come from the config catalog* | a renamed image-web / html-files folder is the one declared (and the default is NOT); an export path inside the root is an ordinary entry with its ancestor at the tree mode; an export path on another volume is provisioned there and nothing `export*` appears inside the media root; a missing parent volume is `missing` + names the parent + creates nothing; a relative value throws; UNSET follows the pass's root |
| *media tree boot budget* | an exhausted budget yields exactly one `timed_out` error naming the key and the budget, creates nothing, and does not throw; the unreached directories are provisioned on the next pass; the boot entry point stays loud-not-fatal; its default budget comes from the catalog key; the clamp floor holds; the INSTALLER pass is unbounded |
| *dirIsWritable — the documented non-throwing contract* | a failing removal never escapes (probe file and probe dir), `rmSync` appears ONLY inside `removeProbe` and is guarded, the probe still answers truthfully and leaves nothing |
| *no test may reach the CONFIGURED media root* | every call to a media-root door from ANY file under `test/` names its own root, and only registered files open one |

RED before the change: the removal test escaped with EACCES; the live-root gate
reported 24 call sites (this file's own verify-only `check_directories`, and
every `mediaTreeEntries()` that had no root to name).

**No re-harvest.** `check_directories` is TS-native install surface (WC-004) and
runs against no oracle; the boot pass has no wire at all.
