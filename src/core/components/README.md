# `src/core/components/` — per-model homes

Dédalo is ontology-driven: the component **model** (`component_input_text`,
`component_relation_parent`, …) is the atom of the system. Resolution itself is
horizontal — it lives in the engines (`resolve/`, `search/`, `relations/`,
`section/`). This directory is not another engine; it is the **named home** for
each model, so a developer or an AI agent can open one place and understand a
model completely without reverse-engineering the PHP tree.

## Layout

```
component_<model>/
  descriptor.ts     # the ComponentModel: what this model IS (see ./types.ts)
  samples/          # what this model LOOKS LIKE (reference, most models)
    data.json       # §3.7 Data     — the stored value shape
    context.json    # §3.7 Context  — ontology structure (properties, css, tools, permissions…)
    api_data.json   # the emitted API item (matches DataItem in resolve/component_data.ts)
registry.ts         # collects every descriptor; getComponentModel(model); load-time coverage check
types.ts            # the ComponentModel / ComponentSearch interfaces
```

The `samples/` sets mirror the copied client's `client/dedalo/core/component_*/samples/`
trees — same shape on both sides of the seam. They are **reference only**: no
runtime code reads them. Two canonical models carry no client sample set yet
(`component_dataframe`, `component_autocomplete_hi`); alias-only stubs
(`component_html_text`, …) have a descriptor but no samples by nature.

## The descriptor is DECLARATIVE

A `descriptor.ts` holds small data (which matrix column, is it class-translatable,
which relation resolver, is its search ported) and **links out** to the modules
that carry heavier behavior — it must never grow inline logic, or it rots into a
god-registry. Example: `component_relation_parent/descriptor.ts` reuses
`portalResolver` for row emission and points to `relations/parent.ts` (hierarchy /
ancestor walk / sibling order) and `relations/dataframe.ts` (id_key order) in a
comment.

## Adding a component model — the HONEST checklist (S2-26)

The registry routes a lot, but **not everything** — the old "nothing in the
engines changes" claim was overstated and is retired. Work the list top to
bottom; the descriptor-facet steps are enforced by
`test/unit/descriptor_completeness_tripwire.test.ts`, the engine steps are not
(yet) and will bite silently if skipped.

**Descriptor side (registry-routed — declare, don't edit engines):**

1. Create `component_<model>/descriptor.ts` exporting one `ComponentModel`;
   add its import + array entry in `registry.ts`.
2. Declare `column` (or `alias` for a legacy name) — routes storage +
   column resolution.
3. Declare `classSupportsTranslation` if the PHP class supports translation.
4. Relation-column model? Declare `resolveData` (row emission), `search`
   (`{status:'ported'}` or a ledgered `'unported'` reason), and
   `defaultRelationType` (the PHP class-level `$default_relation_type`).
   The propagate/relation-data set derives automatically from the column.
5. Non-relation searchable model? Declare `searchBuilder`
   (`'string' | 'number' | 'date' | 'iri' | 'section_id'`) — without it,
   SQO searches on the model throw loudly in `search/conform.ts`.
6. CSV-importable scalar model? Declare `importValueProperty: true`
   (PHP `$components_using_value_property`) — without it, bare cells import
   as raw strings instead of `{value:…}` items.
6b. Does the model have a HUMAN-authored CSV form ('21-05-1998', '1.234,56',
   '41.38, 2.17', '273,418')? Declare `importConform` (an `ImportConformId`)
   and add its parser to `tools/import_conform.ts` IMPORT_CONFORM (PHP's
   per-class `conform_import_data()` override). Omitted = the model has no
   flat form: a JSON cell still round-trips (that path is model-agnostic), but
   a flat cell is REFUSED rather than written as a silent clear — which is the
   correct default for the media models. Every relation-column model MUST
   declare it (`'relation'`); `descriptor_completeness_tripwire` enforces that,
   because a relation without a parser silently refuses every section-id list.
7. Flat display string in grids? Declare `flatValue` (`'string'` |
   `'datalist'`).
8. Emit-time particularity? Declare `emitHook` (an `EmitHookId`) and add its
   implementation to `components/emit_hooks.ts` EMIT_HOOKS — in the model's
   own folder (`component_<model>/emit.ts`) or its engine home (the media
   family shares `core/media/component_emit.ts`). A hook either owns the
   whole emission (`emitItem`) or adjusts the generic literal path
   (`transformValue` / `decorateItem`). Models that ALWAYS pair with fixed
   dataframe frames declare `fixedDataframeTipos` (component_iri's dd560).
9. (Optional) drop a `samples/` reference set alongside it.

**Engine side (STILL SCATTERED — check each; this is the honest part):**

10. `resolve/relation_list.ts` — its per-model value branches still read
    hardcoded sets (rewire to `getFlatValueFamily` pending, owned by the
    cache-lifecycle workstream); a new model may render `null` cells until
    added.
11. `resolve/section_elements_context.ts` `DEFAULT_EXCLUDE` — media/system
    models excluded from the simple-context panel (PHP parity list).
12. `ai/rag/config.ts` `DEFAULT_EMBEDDABLE_MODELS` — opt the model in if its
    values should embed.
13. A model whose PHP search is a dedicated pipeline (children/index/
    external/_tm twins) needs its builder ported under `search/` or
    `relations/` — `search: {status:'unported', reason}` keeps the throw
    honest meanwhile.
14. `section/read.ts` emitDdoData keeps exactly ONE per-tipo quirk inline
    (the dd546 activity-'where' transform — a per-TIPO rule has no
    per-MODEL descriptor home); everything per-model dispatches through
    `emitHook`.

The load-time coverage check in `registry.ts` fails at boot if a descriptor is
malformed or an alias dangles. Registry/table equivalence is pinned by
`test/unit/component_registry.test.ts`; facet completeness by
`test/unit/descriptor_completeness_tripwire.test.ts`.
