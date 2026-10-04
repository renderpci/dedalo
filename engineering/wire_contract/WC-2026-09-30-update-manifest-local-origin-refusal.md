# WC-2026-09-30-update-manifest-local-origin-refusal — the update manifest doors refuse a remote caller when their public origin is local

- **Date:** 2026-09-30, recording the behaviour landed by commit fa23afc729
  (2026-09-28, "refuse remote callers when public origin is local"), which
  shipped without a ledger entry (audit 2026-09-26 F2).
- **Decision:** none (a defect fix with a wire effect). **Amends:** WC-023
  (`get_ontology_update_info`) and WC-024 (`get_code_update_info`).
- **Doors:** BOTH master manifest doors of `dd_utils_api`
  (`src/core/api/handlers/dd_utils_api.ts`): `get_ontology_update_info` and
  `get_code_update_info`, through the one shared `localOriginRefusal`.
- **Shape before:** an authorized caller on another machine got `ok` plus a
  manifest whose every download URL was built on `publicOrigin()` =
  `http://localhost` when `DEDALO_HOST` was unset or loopback. The consuming
  installation then refused those URLs with an origin-mismatch error that
  blamed its own setup.
- **Shape after:** the same request answers `ok:false`, error code
  `update_server.refused`, with the exact public message:

      Error. This update server advertises a local origin (DEDALO_HOST is unset or loopback); its download URLs are unreachable from other machines. Set DEDALO_HOST (and DEDALO_PROTOCOL) on the server.

- **Exemption:** a caller whose `clientIp` is loopback (`127.0.0.1`, `::1`, …)
  or `'local'` (the unix socket with no forwarded address — same machine) is
  still served the manifest: local development keeps working.
- **Order:** the refusal runs AFTER `authorizeUpdateManifest`. A caller that is
  not authorized (not a master, wrong or missing code, bad version) gets the
  unchanged authorization refusal bytes of WC-023/WC-024, so the local-origin
  message is only ever disclosed to an authorized peer.
- **Reason:** a manifest of unreachable URLs is a failure presented as a
  success; the server is the only side that knows its origin is local, so it
  names the setting to fix.
- **Gate reconciliation:** no parity fixture covers a master door answering a
  remote caller (the frozen store was harvested against a non-master
  install); no fixture edit, no re-harvest. Gate:
  `test/unit/utils_update_manifest_native.test.ts` — the DRIVEN cases, each in
  a child process configured as both masters (config is frozen at load):
  (a) local origin (`''` and `localhost`) + remote caller + valid code →
  `update_server.refused`, message names `DEDALO_HOST`, on both doors;
  (b) local origin + loopback / `'local'` caller → not refused;
  (c) local origin + remote caller + WRONG code → the authorization refusal
  (the check sits after auth); (d) a real `DEDALO_HOST` → not refused.
