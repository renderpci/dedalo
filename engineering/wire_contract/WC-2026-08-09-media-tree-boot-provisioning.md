# WC-2026-08-09-media-tree-boot-provisioning — the media tree is declared, provisioned at boot, and reported by check_directories

- **Date:** 2026-08-09 (audit `2026-08_oh1_beta` §5.2 remediation).
- **Decision:** DEC-19 (TS is the sole engine) + S1-15 (fault-tolerant boot).
  `src/core/install/media_tree.ts` is the single declarative description of the
  directories a Dédalo install must have under the media root.

## Shape before (PHP)

- `core/base/dd_init_test.php` ran on EVERY REQUEST and created the whole media
  tree with `system::check_directory()` — which is `is_dir()` else
  `mkdir(…, 0750, true)`, and nothing else. It never verified a mode and never
  probed writability, except for two nodes (`DEDALO_UPLOAD_TMP_DIR` and
  `<media>/import`), where it proved a subdirectory could be created by making a
  literal `test` directory it then LEFT BEHIND — every v6 install carries
  `media/import/test`.
- `installer_setup_manager::check_directories` (the wizard step) did NOT touch
  the media tree at all. It returned
  `{result, dirs:[{label,path,exists,writable}], msg}` where `msg` is one of two
  fixed sentences, and `dirs` holds exactly five labelled rows
  (Private / Sessions / Cache / Media / Backup).

## Shape after (TS)

1. **`check_directories` gains one extra `dirs` row and one new field.** With
   `create:true` and a configured media root, the response carries an additional
   row `{label:'Media tree', path:<media root>, exists, writable}` (both flags
   are the pass's `result`), plus a top-level `mediaTree` object —
   `{root, created:string[], problems:[{path,absolute,kind,severity,detail}],
   result}` — which is `null` on a verify-only call or an unconfigured root.
   `msg` gains ONE appended segment, joined with ` | `, never a newline: the
   installer client assigns `msg` with `textContent` into a `display:flex`
   `.msg` pill, so a multi-line value collapses into an unreadable run. The
   per-directory detail therefore travels structured, on `mediaTree.problems`,
   and `msg` carries only the summary counts.

2. **The tree is provisioned at BOOT**, not only during an install:
   `provisionMediaTreeAtBoot()` runs in `startServer` (outside install mode,
   before `writeRuleFiles`). Since
   `WC-2026-08-09-media-tree-configurable-folders-and-boot-budget` that pass
   carries a wall-clock budget (`MEDIA_TREE_BOOT_BUDGET_MS`), because unlike
   PHP's per-request walk it sits on the critical path of the process coming up.
   This is the PHP behaviour restored — the installer
   step alone would never reach a machine that was installed before the module
   existed, which is every existing install, and is why `media/av/subtitles` was
   missing everywhere and `tool_transcription`'s `build_subtitles_file` refused
   with "subtitles dir does not exist!" on every TS install.

3. **The declared set is a SUPERSET of PHP's**, never smaller: a `thumb` tier on
   all five media types (PHP appended one to pdf only; `THUMB_IS_UNIVERSAL` is
   true here), `av/audio_tr` (the TS-native 16 kHz transcription derivative, no
   PHP twin), and every type ROOT and intermediate ancestor, so no level of the
   tree is minted as a `recursive:true` side effect at an umask-decided mode.
   The four PHP folders with no TS consumer (`image/web`, `html_files`,
   `export/files`, `import`) are KEPT so nothing has to create them ad hoc.

   > **Superseded in part, same day, by
   > `WC-2026-08-09-media-tree-configurable-folders-and-boot-budget`.** Those
   > folder NAMES were pinned to their defaults here because the keys were
   > `DROPPED` in the migration map. They now come from the config catalog
   > (`DEDALO_IMAGE_WEB_FOLDER`, `DEDALO_HTML_FILES_FOLDER`,
   > `DEDALO_TOOL_EXPORT_FOLDER_PATH`), the export path may again be an ABSOLUTE
   > path on another volume, and `mediaTreeEntries` takes its root as an
   > argument. Read that entry for the current shape.

4. **One mode, and deviations are reported, never repaired.** Every directory is
   created at `MEDIA_DIR_MODE` (0750, the mode PHP's `create_directory`
   defaults to) and the mode is forced with a `chmod` so a process umask cannot
   make one install differ from the next. A PRE-EXISTING directory whose mode
   differs is a `warning`, not an error, and is left alone: chmod-ing a live
   archive's media tree can break the web server's own access to it (media
   protection is web-server-enforced), so an operator decides. PHP checked no
   modes at all, so this is added reporting, not changed behaviour.

5. **Writability probing is per-entry and matches PHP's placement.** Only the
   media root (`write`) and PHP's two deep-checked nodes — the upload staging and
   `import` (`deep`) — are probed; the rest are existence-checked exactly as
   `system::check_directory` did. Probing all ~50 nodes would put a probe file
   AND a probe directory into a live archive on every boot, and a killed process
   would leave precisely the residue PHP's `test` directories are an example of.
   Unlike PHP's, the probes are removed.

## Reason

`media/av/subtitles` did not exist on any TS-provisioned install, so VTT
subtitles could not be produced at all (audit MAJOR), and the sub-folders that
did exist had been minted ad hoc by whichever media writer ran first, at
inconsistent modes. Both are properties of the whole install, not of one call, so
the fix has to run where PHP's ran — at boot — and the installer step has to be
able to show what the pass found.

## Gate reconciliation

`test/unit/media_tree_provision_native.test.ts` is the gate: the descriptor
(including the subtitles folder bound to `subtitlesRelativePath`, the consumer's
own path builder), the create/verify/idempotence behaviour, the probe placement,
the residue-free verify pass, the `check_directories` wiring (one row, `msg`
single-line, scratch media root), the boot entry point, and the source-level
assertion that `src/server.ts` calls it before serving. No parity gate diffs
`check_directories` — it is part of the TS-native install surface (WC-004), which
never runs against PHP — so **no re-harvest is needed**.
