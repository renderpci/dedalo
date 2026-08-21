# WC-2026-08-19-tools-gates-test-tld — the tools/export parity gates replay under the generic `test` TLD

- **Date:** 2026-08-19 (the generic-`test`-TLD migration, phase 5 — the tools/export group).
- **Mechanism:** unchanged from `WC-2026-08-19-test-tld-replay` (the seam: `unmapRqo`
  before `hashRequest`, `adoptTipoIdMap` on the frozen body, the two committed maps
  `src/core/test_data/test_tld_tipo_map.json` + `test_corpus/id_map.json`). This entry
  ledgers the GATES moved onto it, and the two gate-local, declared reductions they add.
- **Decision:** DEC-14b + the AGENTS.md hard rule adopted 2026-08-19 (a test uses the
  generic `test` TLD and BUILDS the situation it tests).

## Gates migrated

| Gate | Was | Is |
|---|---|---|
| `test/parity/section_tools_differential.test.ts` | 1 pass / 3 fail | **6 pass / 0 fail** |
| `test/parity/section_tool_start_differential.test.ts` | 9 pass / 1 fail | 9 pass / 1 fail |
| `test/parity/tool_component_read_differential.test.ts` | 1 pass / 5 fail | 2 pass / 4 fail |
| `test/parity/tool_export_differential.test.ts` | 0 pass / 15 fail | 1 pass / 14 fail |
| `test/parity/tool_export_breakdown_differential.test.ts` | 0 pass / 21 fail | 0 pass / 21 fail |

Each writes its RQO in `test`-TLD terms and reads the frozen body through
`adoptTipoIdMap`, asserting `matched === true` plus a rewrite floor. Seed-shipped ontology
(`rsc`, `dd`) stays, spelled `seed('rsc', 170)` so the census can tell a seed tipo from an
install one. The gates that read RECORDS own their corpus scope
(`ensureTestCorpus` / `dropTestCorpus`, residue asserted 0); the gates that read only
DEFINITIONS seed none.

`test/parity/tool_element_context_differential.test.ts` and
`test/parity/user_tools_differential.test.ts` were in the group but bind NO install TLD
(they are absent from `engineering/generic_tld_baseline.json`) — nothing to migrate.

## The gate-local reductions, declared

Both follow the `UNCLONED_TOKENS` / `CORPUS_SCALE_FIELDS` discipline: state the fact on
BOTH sides instead of comparing it, and make the declaration itself non-vacuous.

1. **The clone root.** A phase-2 clone is cut at the section root, so a frozen context
   entry is parented by the install's AREA node (no twin) and a cloned section's label
   carries a ` | <tld>` twin suffix. `section_tools` and `section_tool_start` assert the
   frozen `parent_grouper` exactly and remove it before the walk (neither gate compares
   that field); `section_tool_start` asserts `ts.label === php.label + ' | test'`;
   `tool_export_breakdown` strips the suffix from the TS side only, behind a counter that
   reddens if it never fires.
2. **The corpus-scale total.** `tool_component_read` compares the page (limit/offset,
   entry count, emitted tipo sequence) verbatim and asserts the related-record TOTAL on
   each side exactly — 34 in the frozen install answer, 9 in the committed corpus. A
   corpus that held all 34 would be the install.
3. **Tools the oracle cannot carry** (`section_tools`, extending the WC-019 pattern):
   `tool_identify` postdates the 2026-07-11 harvest and has no PHP package, and
   `tool_diffusion` is availability-gated on the install's diffusion section-map. Both are
   asserted present-on-one-side / absent-on-the-other rather than dropped, and the
   diffusion map keeps a POSITIVE control the gate now BUILDS (the `zzd` diffusion
   situation) instead of borrowing from an install.

## What a consumer must expect

Nothing on the wire changes: no engine byte, no client byte, no fixture byte. The frozen
interaction hashes are the ones PHP answered.

## Residual reds — all CORPUS ABSENCE, none a TLD binding

- `tool_export*`: a tool_export response is a flat grid of DISPLAY STRINGS and reveals no
  storable component data, so `scripts/derive_test_corpus.ts` refuses these gates' records
  as `never_revealed` (68 entries tagged `tool_export*` in `test_corpus/refused.json`).
  The rows compare cell for cell and diverge exactly where the corpus is thin.
- `tool_component_read`: the corpus holds the nine coin records the gate pages but not the
  18 `rsc170` media rows they point at, so no `rsc29` image item is emitted (46 items vs 64).
- `section_tool_start`: NOT corpus — the ambient `dd_ontology` (and the clone derived from
  it) carries the PRE-alias `tool_config` while the frozen body carries the POST-alias one.
  It reddened identically before the migration.

Each is recorded in its own file header. No assertion was relaxed to hide one.

**Re-harvest: NONE, and impossible by definition** (`engineering/ORACLE_HARVEST.md`).
