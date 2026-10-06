# WC-2026-10-06-consultation-only-no-section-tools — consultation-only sections carry no section toolbar (2026-10-06)

- **Date:** 2026-10-06 (TODO-042: "Time machine section (dd15), as Activity
  section (dd542) must not have tools").
- **Decision:** continuation of the WC-010 directive — Activity (dd542) and Time
  Machine (dd15) are strictly read-only for every caller. A section toolbar holds
  only actions against records, so a section no one may write must not offer one.
- **Shape before (PHP + TS port):** `getSectionTools` applied the generic
  `common::get_tools` filter to EVERY section, so dd542 listed five tools
  (`tool_export`, `tool_import_dedalo_csv`, `tool_print`, `tool_time_machine`,
  `tool_update_cache` — frozen `activity_read_differential.json` /
  `list_column_sortable_differential.json`) and dd15 listed `tool_export`
  (`tm_*_differential.json`). The only exclusion was `NO_TOOLS_MODELS`
  (`component_section_id`/`component_info` components); nothing section-scoped.
- **Shape after (TS):** `getSectionTools` (`src/core/tools/registry.ts`) returns
  `{ tools: [], ledgered: [] }` when `isConsultationOnlySection(tipo)` is true —
  before any registry/DB read. The section context ships `tools: []` for dd15 and
  dd542 in every mode (a `simple` build already shipped none). Rule is
  SECTION-LEVEL only: components INSIDE these sections keep their element tools
  (e.g. tool_time_machine on a historical value), which is the intended seam.
- **Reason:** importing a CSV into an append-only audit log, or any other
  record-mutating action on a section the engine hard-refuses to write, is a
  dead affordance. Keying on the existing `CONSULTATION_ONLY_SECTIONS` set keeps
  one source of truth and gives a future read-only section the same behavior for
  free.
- **Gate reconciliation:** no parity gate compares the TOOLS of dd15/dd542.
  `activity_read_differential` / `list_column_sortable_differential` compare
  data/column-sortability; the tm differentials compare data. The generic
  `section_tools_differential` and `get_element_context_differential` read the
  `testmint1` clone and a non-consultation section, so they are untouched. The
  invariant is pinned by `test/unit/consultation_only_sections_tripwire.test.ts`
  (third layer: `getSectionTools` empty for both, plus a non-consultation
  control), alongside WC-010's permission cap and write-engine backstops.
- **Fixture interaction (DEC-14b):** NO fixture edit, NO re-harvest. The frozen
  store still carries PHP's dd15/dd542 tool lists; the divergence is absorbed
  because no gate diffs those lists (the ones that could read a section's tools
  use a generic TLD clone). The two docs that stated "no dd15-specific rule
  exists" (`tool_time_machine.md`, `tool_export.md`) are corrected the same day.
