# WC-2026-10-01-relation-search-display-paths — a relation column in a search map is searched through what it displays

- **Date:** 2026-10-01.
- **Decision:** none (repairs a regression of WC-2026-09-23-relation-q-is-a-locator,
  whose "no client emits" free text on a relation leaf was wrong). Gate:
  `test/unit/search_display_paths_native.test.ts`. Code:
  `src/core/relations/request_config/search_display_paths.ts`, applied to the
  emitted context in `src/core/resolve/structure_context.ts` (relation-component
  owners only).

## Shape before

A relation component's context `request_config[i]` carried `search: null` /
`choose: null` unless the ontology declared them. The client mints one
filter_free leaf per LEAF ddo of `search.ddo_map ?? show.ddo_map` (common.js
build_rqo_search → get_ar_inverted_paths), so a relation ddo declared without
children — ontology42's "Modelo" (ontology6, a portal) — became a leaf and the
typed word reached a locator column: `request.invalid` for the whole search
since 2026-09-23 (PHP substituted `'[]'`, TS dropped it before — the field
never filtered anything).

## Shape after

When the effective search map (declared `search.ddo_map`, else `show.ddo_map`)
of a DEDALO-engine item holds a relation ddo with no declared children, the item
gains ONE new key, `search_paths`: that map with the relation's display ddos
written under it (its own LIST request_config show map: `parent` = the relation
tipo, target `section_tipo` array, enriched `model`/`label`). Kept: children
whose model has a search builder; a relation child descends (its declared
children, else its own config), never through a computed relation
(`COMPUTED_RELATION_SEARCH_MODELS`), an unported one or `component_external`,
never twice through the same relation tipo. A relation with NOTHING searchable
to display is left out of `search_paths`, with a server warning naming it (once
per ontology state). `component_dataframe` ddos are untouched. Not emitted for
non-dedalo engine items (zenon), nor when the expansion would leave no path.

`show`, `search` and `choose` are NEVER touched: result columns (choose → search
→ show), search-mode columns (get_columns_map, section_record), export and every
server reader see exactly what they saw before. The client reads `search_paths`
in ONE place — common.js build_rqo_search, for the filter_free paths only.
Client: the per-field input label names every path step (`Modelo › Término`).

## Reason

The cell shows the target record's term; the cataloguer types that word.
Spelling the deep paths in the search map lets the client search them like any
declared nested column — no rewrite behind the client's back, each path visible
as its own input, every hop through the search engine's ACL. A conform-time
rewrite of the free-text leaf was built and rejected the same day (review):
it fanned out per target section (225× for ontology42), failed whole searches
on media display columns, and inverted negation across fields. A first cut of
this entry emitted the expansion AS `search.ddo_map` (+ a `choose` pin); review
found it re-shaped search-mode portal columns (474 component/section pairs) and
killed the zenon search of rsc368 (empty search map) — hence the dedicated key.

## Gate reconciliation

No parity fixture carries a relation component context with an expanded search
map on the suite DB; the request_config / context unit gates are unchanged
(149 files, identical failing-name set with and without the change).
