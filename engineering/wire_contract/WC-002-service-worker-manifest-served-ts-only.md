# WC-002 — service-worker manifest served by TS only when PHP has no twin

- **Date:** 2026-07-06 (Tier-1 S1-19). Not a shape divergence: TS implements
  `dd_utils_api::get_dedalo_files` to the PHP contract (`{type,url}[]` +
  `dedalo_version`). Recorded here because the client's sw.js has NO failure
  fallback: any future change to this action's shape stalls every login at the
  progress ring. Treat the shape as frozen; gate:
  `test/parity/dedalo_files_differential.test.ts`.
