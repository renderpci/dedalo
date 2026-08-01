# WC-024 — `update_code.update_code` OWNED-mode swap is stricter than PHP (verified, quarantined, atomic, supervised)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 4 — the code update unlocked
  behind the standalone-ownership gate; Opus-designed download/extract/swap
  hardening).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) and a process
  supervisor is present — never while coexisting with PHP (closed mode keeps
  the frozen `engine_denied` bytes). The panel (`get_value`) mirrors PHP
  `{servers (probed), dedalo_source_version_local_dir, is_a_code_server}`. The
  install request is the PHP `{file:{version,url,sha256?,force_update_mode?},
  update_mode, info}` shape; success answers `{result:true, msg:'OK. Installed
  Dédalo <v> (<mode>). Restarting…'}` and the server exits for the supervisor.
- **Divergences (each deliberately STRICTER; `src/core/update/code_update.ts`
  + `code_download.ts` + `code_build.ts` + `code_manifest.ts`):**
  D1 manifest `sha256` verified post-download (PHP verifies nothing; optional
  ed25519 lever). D2 TLS peer verification ON (PHP `ssl_verifypeer=false`).
  D3 redirects refused. D4 streamed size cap + stall guard (PHP unbounded).
  D5 ZIP magic sniff before extraction. D6 `zipinfo` PRE-VALIDATION rejects
  any absolute/`..`/non-`dedalo_code/`-prefix name and any SYMLINK entry
  BEFORE extraction — closes the info-zip symlink-write-through escape (PHP
  `ZipArchive::extractTo` trusts entry names). D7 quarantine-then-rename swap,
  never over the live tree; old tree backed up with version+timestamp,
  same-device asserted for atomic renames. D8 strict-linear re-enforcement at
  install (`assertLinearUpgrade` — no downgrade/skip, minor/major bumps land
  on .0) as a backstop against a malicious server. D9 live swap REFUSED
  without a supervisor (`DEDALO_SUPERVISED` / systemd env). D10 git build twin
  uses a Bun.spawn argv array + a strict ref regex (no shell). D11 sha256
  sidecar emitted next to each built archive (the integrity metadata the
  manifest serves).
- **Master surface (PHP parity, fail-closed):** `dd_utils_api:
  get_code_update_info` (NO_LOGIN + CSRF-exempt machine-to-machine POST; refuse
  unless `IS_A_CODE_SERVER` + a configured `CODE_SERVERS` code; advertises only
  built releases on the caller's linear path) and `get_server_ready_status`
  gains the `code_server` branch.
- **Wire-visible additions (client-tolerant):** per-file `sha256` on the
  manifest (the byte-identical client reads only version/url/date/
  force_update_mode and ignores it); the restart-then-report flow. No client
  edit needed.
- **Config keys censused:** CODE_SERVERS, IS_A_CODE_SERVER,
  DEDALO_CODE_FILES_DIR, DEDALO_CODE_SERVER_GIT_DIR, DEDALO_SUPERVISED,
  DEDALO_BACKUP_PATH, DEDALO_SOURCE_VERSION_LOCAL_DIR.
- **Gates:** `test/unit/code_update.test.ts` (strict-linear matrix, zipinfo
  zip-slip + symlink rejection, magic sniff, tree-marker sanity, and the FULL
  download→verify→extract→clean-swap chain + checksum-mismatch refusal against
  a synthetic release in a TEMP tree). The live projectRoot swap + restart is
  an operator drill on a scratch instance (ledgered — no automated surface
  swaps the running tree).
