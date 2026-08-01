# WC-001 — `entries: []` for empty component values (was `entries: null`) — UNIFIED

- **Date adopted:** 2026-07-02 (commit 589deae, portal + select families);
  gates reconciled 2026-07-07; **unified for ALL models 2026-07-07** (WS-C:
  the single chokepoint is `resolve/component_data.ts buildDataItem`, which
  normalizes a null value to `[]` for every data item the engine emits).
- **Decision:** DEC-02, option (a) — adopt `[]` as the TS contract.
- **Shape before (PHP):** a component data item with no stored value emits
  `"entries": null`.
- **Shape after (TS):** the same item emits `"entries": []` — every model,
  every mode.
- **Reason:** the byte-identical client's lifecycle code requires an array
  (`Array.isArray` assertions in the client suites; `entries.map(...)` call
  sites crash on null). The client is the actual consumer of this seam.
- **Gate reconciliation:** `test/parity/normalize.ts#adoptEntriesArrayContract`
  rewrites a PRESENT `entries: null` to `[]` before diffing — every other byte
  is still compared verbatim. Applied to the **PHP side only** in:
  `read_differential`, `portal_differential`,
  `portal_edit_subdatum_differential`, `portal_drag_capture_replay`,
  `get_data_differential`, `complex_relation_sweep`, and
  `model_coverage_sweep` (previously BOTH sides
  there; the TS side is now compared RAW, so an engine regression back to
  `null` reddens the sweep — the shrunken normalization doubles as the
  tripwire). Future gates that byte-compare data items must import it rather
  than hand-rolling.
- **Scope note:** only the DATA-item `entries` key. Envelope (`sections`)
  entries were always arrays on both engines.
