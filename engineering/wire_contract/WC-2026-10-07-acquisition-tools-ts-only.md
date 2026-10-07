# WC-2026-10-07-acquisition-tools-ts-only — `tool_numisdata_acquisition` + `tool_bibliography_acquisition` are TS-only tools (no PHP twin)

- **Date:** 2026-10-07 (PR #114 finish; tools built on that branch from
  2026-09-11).
- **Decision:** none new — the WC-019 / WC-035 / WC-062 pattern for a wholly
  TS-native tool package.
- **Shape before (PHP):** nothing. Neither tool ever existed in the frozen PHP
  tree, so the PHP-imported `dd1324` registry the frozen store records has no row
  for either, and no oracle harvest saw their client files.
- **Shape after (TS):** two new tool packages in the TS-owned `tools/` tree, both
  section tools (`affected_models: ["section"]`, active, not always_active), each
  with a `server/` half that runs its acquisition as a background job the client
  follows through `request_stream` (dd_utils_api `get_process_status`):
  - `tools/tool_numisdata_acquisition/` — numismatic acquisition intake.
  - `tools/tool_bibliography_acquisition/` — bibliographic acquisition intake.
  The shared `dd1324` row of each is written ONLY by the TS *Register tools*
  widget (`TOOLS_ENABLE_REGISTRY_IMPORT`); PHP must never re-import tools (the
  standing COEXISTENCE rule), so a TS-written row is stable.
- **Reason:** additive features with no PHP counterpart; there is no fossil wire
  shape to keep, only the registry's "every seeded tool is in the registry"
  assumption, which cannot hold for a tool PHP never imported.
- **Gate reconciliation:** `test/parity/tools_register_differential.test.ts`
  carves both out of the in-registry requirement via `TS_ONLY_TOOLS` (each entry
  cites this id). They are still VALIDATED, still diff-free once registered, and
  covered by the gate's staleness self-test (every `TS_ONLY_TOOLS` entry must
  exist on disk). The client idempotency census
  (`test/unit/client_idempotency_tripwire.test.ts`) counts their two
  `request_stream` job followers (17 → 19 streaming sites, same day).
  `test/parity/dedalo_files_differential.test.ts` must filter the two client
  prefixes (`/dedalo/tools/tool_numisdata_acquisition/`,
  `/dedalo/tools/tool_bibliography_acquisition/`) from BOTH sides via
  `isTsOnlyEntry`, exactly as WC-062 does for `tool_identify` — their eight
  `js`/`css` files are in the TS census and in no harvest.
- **Fixture interaction (DEC-14b):** NO fixture edit, NO re-harvest. The frozen
  store stays the record of what PHP registered and served; the carve-out lives in
  the gate's TS-only set, never in the fixture.
