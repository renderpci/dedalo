# WC-2026-10-12-install-surface-removed — the install surface is removed from the wire; a server that is not installed refuses to start

- **Date:** 2026-10-12 (terminal installer phase 5; owner decision 2026-10-11: ONE
  installer, in the terminal — `./install.sh` / `bun run dedalo:install`).
- **Decision:** DEC-19 (install) — its browser half retired.
- **Supersedes:**
  `WC-004-ts-native-install-surface-pre-auth` (whole);
  `WC-2026-07-09-installer-diagnostics-grid` (whole);
  `WC-2026-08-15-install-refusals-typed` (the wizard/router half — `install.unknown_step`,
  `install.not_reachable`, `install.ip_denied`; its update and receive_report halves stand);
  `WC-2026-08-24-install-ip-gate-fail-closed` (whole);
  `WC-2026-10-08-install-ip-denied-names-address` (whole);
  `WC-2026-08-24-proxy-trust-and-password-cost` (the install-gate "forgeable loopback"
  bullet only);
  `WC-2026-10-08-install-plan-update-servers-core-lg`, `WC-2026-10-09-install-domain-ontologies`,
  `WC-2026-10-10-hierarchy-json-manifest` (their `get_install_context` / router-action halves);
  `WC-2026-10-10-ontology-dependencies-hierarchy60` (the wizard's `install_hierarchies` step
  contract — the registry re-read and its warnings in `msg`);
  `WC-057-register-tools-panel-joins-tools-tree` (its install-wizard per-tool report half);
  `WC-017-dd-error-report-api-receive-report` (the sentence naming `install.ip_denied` as the
  intake's IP refusal — the dispatcher throws `perm.denied`, and the code is gone);
  `WC-2026-08-15-error-status-is-a-channel` (the `install.not_reachable` 404 row);
  `WC-2026-08-09-media-tree-boot-provisioning`, `WC-2026-08-15-diffusion-connection-status-ok-message`
  (their wizard step-contract halves).
  Superseded entries are left untouched; each carries a one-line forward Addendum.
- **Shape before (PHP):** the PHP engine (frozen) served its own browser installer; the TS
  engine replaced it with a TS-native pre-auth surface (WC-004), whose shape is the fossil
  here: two session-less actions — `dd_utils_api:get_install_context` (a synthetic
  `installer` element) and `dd_utils_api:install` (a step router, `options.action` ∈
  `to_update` | `test_*` | `persist_config` | `verify_active_config` |
  `get_ontology_catalog` | … | `install_finish`) — reachable while unsealed from
  `DEDALO_INSTALL_ALLOWED_IPS` (loopback by default); `dd_core_api:start` without a session
  returned the installer context on a fresh / mid-wizard box, or `install.not_reachable`
  during a terminal install; refusals `install.not_reachable` (404), `install.ip_denied`
  (403, `details.client_address`), `install.unknown_step` (400). A config-less server booted
  on sentinels and served the wizard; `persist_config` restarted the process (exit 75).
- **Shape after (TS):** neither action is registered: both answer `request.unknown_action`
  (the Gate-1 body), with or without a session. `start` without a session always returns
  the login context. The three codes, their labels and the `unknown_step` legacy token are
  deleted from the registry; the keys `DEDALO_INSTALL_ALLOWED_IPS` and
  `DEDALO_INSTALL_NO_RESTART` from the config catalog. A server with `ENTITY`, `DB_NAME`,
  `DB_HOST`, `DB_USER` all unset — or with any `install_status` other than `sealed` (the
  executor writes `terminal_installing` while it runs) — binds nothing, writes nothing, and
  exits **78** (`EX_CONFIG`, `NOT_INSTALLED_EXIT_CODE`, `src/config/install_state.ts`) with ONE
  `[boot] REFUSED — …` line naming the operator's next act (run the installer / restore
  `.env` / complete `.env` / `--resume`); the systemd units carry `RestartPreventExitStatus=78`
  and the watchdog does not restart such a unit. Install happens only through the terminal
  installer (`scripts/install.ts` / `install.sh`). The add_hierarchy Maintenance widget's
  import block (once borrowed from the installer client) is its own module,
  `client/dedalo/core/area_maintenance/widgets/add_hierarchy/js/render_hierarchies_import.js`,
  posting only `dd_area_maintenance_api:widget_request`.
- **Reason:** the wizard was a pre-auth surface that rewrote `../private/.env`, spawned psql
  and restarted the process; every route (production, docker, trial, developer) now has the
  terminal installer, so the surface was attack surface and nothing else.
- **Gate reconciliation:** `test/unit/no_install_surface_tripwire.test.ts` (the real action
  table driven session-less through the real dispatcher against a frozen pre-auth list;
  the removed pair answers `request.unknown_action`; and the real `src/server.ts` spawned
  config-less: exit 78, no listener, no database connection, no write).
  `test/unit/install_state_boot.test.ts` holds the predicate;
  `test/unit/install_restart_supervisor_tripwire.test.ts` the supervisors' reaction to 78.
  `test/parity/dedalo_files_differential.test.ts` transforms both sides with
  `isInstallerRemovalEntry` (the `/dedalo/core/installer/` client files: present on the
  PHP side of the frozen fixture, absent on the TS side) and lists the extracted
  `render_hierarchies_import.js` in `POST_HARVEST_CLIENT_ADDITIONS`. No frozen fixture names
  either action. `test/parity/wc034_label_cleanup.json` (the WC-034 label map
  `environment_differential` reads): the oracle key `type_root_password` moves from
  `renames` (→ `root_password_intro`, a wizard label now deleted) to `removals`, and the
  stale `information → install_information` rename (target deleted; the oracle fixture
  carries no `information` key) is dropped. `engineering/parity_baseline.json` re-frozen:
  `dedalo_files_differential`'s assertion count falls by exactly the entry-shape checks of
  the two removed installer files net of the one added module (3 × 2 − 3), no test changes
  colour. **Re-harvest: NO** (the gate transforms the fixture response before diffing — the
  WC-001 pattern).
