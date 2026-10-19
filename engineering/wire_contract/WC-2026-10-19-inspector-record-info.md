# WC-2026-10-19-inspector-record-info — created / modified / published come from their own action, not the section read

- **Date:** 2026-10-19 (inspector Information panel, edit mode).
- **Decision:** none (native addition; no DEC).
- **Shape before (PHP):** `section::get_section_info` merged nine keys into
  EVERY `data.entries[i]` of the section read (`created_date`,
  `created_by_user_name`, `modified_date`, `modified_by_user_name`,
  `created_by_userID`, `publication_first_date` / `_user`,
  `publication_last_date` / `_user`), building the audit and dd271/dd1223/
  dd1224/dd1225 components per record. Dropped for cost in 2025-12; since then
  (and in TS until now) the panel always showed `-` / `Never`.
- **Shape after (TS):** the section read is UNCHANGED (no key added to
  entries). A new record-scoped action, sent by the inspector after the
  section renders:

  ```json
  { "dd_api": "dd_utils_api", "action": "get_record_info",
    "options": { "section_tipo": "test3", "section_id": 5 } }
  ```

  answers envelope v2 `data: true` + the owned top-level key `record_info`
  (`null` when the record does not exist):

  ```json
  { "record_info": {
      "created":  { "date": "2026-01-02 03:04:05", "user_id": 7, "user_name": "ann" },
      "modified": null,
      "publication": {
        "first": { "date": "2025-12-31 00:00:00", "user_id": 8, "user_name": null },
        "last":  { "date": "2026-02-01 10:00:00", "user_id": 9, "user_name": "bob" },
        "state": "published" } } }
  ```

  Dates: `YYYY-MM-DD HH:MM:SS`, Dédalo wall-clock (the dbTimestamp shape); the
  client renders `DD-MM-YYYY HH:MM:SS`. Created / modified come off the audit
  components dd199/dd200 + dd201/dd197 (created falls back to the `data`
  column twin). Publication comes off the dd1758 ledger
  (`matrix_activity_diffusion`), not off the record: `first`/`last` = first /
  last PUBLISH row, `state` = the latest action of any kind
  (`published` | `unpublished` | `pending` | `null` = never in the ledger).
  Authorization: section grant ≥ 1 AND record scope; each audit stamp also
  passes the standing metadata grant or the component grant
  (`READ_DOOR_POSTURE` `component`).
- **Reason:** the panel needs the values; putting them back in the read would
  make every read (lists included) pay for a panel that shows one record. One
  small request after render costs the main request nothing.
- **Gate reconciliation:** no parity gate replays this action (it did not
  exist), and the read's fixtures are untouched — no re-harvest. Gates:
  `test/unit/record_info_native.test.ts` (server),
  `client/dedalo/test/client/js/test_inspector_record_info.js` (client).
- Server: `src/core/section/record/record_info.ts`,
  `src/core/diffusion_bridge/publication_history.ts`,
  `src/core/api/handlers/dd_utils_api.ts` (`get_record_info`).
  Client: `client/dedalo/core/inspector/js/render_inspector.js`
  (`load_record_info`).
