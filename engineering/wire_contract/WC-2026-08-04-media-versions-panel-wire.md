# WC-2026-08-04-media-versions-panel-wire — tool_media_versions: `get_job_status` + `files_info_db`

- **Date:** 2026-08-04, adopted with the two media-versions panel fixes
  (`fix(media): the media-versions panel can build a version again` and
  `fix(media): the unsync warning stops lying after a delete`).
- **Decision:** no DEC- reference; follows the DEC-22a posture that an async job
  must have an honest poll wire (the same `MEDIA_JOB_STATUS_ACTION` already
  mounted on tool_upload).

## Shape before (PHP)

`tool_media_versions::API_ACTIONS` was seven verbs — `get_files_info`,
`delete_quality`, `build_version`, `conform_headers`, `rotate`, `sync_files`,
`delete_version`. There was no job-status action on this tool: PHP's
`build_version($quality, async:true)` returned a PID from a detached `sh` script,
and the panel's only follow-up was to poll `get_files_info` until the file
appeared on disk.

`get_files_info` returned the disk scan alone — `result` IS the files_info array
(not a boolean). The panel's "files info data is unsync" warning compared that
scan against the files_info it read from the CLIENT-side component data.

## Shape after (TS)

Two additive changes; nothing existing changed shape.

1. **`get_job_status` is mounted on this tool** (the shared
   `MEDIA_JOB_STATUS_ACTION`, `src/core/tools/job_status.ts`, `permission: null`
   with the handler applying the job-record ownership rule). Options: `job_id`.
   Response: the top-level `JobStatusFrame` fields (`pid`, `pfile`,
   `is_running`, `data`, `errors`, `total_time`) plus the tool envelope;
   `{result:false, errors:['job_not_found']}` on an unknown id.

2. **`get_files_info` carries `files_info_db`** beside its unchanged `result`:
   the files_info the RECORD stores for the operated lang, `[]` when it stores
   none.

## Reason

Both exist because the panel — the actual consumer — cannot get the truth any
other way.

1. A transcode's absence from disk is ambiguous: "still encoding" and "the job
   died ten minutes ago" look identical to a filesystem poll. That ambiguity was
   not theoretical — a failed/mis-targeted build left the cell blinking
   *Processing* until the user gave up and reloaded. With the frame, the panel
   ends the wait on `is_running:false` and reports `errors` verbatim.

2. The unsync warning is a comparison, and its two sides were read at different
   moments: the disk side live on every build, the stored side from the client's
   cached component data — a snapshot taken when the tool opened that no refresh
   re-reads. Deleting a quality therefore warned about a record that was
   perfectly in sync, and a page reload cleared it. Serving both sides from one
   answer makes the comparison meaningful. `[]` is deliberate and load-bearing:
   a component that stores no files_info IS unsync, and Regenerate (`sync_files`
   → `repairStoredFilesInfo`, the one minting path) is the documented repair —
   so the field must not be omitted, or an absent field would read as "0
   entries" and silently un-warn exactly that case.

## Gate reconciliation

No re-harvest. No parity gate covers `tool_media_versions` responses (verified:
the parity suite's failing-test set is byte-identical before and after these
commits), and both changes are ADDITIVE — no recorded PHP response shape is
contradicted, so the WC-001 "transform before diffing" pattern is not needed
either.

Gated instead by TS-native tests:

- `test/unit/media_tools.test.ts` — the tool's action surface (now eight
  actions) and each one's permission posture, including `get_job_status`'s
  `permission: null`.
- `test/unit/media_versions_client_contract.test.ts` — `get_files_info` emits
  `files_info_db` as an array beside `result`, and the client reads the stored
  side only from the server (the cached-entries assignment survives solely as a
  pre-request fallback).
- `test/unit/media_av_build_version_native.test.ts` — the av build the job wire
  reports on: the REQUESTED tier lands and the default tier is untouched.
