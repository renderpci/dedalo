# TODO

- [x] Review all tools labels (get_tool_label) and translations. (2026-07-27: 63 undefined keys defined + 1241 translation entries → 309 keys × 10 app langs at 100%; fixed tool_assistant/tool_sitebuilder reaching for the wrong resolver and the `Columns`/`columns` case mismatch; deleted get_tool_label's unreachable 3-tier lang chain and gated the single-lang serving contract — engineering/TOOLS_SPEC.md § Tool labels.)
- [x] Review client test TS_OBJECT source (change ts1 by a safe thesaurus tipo).
- [x] Review tool_import_dedalo_csv importing from v6 raw data (v7_php_frozen it works, but v7 not)
- [x] Check component_date strange behavior when editing in list (modal) saves values different from the displayed one (e.g. rsc75 -> rsc89).
- [x] Check Activity (dd542) and Time machine (dd15) saerches in list. Both are special matrix variants, and needs specific handling.
# User section dd128
- [x] component_filter_records (dd128 -> dd478) does not work correctly. (2026-08-12: three defects. (1) the edit form rendered zero rows — the section read stubbed `datalist: []` and only the direct get_data door computed it; the datalist now rides the model emit hook, PHP's single json builder, and `list`/`tm` omit the key like PHP. (2) a search-panel filter row emitted NO item at all (synthetic `search_<n>` id → literal no-record branch returned []), so the unguarded `data.datalist.length` threw; the literal branch now serves the search shell like the relation branch. (3) the saved allow-list was never enforced — PHP gates it on a dropped constant AND its lookup is dead code; the row-level ACL is now a real predicate in the search assembler, inherited by list/count/UNION/per-record probe. WC-2026-08-12-filter-records-enforced; gate test/unit/filter_records_native.test.ts.)
- [ ] component_info (dd128 -> dd1537) user stats does not work correctly. It only shows the last activity, not the expected whole user activity history.

# general
- [ ] pages where the logged user has not access: Currently, the page shows this message: "Not retry-able HTTP error 403". It should show a more user-friendly message like "You don't have permission to access this page".
