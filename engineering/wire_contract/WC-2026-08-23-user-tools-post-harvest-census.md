# WC-2026-08-23-user-tools-post-harvest-census — the frozen user_tools census is the 2026-07-11 registry; post-harvest registrations and field flips are adopted, not regressions

- **Date:** 2026-08-23 (parity red-cluster adjudication; the frozen store is LAW and
  cannot be re-harvested, so post-harvest registry evolution must be ledgered here).
- **Decision:** `test/parity/user_tools_differential.test.ts` compares against the frozen
  35-tool `user_tools` capture. Tools registered AFTER the harvest, and fields flipped
  after it, are adopted divergences — normalized in the gate WITH a positive TS-side
  assertion each, never silently smoothed.

## The adopted divergences

1. **Post-harvest tool registrations** — filtered from the TS side before the set
   compare, each with its own ledger entry for the registration itself:
   - `tool_identify` (**WC-062**, registered post-harvest; the frozen list cannot carry it).
   - `tool_sitebuilder` (**WC-035**, same).
   The gate's recovery half asserts each filtered name IS still served by the TS
   registry, so the filter can never hide a tool that fell out of `matrix_tools`.

2. **`tool_ontology` (dd1332) `show_in_component`: false → true** — commit
   `d43cadc1d7` ("feat(tool_ontology): show on ontology components", 2026-07-26,
   15 days after the harvest). The frozen DDO says `false`; the adopted contract is
   `true`. The gate normalizes the oracle side to `true` AFTER asserting the TS side
   actually serves `true`, so a regression back to `false` reddens.

## Why not edit the fixture

The harvest store is frozen (final harvest 2026-07-11, PHP decommissioned; a re-harvest
is impossible by definition). Every future post-harvest registration follows the same
pattern: grow `POST_HARVEST_TS_TOOLS` / `POST_HARVEST_FIELD_FLIPS` in the gate, cite the
WC entry of the change, keep the positive TS-side assertion.
