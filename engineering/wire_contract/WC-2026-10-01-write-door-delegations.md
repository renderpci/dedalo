# WC-2026-10-01-write-door-delegations — the remaining record writers ask the write door per record and component

- **Date:** 2026-10-01 (closure Step 3, integrator request 10 — the PENDING rows of the dd128
  write census).
- **Decision:** closure Step 3 (WRITE-DOOR, WC-2026-09-30-write-door). Code:
  `src/core/tools/translation.ts`, `tools/tool_posterframe/server/index.ts`,
  `tools/tool_update_cache/server/index.ts`, `src/core/media/ingest/companion_writes.ts`,
  `src/core/tools/import_execute.ts`, `src/core/tools/import_csv_execute.ts`,
  `tools/tool_import_files/server/index.ts`,
  `tools/tool_time_machine/server/bulk_revert_undo.ts`.
- **Shape before:** these doors authorized a (section, component) PAIR with no record named
  (or read the raw pair level), so the dd128 own-record rule never applied to the records
  they actually wrote, a non-number id could skip the scope, and some ran the global-admin
  bypass ahead of the non-positive-id refusal: a `(dd128, dd1725)` user-manager could set
  their OWN profile through a translation, a cache rebuild over their own user record, a
  CSV/MARC21/Zotero import row, an import-files role field, a media upload whose ontology
  names a dd128 companion, or a bulk revert of a run that touched their record.
- **Shape after:** each writes only what the write door authorizes for the actual triple
  (section, component, record), as the acting principal, before the write and addressed by
  the grant:
  - `tool_lang` / `tool_lang_multi` `automatic_translation`: refused with the door's code
    (`perm.denied`, `perm.out_of_scope`, `request.invalid` for a missing / fractional /
    garbage `section_id` — formerly read as record 0) before any translator call.
  - `tool_posterframe` `create_identifying_image`: the HOST portal of the host record through
    the door (the payload's raw pair + admin-skipped scope before); the new record's image
    component asked as a section target. Refused before the portal save.
  - `tool_update_cache` `update_cache`: every matched row × component; a refused target is
    SKIPPED and reported — new payload key `refused` (count), its sentences in `errors`, and a
    summary clause.
  - Media ingest companions (`target_filename` / `target_duration`): a refused companion is a
    message in the ingest's derivative errors (never written), as other companion failures.
  - MARC21 / Zotero / RDF (`importMappedRecords`, now taking the importing principal) and the
    CSV importer: a refused field / column is reported `IGNORED: not writable by the importer
    (<code>) — … NOT written`; a refused create fails its row.
  - `tool_import_files`: the run-time role writes, the media component and the host portal
    through the door's triple (a record born in the run: its pair as a section target).
  - `tool_time_machine` `bulk_revert_process`: every component a unit writes; a refusal is
    the unit's existing `out_of_scope` skip.
- **Owner review:** (1) CSV / mapped imports now require the pair grant on every imported
  column — the audit columns (`dd197`/`dd199`/`dd200`/`dd201`) included — where the file door
  asked the section only; (2) update_cache skips-and-reports instead of refusing the whole run
  (tool_propagate_component_data's precedent).
- **Reason:** one rule for every write of a record's component, asked where the record is
  known.
- **Gate reconciliation:** no parity fixture covers these writers' refusals; no re-harvest.
  Gates: `test/unit/authz_door_matrix_native.test.ts` (a DD1725 leg per door — real handler or
  shared engine — plus their CONTROL twins; each mutation-verified red), the dd128 census
  (`dd128_write_census_tripwire`: PENDING 13 → 4, each moved row `delegates` on a probed
  door), `test/unit/tool_lang.test.ts` (the id grammar).
