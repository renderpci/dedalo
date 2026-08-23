# WC-2026-08-23-maintenance-widget-label-case — maintenance widget labels serve sentence case from the repo catalog

- **Date:** 2026-08-23 (ledgering a divergence that landed with the label
  subsystem move, WC-033/WC-034, 2026-07-16; measured red in
  `widgets_differential` since, and its header demanded this entry).
- **Scope:** the maintenance-area widget catalog labels
  (`src/core/area_maintenance/widgets/registry.ts`, labels served from the
  repo-owned catalogs `src/core/labels/`), read through `area_maintenance`
  `get_data` as the data item's `datalist[].label`.
- **Related:** WC-033 / WC-034 (program strings left the per-install
  dd_ontology label rows for repo-owned catalogs); the `<mark>` missing-label
  slots in the same gate (already normalized there with both sides asserted).

## Shape before (PHP, frozen 2026-07-11)

Nine widget labels were the PHP-era ALL-CAPS install terms, some with dropped
diacritics:

`DÉDALO API TEST ENVIRONMENT`, `SEARCH QUERY OBJECT TEST ENVIRONMENT`,
`PHP RUNTIME`, `DATABASE INFO`, `DB SEQUENCES STATUS`,
`DEDALO COUNTERS STATUS`, `DATAFRAME PAIRING INTEGRITY`, `PHP INFO`,
`SYSTEM INFO`.

## Shape after (TS)

The repo catalog serves sentence case with correct diacritics
("Dédalo API test environment", "Database info", "Dédalo counters status", …).
The change is LABEL TEXT ONLY: widget ids, categories, css classes, order and
every other metadata field are unchanged.

## Why

Repo-owned catalogs are the single source of truth for program strings
(WC-033); the sentence-case forms are the corrected editorial standard and the
diacritics are restored (the frozen `DEDALO COUNTERS STATUS` had lost its
accent). Pinning the engine to the frozen ALL-CAPS forms would pin a
translation-store defect.

## Gate

`test/parity/widgets_differential.test.ts` normalizes the slot the same way as
its `<mark>` slots: the exclusion applies ONLY where the frozen label is the
ALL-CAPS diacritic-folded twin of the TS label, both sides are asserted
(frozen = all-caps, TS = non-all-caps, folded-equal), and the matched count is
required non-zero so the exclusion can never quietly widen. (`php_runtime` and
`php_info` are already handled by the WC-030 merge normalization.)
