# WC-025 — move_* transform executors are a FUNCTIONAL port against the split schema, with mandatory dry-run

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 5 — the tld→tld transform engine
  unlocked behind the standalone-ownership gate).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) — historically never while
  coexisting with PHP (closed mode keeps the frozen `engine_denied` bytes). The
  panel (`get_value`) is unchanged (`{body, files}` — the definition-file
  listing, now read from the TS-owned `config.ops.transformDefinitionsDir`).
  The EXECUTE request is `{files_selected, dry_run}`; the response is a
  transform report `{result, msg, errors, dry_run, counts, sample}`.
- **NO BYTE ORACLE — functional parity (the load-bearing divergence):**
  `class.transform_data.php` is written against the LEGACY monolithic `datos`
  JSONB column (+ TM `dato`); the LIVE schema is split typed columns
  (data/relation/string/…/relation_search, TM `data`). A byte translation of
  the PHP SQL would be WRONG against the current DB. Every executor is
  therefore RE-EXPRESSED against the split schema (precedent: the diffusion
  functional-parity bar) — the transforms must WORK, not diff byte-for-byte
  against dead SQL:
  - `changes_in_tipos` (move_tld): structural `section_tipo`/TM `tipo` rename +
    matrix_counter drop + embedded-tipo string rewrite (`"old"`→`"new"`, PHP's
    own `replace_tm_data` approach) across every jsonb column of every table.
  - `changes_in_locators` (move_locator): counter-offset id move (structural)
    + an app-layer jsonb walk rebasing every referencing locator's
    section_tipo + section_id (the offset is per-reference, so not a string
    replace) + `set_move_identification_value`.
  - `portalize_data` (move_to_portal — THE flat-data+link-back pattern):
    per source record, copy each mapped component's column value under the
    target tipo into a NEW target-section record (relation locators repointed
    via from_component_tipo), set a component_portal locator on the SOURCE,
    null the moved source components, relocate the TM history in place
    (save_tm suppressed = a direct UPDATE, no new snapshot). Composed from
    createSectionRecord + updateMatrixKeysData (no PHP one-shot Save exists).
  - `move_data_between_matrix_tables` (move_to_table): INSERT…SELECT (over
    MATRIX_COPY_COLUMNS, not `datos`) + DELETE per tipo, one transaction each.
  - `change_data_lang`/`lang_to_nolan` (move_lang): re-key the lang inside the
    per-tipo column object + the TM `lang` column.
- **DRY RUN IS REQUIRED (TS improvement over PHP's execute-only transforms):**
  `dry_run` must be exactly `false` to mutate; absent/true reports the would-be
  deltas without writing. The response's `counts`/`sample` are the operator's
  pre-execute review.
- **NO ROLLBACK** for locator/tld moves (PHP parity — counter offsets are
  irreversible); the widget response and the engine header say so, and the
  dry-run is the safety gate. The operation is O(all rows across all tables)
  (the widget body itself warns "a very long process… all the records") —
  run under maintenance mode.
- **Gates:** `test/unit/transform_engine.test.ts` (pure locator-rebase +
  definition-file confinement + dry-run recorder units; safe SELECT-only
  dry-run smoke over the live DB with non-existent tipos; a real EXECUTE of
  changes_in_tipos on the matrix_test scratch table — rename + embedded rewrite
  + counter drop, cleaned up). portalize/locators EXECUTE against live sections
  is an operator drill on a scratch instance (ledgered — no automated surface
  mutates live section data).
