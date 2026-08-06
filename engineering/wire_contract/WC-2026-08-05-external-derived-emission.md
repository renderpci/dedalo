# WC-2026-08-05-external-derived-emission — component_external emits a DERIVED item, not a portal relation

- **Date:** 2026-08-05 (the component side of the external-record subsystem).
- **Decision:** — (DEC-12 gates shipped with it:
  `test/unit/external_emit_native.test.ts`,
  `test/unit/external_degradation_tripwire.test.ts`, plus the
  `NO_RESOLVE_DATA` / `NO_IMPORT_CONFORM` exemptions in
  `descriptor_completeness_tripwire`).

### Shape before (PHP)

`component_external` extends `component_common` and its `get_dato()` never
reads a matrix column: it calls `load_data_from_remote()`, which asks the
section's `properties.api_config` endpoint for the record whose id IS the
`section_id`, and folds `properties.fields_map` over the answer. The model is
absent from `component_relation_common::get_components_with_relations()`, so
nothing in the relation machinery ever touched it either. On the wire the
component emitted its mapped values, with no provenance of any kind.

The frozen v7 TS engine, until today, declared `resolveData: 'portal'` on the
descriptor. That routed the model into `expandPortal`, which reads
`record.columns.relation[<tipo>]` and returns early on an empty bag. **There is
no matrix row anywhere for an external section** — `zenon1` has zero rows in
every matrix table and no `matrix_zenon` exists — so the component emitted ZERO
items, in every mode, always. That is not a divergence from PHP; it is the
absence of the feature.

### Shape after (TS)

The descriptor declares `emitHook: 'external'`. `section/read.ts emitDdoData`
consults REPLACE emit hooks BEFORE the relation branch, so
`components/component_external/emit.ts` fully owns the emission and
`components/component_external/value.ts` derives the values through the
`src/external/` facade. The emitted item is LITERAL-shaped:

```json
{
  "section_id": "001338683",
  "section_tipo": "zenon1",
  "tipo": "zenon5",
  "mode": "edit",
  "lang": "lg-nolan",
  "from_component_tipo": "zenon5",
  "entries": ["primary: Casana, Jesse | secondary: Cothren, Jackson"],
  "row_section_id": "001338683",
  "parent_tipo": "zenon1"
}
```

`section_id` is echoed VERBATIM: the remote id is a zero-padded string, the
client matches its instance by `String(el.section_id) === String(self.section_id)`,
and `Number('001338683')` both breaks that match and asks the service for a
different record.

Three facets left the descriptor with the resolver:

- **`resolveData`** — removed. A resolver that resolves nothing is worse than
  none: it hides the fact that the model has no relation face.
- **`importConform`** — removed. The value is DERIVED; the local record has no
  slot for it, so **every** import cell shape is now REFUSED per cell, leaving
  whatever the record holds untouched. A flat cell hits `conformImportData`'s
  no-facet tail (`IGNORED: '<model>' has no flat-value import form`); a JSON
  cell and an EMPTY cell hit the new derived-field check ahead of it
  (`IGNORED: '<model>' is a DERIVED field …`), because the model-agnostic JSON
  round-trip would otherwise write a fossil into a column the read path never
  consults again, and an empty cell would "clear" a value that does not exist
  locally. That check is exact: it fires for a RELATION-column model with no
  import facet, and `descriptor_completeness_tripwire` requires the facet on
  every other relation model.
- **`column: 'relation'`** — KEPT, and annotated INERT: column-map parity with
  PHP's `section_record_data::$column_map` only. Nothing writes it and nothing
  reads it. Dropping it would also drop the model's `search` face, which the
  search dispatcher and `relation_search_builders.test.ts` depend on.

`flatValue` is the new `'external'` family rather than `'string'`: the flat
cell (a `section_list` column — `zenon8` really does list `zenon3`..`zenon6`)
is derived through the adapter, because `'string'` means "lang-slice the stored
jsonb value" and this model stores none. Declaring `'string'` would have
resolved every such cell to a silent null while claiming a value existed.

The model's `search` stays `unported` and still THROWS, but the REASON is
corrected: not "PHP fatals", but **there is no SQL surface** — the value lives
in a third-party API, so an external search must go through the adapter's
`buildSearchRequest`, never through SQO.

### Reason

The model emitted nothing at all. Everything else here follows from putting the
derivation where the value actually comes from: once emission is a hook, the
relation facets are lies and the flat-value family has to be derived too.

### Gate reconciliation

`external_emit_native` pins the item shape, the verbatim id echo and the
empty-relation-column regression directly. `descriptor_completeness_tripwire`
carries the two named exemption sets with their justifications, and
`component_registry.test.ts` asserts the resolver's absence deliberately (the
model left `GOLDEN_RESOLVER_MODELS`).

**No parity fixture is affected**: the frozen oracle-harvest store contains
`zenon*` nodes only in CONTEXT / `ddo_map` blocks — no fixture holds a data
item for any `component_external` tipo (verified by walking every fixture for
an object with a `zenon<n>` tipo and an `entries` key: zero hits). **Re-harvest:
NO — impossible by definition.**
