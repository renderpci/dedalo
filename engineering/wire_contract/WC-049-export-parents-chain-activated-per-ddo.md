# WC-049 — Export parents chain ACTIVATED: per-ddo `value_with_parents` → sibling `#parents` column (grid_value only) (2026-07-24)

The PHP export feature (`component_relation_common::get_export_value` parents
block + `get_locator_value show_parents`) that the TS rewrite carried as an
INERT flag is now implemented — with three deliberate divergences from PHP:

1. **Per-ddo ONLY.** The flag lives on the export column
   (`ar_ddo_to_export[].value_with_parents`, the per-column checkbox). The PHP
   request-global `options.value_with_parents` (the old global "Export parents"
   checkbox) is REMOVED from the client and IGNORED by the server
   (`compileExportPlan` reads only the ddo).
2. **grid_value format ONLY.** PHP also folded parents atoms into the flat
   `value` cells via `join_atoms`; TS `value`/`dedalo_raw` outputs are
   unchanged (`resolveValueCell` never reads the flag; the value-format label
   derivation calls `collectGridAtoms` with parents OFF).
3. **ONE pre-joined atom per locator.** PHP emitted one atom per ancestor and
   joined at tabulate time with the segment's `fields_separator (' > ')`; the
   TS tabulator's cell join is fixed `' | '`, so `atoms.ts
   resolveParentsChain` pre-joins the chain (`' > '`, nearest parent first,
   self excluded, empty terms dropped) into one atom. Same cell bytes.

Emission (atoms.ts): per relation locator, `getParentsRecursive` ×
`getTermByLocator(fromCache)` → an extra atom whose segment path appends
`{sub_id:'parents', section_tipo: target, component_tipo: relation tipo,
item_index: locator position}` — column key ends `#parents`, label leaf is the
verbatim `parents`, rows align with the locator's child atoms in every
breakdown. Both relation paths emit: the WC-008 compact portal cell (parents
segment unindexed, first segment carries the locator position) and the
request-config fan-out, where the flag inherits down EVERY relation level
(PHP `export_context::descend` parity). Targets without hierarchy (no
`component_relation_parent`, no parents) emit NOTHING — never an empty column.
Parents apply to the ddo's LEAF relation targets (+ nested fan-out levels),
not to intermediate DECLARED hops — a per-column flag names its own column.

Client gate (tools/tool_export): the per-column checkbox renders only for
models `component_portal | component_autocomplete | component_autocomplete_hi`
(the old broader relation-model set is retired) AND when the NEW
`tool_export.components_with_parent` action (`{components:[{tipo,
section_tipo}]} → {[tipo]: boolean}`, section read gate) confirms a
hierarchical target — targets resolve through the datalist's
request-config builder (explicit configs, hierarchy_types, 'self', implicit
ontology relations). Legacy presets carrying the global flag apply cleanly
(the key is ignored; per-ddo flags ride the preset's ddo list). The
`value_with_parents` tool label is now in register.json (was a hardcoded
English fallback).

**Fixture impact: NONE.** No tool_export oracle fixture carries
`value_with_parents` (the section-read `ddinfo` fixtures that do are a
different feature, untouched). The output only changes when the per-ddo flag
is sent — additive.

### Gate

`test/unit/tool_export_parents_native.test.ts` (test3 playground: scratch
27→2→1 chain + stamped lg-spa terms — compact + fan-out emission with key/
label/chain-order/cell bytes, per-ddo-only, grid_value-only, parent-less
emits nothing, `components_with_parent` truth table + invalid_request) ·
`diffusion_export_unified.test.ts` (protocol invariants with the flag on, both
formats).
