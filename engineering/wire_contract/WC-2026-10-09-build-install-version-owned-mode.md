# WC-2026-10-09-build-install-version-owned-mode — `build_database_version.build_install_version` compiles the install seed; its panel values name the compiler's sources

- **Date:** 2026-10-09 (commit 2d8bbc1030, the install-seed compiler). Recorded
  2026-10-21, late — review-diff cross-authz_read r1 found the action had changed shape
  with no entry; this file is that entry.
- **Decision:** DEC-12 (the compiler lands with its gates, below).
- **Shape before:**
  - **PHP:** `install::build_install_version` cloned the LIVE database
    (`DEDALO_DATABASE_CONN`) into `dedalo7_install`, stripped user data and dumped it to
    `/install/db/dedalo7_install.pgsql.gz`. `get_value` answered
    `{source_db: <live DB name>, target_db: 'dedalo7_install', target_file:
    '/install/db/dedalo7_install.pgsql.gz'}`.
  - **TS until 2026-10-09:** `build_install_version` was `engineDenied` inside an
    ownership `gated(...)`: every call failed `maintenance.widget_unavailable`
    (`Error. 'build_database_version.build_install_version' is not runnable on this
    engine: it writes install/ SQL dumps into the PHP tree. Run it from the PHP
    maintenance dashboard.`). `get_value` mirrored PHP's three keys and values
    (informational only).
- **Shape after (TS):**
  - `build_install_version` RUNS (`src/core/install/seed_build.ts`
    `buildInstallVersion`): it compiles `install/db/dedalo_install.pgsql.gz` + its
    manifest from the repository's sources only — never an installation's database —
    in a marked scratch database, proves it by a fresh install in a second one, then
    writes it. Success: `{data:true, msg, errors?: <findings, when any>, extend:{steps:
    string[], file_size: '<n> Bytes'}}` (`msg` = `OK…` or `Warning: install seed
    compiled with findings`). Refusal: a thrown `maintenance.action_failed` (public
    disclosure: the operator's sentence) whose envelope carries the same readout as
    extension keys `extend.steps` / `extend.findings`; nothing is written at the final
    name.
  - `get_value` keeps the three keys, with the compiler's own meanings:
    `source_db` = `install/db/seed + install/import/ontology/<major.minor>` (the repo
    sources, relative to the project root), `target_db` = `dedalo_seed_build_<pid>` (the
    scratch database pattern), `target_file` = `install/db/dedalo_install.pgsql.gz`.
    No database name of the installation is disclosed any more.
  - `build_matrix_hierarchy_main_sql` is unchanged (`engineDenied`: its PHP output has no
    consumer here).
- **Reason:** a seed cloned from an installation shipped that installation's defects to
  every fresh install (a 2022 `hierarchy109` typo broke them all). The seed is now a
  build artifact of the repository, reproducible and verified before it lands; the
  panel says where it comes from instead of naming a live database.
- **Gate reconciliation:** `test/unit/seed_build_native.test.ts` (the compile through
  its source/outFile seam, refusal readout), `install_seed_contract_native`,
  `install_seed_manifest_tripwire` (a source change without a recompile is STALE),
  `engine_denied_boundary` (the action left the denied set, with its dated note),
  `update_ownership_tripwire` (`stub: false`), `maintenance_door_unbounded_native`
  (its declaration). **Fixture interaction:** none — no oracle-harvest gate replays
  `build_install_version` or this widget's `get_value`; no re-harvest.
