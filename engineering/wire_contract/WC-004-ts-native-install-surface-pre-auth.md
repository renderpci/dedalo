# WC-004 — TS-native install surface (pre-auth while unsealed; SUPERSEDES the 2026-07-07 stopgap)

- **Date:** 2026-07-07 stopgap (login-gated, dd1590-pinned); **2026-07-09
  IMPLEMENTED** — the full TS-native installer landed (DEC-19 cutover blocker
  RESOLVED). This entry describes the CURRENT shape.
- **Decision:** the TS server installs itself (no PHP). `src/core/install/` +
  the browser wizard + the `dedalo:install` CLI. See `docs/install/ts_native_install.md`.
- **Shape before (PHP):** `dd_utils_api::install` (sub-actions
  `test_db_connection`, `persist_config`, `set_root_pw`, `install_finish`,
  `install_db_from_default_file`, `install_hierarchies`, `register_tools`,
  `check_directories`, `verify_active_config`, `test_diffusion_connection`,
  `to_update`) and `get_install_context` are PRE-AUTH, guarded by
  `DEDALO_INSTALL_STATUS` + an install-window IP allowlist; `start` returns the
  installer context while not installed.
- **Shape after (TS):** `dd_utils_api:install` (routing by `options.action`) and
  `dd_utils_api:get_install_context` are **registered and pre-auth WHILE
  UNSEALED**, IP-gated by `DEDALO_INSTALL_ALLOWED_IPS` (unset = open, dev —
  **SUPERSEDED 2026-08-24: unset now means LOOPBACK ONLY, see
  `WC-2026-08-24-install-ip-gate-fail-closed`**), enforced in dispatch Gate 1b. Once `install_finish` seals the instance
  (`ts_state.json` `install_status='sealed'`) the whole surface returns **404**.
  `get_install_context` returns a **synthetic** installer element (built by
  hand, `buildInstallContext` — no ontology needed pre-restore) whose
  `.properties` carry `needs_config`/`init_test`/`server_info`/
  `target_file_path`/`hierarchies`. `start` mounts `model:'installer'` when
  `config.installMode`. Record-writing steps (`install_hierarchies`,
  `register_tools`) additionally require a session (post in-wizard login).
  Responses are TOP-LEVEL (`{result,msg,...extras}`) per the client contract.
- **Server_info honesty:** the PHP/Apache-only checkers were REMOVED entirely
  from both the payload and the client grid (WC-006), not emitted as null; the
  real progression gate is `init_test.result`.
- **Gate reconciliation:** `test/unit/install_gate.test.ts` (mount + sealed-404
  + IP + pre-auth + record-step 401) and `test/unit/security_fail_closed.test.ts`
  (sealed → 404). No parity gate diffs these actions — no re-harvest needed.
