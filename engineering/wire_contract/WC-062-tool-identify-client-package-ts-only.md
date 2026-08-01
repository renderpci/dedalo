# WC-062 — `tool_identify` client package is TS-only (2026-07-28)

ADDITIVE, no PHP counterpart: `tool_identify` is the object-identification
curator panel (`engineering/IDENTIFY_SPEC.md`), a TS-native tool that never
existed in the frozen PHP tree. Its client files therefore appear in the TS
`get_dedalo_files` census and in no oracle harvest, exactly like the tools
already ledgered as TS-only — `tool_error_report` (WC-019), the `error_reports`
widget (WC-018), and `tool_sitebuilder` + `site_builder_status` (WC-035).

Handled the same way they are: `isTsOnlyEntry` in
`test/parity/dedalo_files_differential.test.ts` filters the prefix from BOTH
sides of the set compare. **The frozen fixture is NOT edited** — a re-harvest is
impossible by definition, and rewriting a harvested oracle to accommodate new TS
files would destroy the very baseline the gate exists to hold. The predicate is
the sanctioned seam for "exists only in TS"; the fixture stays the record of
what PHP actually served.

Files: `/dedalo/tools/tool_identify/{js/*.js,css/tool_identify.css}`.
