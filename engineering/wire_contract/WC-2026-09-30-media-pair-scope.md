# WC-2026-09-30-media-pair-scope — the AV / 3D media doors ask the component and the record scope, not only the section

- **Date:** 2026-09-30 (closure Step 3, SEC-2-media).
- **Decision:** owner decisions 2026-09-30. Code: `src/core/api/handlers/media_action_context.ts`
  `resolveMediaActionContext` → `write_door.authorizeRecordAccess`.
- **Doors:** `dd_component_av_api` `create_posterframe`, `delete_posterframe`,
  `get_media_streams`, `download_fragment`; `dd_component_3d_api` `move_file_to_dir`,
  `delete_posterframe`.
- **Shape before (the frozen PHP, stricter than which this now is):** one question,
  `getPermissions(section, section) >= level`. A profile explicitly denied the AV
  component cut fragments, probed streams and deleted posterframes through the section
  grant, and any record id was reachable out of the caller's projects. The model check
  answered BEFORE any permission, so `request.invalid_model` told an unauthorized caller
  what a tipo was.
- **Shape after:** coordinates (a positive integer id, `request.invalid_source`, before
  authentication) → the section floor (= the door's level) → the (section, component)
  pair (write doors: dd128-aware level 2; the two reads: the read door's component grant)
  → the record scope (`perm.out_of_scope`) → the model (`request.invalid_model`). The
  media identity is built from the grant. The two AV reads' `READ_DOOR_POSTURE` rows move
  from `open` to `component`; the OPEN ceiling drops from 7 to 5.
- **The human UPLOAD door (review r7) — CLOSED in the same commit:** `tool_upload`
  `process_uploaded_file` writes the master file and the stored files_info of ONE
  component (`options.tipo` / `component_tipo`) but declared `permission: 'record'` — the
  section level + scope only, never the component. A profile at 0 on the media component
  replaced its file through the section grant: the same hole this entry closes on the AV /
  3D classes. It now declares `permission: 'record_tipo', minLevel: 2` (the write door's
  pair + section floor 1 + scope; the kind refuses a payload whose `tipo` and
  `component_tipo` disagree, so the component acted on IS the authorized one; the client
  sends `tipo` only). The matrix's `RECORD_KIND_EFFECT` census holds no OPEN
  component-effect `record` door (ceiling 0). **Shape after:** NO_COMPONENT /
  READ_COMPONENT (the AV at 1) / DD1725 refused `perm.denied`, out of scope
  `perm.out_of_scope`; root uploading its own image (dd128/dd522/-1) is served, the same
  target without the component refused (`tool_upload.test.ts`).
- **Reason:** a media file is a component's value; the component grant and the record
  scope are the same rule the human read applies to it.
- **Gate reconciliation:** no parity fixture covers these doors (write-side / binary);
  no re-harvest. Gates: `test/unit/media_action_context_native.test.ts` (derived census ×
  SECTION_ONLY / OUT_OF_SCOPE / COMPONENT_ONLY / LEVEL_1 / READ_COMPONENT / CONTROL, the
  order probe — READ_COMPONENT holds the section at 2 and the component at 1, so it is the
  one identity only the level-2 PAIR can refuse on a write action: refused ON the component
  there, served on the two reads), `test/unit/authz_door_matrix_native.test.ts` (the same
  READ_COMPONENT column on every media row; the `RECORD_KIND_EFFECT` census + OPEN canary),
  `test/unit/read_door_acl_native.test.ts` (the two AV reads),
  `test/unit/read_door_acl_tripwire.test.ts` (OPEN ceiling 5).
