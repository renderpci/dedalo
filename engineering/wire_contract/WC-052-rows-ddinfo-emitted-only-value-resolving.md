# WC-052 — Rows `ddinfo`: emitted only for VALUE-RESOLVING ddos, stamped `from_ddo_tipo` (2026-07-25)

The section-rows breadcrumb (`read_source.ts` `emitRow`, the picker's
`value_with_parents` ddinfo) diverges from the frozen PHP oracle in two ways,
mirroring the v6 fix of 2026-07-24/25:

**1. Suppression of the phantom.** PHP emits the ddinfo for EVERY
`value_with_parents` ddo that runs for a row — but a `'self'` ddo resolves for
every searched section, so `hierarchy25` runs for a `tchi1` row where its
component has NO data (`entries: []`, `fallback_value: [null]`) and emits a
breadcrumb for a term that isn't displayed. With the client's ddinfo column
anchored after the hierarchy25 column, that phantom renders the parents chain
BEFORE the row's real term (`tch555` choose list: "chain → Cirat" instead of
"Cirat | chain"). TS emits the ddinfo ONLY when the ddo's just-emitted items
carry a real value (`entries` or the lang-fallback face `fallback_value` with
at least one non-null/non-empty element; locator-shaped entries count).

**2. `from_ddo_tipo` stamp.** Each emitted ddinfo carries the generating ddo's
tipo. The client (`get_columns_map`) now builds ONE ddinfo column per anchor
column of a `value_with_parents` ddo (ddos sharing a column share one ddinfo
column) and each column's `render_column_component_info` callback filters by
`from_ddo_tipos` — so a multi-section picker whose sections use DIFFERENT term
components (`hierarchy25` vs `tchi15`) renders every row as `term | parents`.
PHP keeps the phantom and stamps only `parent` (the caller/section tipo, which
cannot distinguish generating ddos). Existing parity projections are
unaffected: `autocomplete_search_differential` rsc92/fr1 compares
`section_id:chain` strings only, and its hierarchy25 fixture resolves real
values (nothing suppressed).

NOTE: whether a row gets a breadcrumb at all is ONTOLOGY-driven — the target
section's term ddo must declare `value_with_parents: true` in the request_config
block the client searches with (e.g. `tch555` needs it on `tchi15` in `choose`
for tchi1 rows to carry their chain).

### Gate

`test/unit/ddinfo_from_ddo_native.test.ts` (phantom suppressed; stamp names the
generating ddo; fallback_value and locator-shaped entries count as values;
non-vwp ddos never emit).
