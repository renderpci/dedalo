# WC-2026-09-03-duplicate-record-new-activity-row — a duplicated record logs ONE `NEW` activity row naming its source, not the oracle's per-component `SAVE` rows

- **Date:** 2026-09-03, with the P1-8 remediation of the 2026-08-26 deep audit
  (DATA-18 / DATA-19 — record-birth doors that remembered their obligations
  one by one, and a `NEW` row the API door logged while the engine's own
  callers logged nothing). Written after the fact by the batch-3 synthesis: the
  review that verified P1-8 measured the divergence as un-ledgered (the door's
  header called it "a recorded divergence" with no entry), and this file is the
  record the same-commit law requires.
- **Decision:** DEC-12 (the `NEW` row is an obligation of the ENGINE door, so
  every caller — API, MCP, script — inherits it; gated by
  `test/unit/write_obligations_tripwire.test.ts` (the two ONLY `what:'NEW'`
  emitters in the corpus are `createSectionRecord` and
  `duplicateSectionRecord`, with distinct msgs; no door-level `NEW`) and
  `test/unit/write_obligations_native.test.ts` (duplicate → exactly one `NEW`
  row carrying `source_section_id`, the copied content, and the RAG index
  event)). WC-040's key rule ("payload keys mirror the PHP call sites
  verbatim") holds for every other row; this entry names the one row whose
  keys are not a PHP call site's, because PHP had no such row.
- **Shape before (PHP):** `section_record::duplicate()`
  (`core/section_record/class.section_record.php:2132`) called
  `section::create_record()` (`core/section/class.section.php:507`), which
  logged `NEW` with `msg:'Created section record'` and the five standard keys
  (`section_id`, `section_tipo`, `tipo`, `table`, `msg`) — the SAME row a
  fresh create logs, with nothing that says the record is a copy — and then
  re-saved every copied component in a loop (`$component->save()` per lang,
  `class.section_record.php:2221`), which appended one per-component `SAVE`
  activity row + Time Machine row for each. A duplicate therefore left N+1
  activity rows, and the fact that it WAS a duplicate was recoverable only by
  reading the `SAVE` rows' timestamps against the birth row.
- **Shape after (TS):** `duplicateSectionRecord`
  (`src/core/section/record/duplicate_record.ts`, step 8) copies the row in
  one INSERT (no re-save loop, so no per-component `SAVE` rows and no
  per-component TM rows — the clone's history begins at its birth, which the
  duplicate_record header documents under P0-10) and appends ONE
  `matrix_activity` row: `what:'NEW'`, `msg:'Duplicated section record'`, the
  five standard keys, plus `source_section_id:<the copied record's id>`. The
  host is the request-scope client IP or PHP's `'unknown'` for CLI. The row is
  written by the engine door, so the MCP/script callers inherit it; the API
  door logs nothing of its own. `WHAT` stays the closed 16-code vocabulary of
  WC-040 — there is no `DUPLICATE` code and this entry adds none.
- **Reason:** the consumer of the activity log is `area_activity`, which reads
  `msg` and the `data` keys as opaque display columns (`activity_read`), so an
  extra key and a different sentence render as such and break nothing; and
  the row is now MORE informative than the fossil — the audit trail of a
  heritage install can answer "which record was this copied from" from the
  row itself instead of from timestamp archaeology. Replaying the oracle's
  N per-component `SAVE` rows would be logging saves that did not happen: the
  TS door copies columns, it does not re-save components (P0-10 posture).
- **Gate reconciliation:** no re-harvest needed and none is possible. No
  frozen fixture holds a duplicate's activity rows (`activity_read_differential`
  replays reads of existing rows, whose msgs are the PHP ones and stay
  byte-identical). `test/unit/write_obligations_native.test.ts` pins the new
  row (one `NEW`, `source_section_id` set, the copied value on the clone) and
  `test/unit/write_obligations_tripwire.test.ts` pins that the duplicate and
  create msgs stay distinct and that no other file emits `what:'NEW'`.
  `test/unit/activity_log_native.test.ts` / `activity_read_native` are
  unaffected (they read rows they mint through `logActivity` directly).
