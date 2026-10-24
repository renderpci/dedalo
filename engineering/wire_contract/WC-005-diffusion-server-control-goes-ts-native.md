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

## Addendum 2026-10-21 — `get_value` job rows gain `owner_user_id`, `owner_name`, `total_time` (adopted 2026-10-14, 1e10fe1df8 + bd5d807060; recorded W4 cross-authz_read:r2)

- **Shape before (TS):** each `get_value` → `jobs[]` row was `mapJobToClient`'s
  `job_id, process_id, state` + the spec view (`type, section_tipo, element_tipo`) + the
  progress view (`counter, total, phase, linked_counter, msg`) + `attempt, max_attempts,
  cancel_requested, created_at, started_at, finished_at, errors`.
- **Shape after (TS):** the same keys plus three:
  - `owner_user_id` — the id of the user who fired the job (always present);
  - `owner_name` — that user's display name (`resolveUserName`, one lookup per DISTINCT
    owner in the listed rows, in the request's application lang), or `null` when the user
    record has none — the client then renders `#<id>`, never an invented name;
  - `total_time` — the job's wall-clock time, first start → finish (retries included),
    formatted by the SAME formatter as tool_diffusion's `total_time`
    (`formatElapsed`, re-exported through the diffusion/api facade) so both screens
    print one figure; `null` until the job has finished (`started_at` and `finished_at`
    both set).
- **Reason:** an administrator deciding whether to cancel or requeue a job needs to know
  whose it is, and a finished job's duration is the figure tool_diffusion already shows.
- **Minimisation (WC-069).** WC-069 keeps `owner_user_id` OUT of the per-second
  `follow_queue_admin` frame — that frame is re-serialized every second for every
  connected admin, so its narrow key set is both the cost bound and the
  data-minimisation bound. `get_value` is the place WC-069 names for the wider set: read
  on open and on membership change, not per second, and served only behind the same
  global-admin dispatch gate. Naming each job's owner to a global administrator (who may
  already read every user record) discloses nothing that role cannot reach; the frame
  stays as WC-069 pins it.
- **Gate reconciliation:** `test/unit/diffusion_server_control.test.ts` pins the row's
  exact key set (both new identity keys and `total_time` included), `total_time === null`
  on an unfinished job, `owner_user_id` = the enqueuing user and `owner_name` a string or
  `null`. TS-native widget action: no oracle fixture replays it, no re-harvest.
