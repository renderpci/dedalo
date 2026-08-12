# WC-2026-08-11-diffusion-computed-inverse-hops — a field sourced from a computed-inverse relation model publishes its real values instead of NULL

- **Date:** 2026-08-11.
- **Decision:** — (owner-approved fix, this date; scope explicitly bounded to
  the locator SOURCE. Canon: `engineering/DIFFUSION_SPEC.md` §4.1, "Computed-inverse
  relation hops".)

## Shape before (TS, until 2026-08-11)

The plan compiler (`src/diffusion/plan/compile.ts`) compiles EVERY model whose
descriptor `column === 'relation'` into a `relation-hop` `ResolveStep`, so a
diffusion field whose ddo chain names a `component_relation_index` node (e.g.
`hierarchy40`) or a `component_relation_children` node compiled correctly. The
resolver then had ONE binary branch for a hop's locator source
(`src/diffusion/resolve/resolver.ts`, `walkChainLevel`):

```ts
if (hop.model === 'relation_list') rawLocators = await relationListLocators(...);
else rawLocators = readComponentItems(record, hop.tipo, hop.model) ?? [];  // + shape filter
```

`readComponentItems` (`src/core/resolve/component_data.ts`) is a pure column
dereference — `record.columns.relation[<tipo>]`. But **`component_relation_index`
stores nothing**: it is an inverse index computed per read from
`matrix_relation_index` ("who points at me?"). Same for
`component_relation_children`, whose children are derived from the inverse dd48
parent locators. The dereference therefore returned `[]`, the per-locator loop
never ran, no atoms were produced, and `fieldValuesToColumn`
(`src/diffusion/resolve/transform.ts`) returned early on the empty atom list —
the field's parser chain was never entered.

Published output: **NULL / empty column**, on every run, for every record. Silent
— no error, no plan warning, no run-report line. The PHP engine did not have this
hole (its chain processor resolved these models through the component's computed
`get_dato`), which is why `STRUCTURAL_HOP_MODELS` in the TS resolver has always
listed both models: the downstream half was ported, the source half was not.

## Shape after (TS)

The locator source dispatches on the three computed models, each answered by the
core engine that already owns that inverse question:

- `relation_list` — unchanged (`findInverseReferences`, ddo section/component
  filters, `String()` section_id).
- `component_relation_index` — `resolveIndexConfig(hop.tipo, record.section_tipo)`
  (`src/core/relations/models/relation_index.ts`) for the relation type
  (`properties.config_relation.relation_type ?? 'dd96'`) and the pointing
  sections (`request_config` sqo targets, else `all`), then
  `findInverseReferenceLocators` (`src/core/search/search_related.ts`) with
  `limit: false, order: 'section_id'`, mapped through `parseInverseEntry`
  (`src/core/resolve/relation_index.ts`). Same call the edit read path makes
  (`readRelationIndexData`) **without pagination**: a publication takes the full
  inverse set, never an edit page.
- `component_relation_children` — `getChildren(section_id, section_tipo, hop.tipo)`
  (`src/core/relations/children.ts`), limit 0 = all: the same engine
  `relationChildrenResolver` rides.
- every other relation model — the stored-slice read and its shape filter,
  unchanged byte for byte.

Both new sources are memoized in per-run `RunContext` maps beside
`relationListCache`, keyed on record identity plus every resolved filter (index:
hop tipo + relation type + target sections; children: hop tipo).

**Nothing else moved.** The queue guard's `hop.model !== 'relation_list'`
exemption is NOT extended, `STRUCTURAL_HOP_MODELS` is untouched, child-ddo
recursion, publishability gates and `add_parents` are untouched. The diffusion
node defines how its ddo chain resolves; only WHERE a hop's locators come from is
the model's storage contract.

## What a consumer must expect

A published table/file column, for any plan whose field chain sources one of
these two models, changes from **NULL/empty to real values** — on the next run of
an already-published element, without any ontology edit. Concretely:

1. **Columns populate retroactively.** MariaDB targets upsert per
   `(section_id, lang)`, so a re-publication overwrites the NULLs in place; the
   file formats re-render the record. A downstream consumer that treated the
   column as "always empty" (a view, an import script, a hand-written SQL filter
   on `IS NULL`) now sees data.
2. **Row/value counts grow.** An inverse index on a hub record can carry a large
   set; the full set is published, not a page. Fields that merge or join the hop's
   values (`merge_columns`, join parsers) produce longer strings than before.
3. **`section_id` in these locators is a canonical INT**
   (`WC-2026-08-10-section-id-int-canonical`), while `relation_list`'s pinned
   frozen-consumer edge keeps `String()`. A json-shaped column sourced from a
   computed-inverse hop therefore publishes `[1]`, not `["1"]`, unless its parser
   chain names `get_v6_section_id`. Check the actual field's parser chain before
   assuming the v6 string byte-form.
4. **The fallback link stamps `hop.tipo` as `from_component_tipo`** for index
   locators: `parseInverseEntry` renames the stored field to
   `from_component_top_tipo`, and it is deliberately not reconstructed — the same
   stamp `relation_list` locators take.
5. **An unmaintained relation index now fails loudly.** `requireRelationIndex`
   throws inside the find and the error propagates into the per-field error list
   (mirroring `relation_list`'s identical exposure) instead of being swallowed
   into an empty locator list. A run against an install whose
   `matrix_relation_index` was never built reports errors where it used to
   publish silent NULLs — that is the intended replacement of a silent narrowing
   with a loud one.

## Reason

A NULL column is indistinguishable from "this record has no related items", so
the defect was invisible at every surface a consumer has: the run report was
green, `validate` was green, and the published artifact was well-formed. The
engine was answering a question it never asked the database. Publication must
resolve what the diffusion node declares — and for a computed model, resolving it
means asking the core inverse engine, not dereferencing a column that by
definition holds nothing.

## Gate reconciliation

**No parity fixture is affected and no re-harvest is possible** (frozen store,
`engineering/ORACLE_HARVEST.md`): diffusion publication artifacts are not an
oracle-harvest surface — §2.2 of `engineering/DIFFUSION_SPEC.md` judges parity at
the artifacts (published MariaDB rows/schema, rendered files), not at the app
wire, and the frozen store carries neither.

Verified at landing: `bunx tsc --noEmit` clean, `bunx biome check` clean on the
edited file, and the tripwires `module_state`, `import_scc`,
`diffusion_boundaries`, `sql_confinement`, `section_id_int` and `ws_a` green (the
new imports are static core→diffusion edges of the sanctioned direction, matching
the existing `findInverseReferences` import). The `diffusion_plan_compile` and
`diffusion_parsers` reds observed in the same run are pre-existing and reproduce
on the stashed tree.

**Owed gate (DEC-12):** a hermetic unit gate asserting that a `relation-hop` on
each computed model yields the core engine's locator set — and that a stored-slice
model still reads its slice — so the NULL cannot silently return. Until it lands,
this entry is the only thing holding the invariant, which is exactly the state
"tripwire or delete" exists to end.
