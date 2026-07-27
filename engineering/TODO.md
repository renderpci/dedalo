# TODO

- [x] Review all tools labels (get_tool_label) and translations. (2026-07-27: 63 undefined keys defined + 1241 translation entries → 309 keys × 10 app langs at 100%; fixed tool_assistant/tool_sitebuilder reaching for the wrong resolver and the `Columns`/`columns` case mismatch; deleted get_tool_label's unreachable 3-tier lang chain and gated the single-lang serving contract — engineering/TOOLS_SPEC.md § Tool labels.)
- [x] Review client test TS_OBJECT source (change ts1 by a safe thesaurus tipo).
- [x] Review tool_import_dedalo_csv importing from v6 raw data (v7_php_frozen it works, but v7 not)
- [x] Check component_date strange behavior when editing in list (modal) saves values different from the displayed one (e.g. rsc75 -> rsc89).
- [ ] Check Activity (dd542) and Time machine (dd15) saerches in list. Both are special matrix variants, and needs specific handling.
