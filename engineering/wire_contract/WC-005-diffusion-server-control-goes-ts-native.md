# WC-005 — `diffusion_server_control` goes TS-native (client widget + panel); `media_path` engine-native

- **Date:** 2026-07-07 (user WIP landed; see LEDGER S2-23 deferral row).
- **Decision:** self-contained cutover posture (project direction: TS stands
  alone — own diffusion engine, own media dir).
- **Shape before (PHP):** the widget drives the legacy daemon
  (`start_server`/`stop_server`/`restart_server`); `media_control.get_value`
  reports the PHP install's `media_path`; the client widget files are
  byte-identical to the PHP tree.
- **Shape after (TS):** the widget drives the NATIVE engine's durable job
  queue (`requeue_job`/`purge_jobs`/`set_scheduler` + `cancel_process`/
  `retry_pending_deletions`); its label is the literal
  'Diffusion engine & queue'; `media_path` reports the TS tree's OWN media
  root (`MEDIA_PATH` in `<private>/.env`, no longer the PHP install's dir).
  The widget's client files (`client/dedalo/core/area_maintenance/widgets/
  diffusion_server_control/`) are a TS-OWNED divergence from the byte-identity
  rule — excluded from `scripts/sync_client.sh` like `tools/`; port PHP
  changes by hand.
- **Gate reconciliation:** `widget_request_differential` media_control test
  asserts `media_path` AND the `.publication` marker store per-engine (TS =
  `config.media.rootPath`, PHP = its own absolute path; the TS store may
  honestly report `base_exists:false` until `rebuild_media_index` provisions
  the cutover dir) and keeps quality/registry byte-parity;
  `widgets_differential` carves the label out of byte-parity. No re-harvest.
