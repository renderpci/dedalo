# WC-2026-08-23-tool-export-register-labels — tool_export's registered label set grew with the breakdown/columns export UI

- **Date:** 2026-08-23 (ledgering an additive change that landed in
  `tools/tool_export/register.json` with the export_tabulator breakdown
  rebuild; the frozen fixture predates it — measured red in
  `tool_element_context_differential`).
- **Scope:** the tool element context served by `get_element_context` for
  `source.model: 'tool_export'` (`buildToolElementContext`,
  `src/core/tools/registry.ts`): the `labels` array.
- **Related:** the export_tabulator breakdown/columns rebuild
  (`engineering/ORACLE_HARVEST.md` tool_export rows); WC-033/WC-034 (label
  ownership).

## Shape before (PHP, frozen 2026-07-11)

`labels` carried the pre-breakdown UI strings only.

## Shape after (TS)

Six label rows were ADDED (per served lang), all consumed by the breakdown /
column-toggle export UI the frozen engine did not have:

`activate_all_columns`, `disable_all_columns`, `active_elements`,
`breakdown`, `tool_export`, `value_with_parents`.

Nothing was removed or reworded: the change is strictly additive.

## Why

The export tool's client gained the deep-breakdown and column-activation
controls after the freeze; their strings live in the tool's own register
(the tool-local label home per WC-034), so the served context necessarily
grew with the UI.

## Gate

`test/parity/tool_element_context_differential.test.ts` filters exactly this
name set out of the TS `labels` before the byte-compare, asserts every filtered
row's name is IN the set, that the frozen side carries NONE of them (additive,
never a rewording), and that the filter matched at least one row — so the
exclusion can never quietly widen or go stale.
