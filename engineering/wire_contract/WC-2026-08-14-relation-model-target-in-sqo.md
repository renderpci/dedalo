# WC-2026-08-14-relation-model-target-in-sqo — a caller-derived target is carried IN the sqo, not in a private field

- **Date:** 2026-08-14 (plan `the-component-relation-model-hierarchy27`; landed with
  `src/core/ontology/model_section.ts`, `relations/request_config/{build,target_sources,explicit}.ts`,
  `relations/datalist.ts`, `components/{types.ts,component_relation_model/descriptor.ts}`).
- **Decision:** — (DEC-12 gates shipped with it, listed under *Gate reconciliation*.
  Canon: `engineering/RELATIONS_SPEC.md` §6.7.)

## The seam

`component_relation_model` is the one relation model whose target section cannot be
written into its own node. `hierarchy27` ("Tipología") is defined once on `hierarchy20`
and inherited by its 54 virtual sections, and the section whose records it must offer
differs per caller — `es1 → es2`, `fr1 → fr2`, `mht72 → ww2`. Its ontology ships
`sqo.section_tipo: []` plus an `_info` note admitting the value "is calculated in class".

## Shape before (PHP)

PHP computed the answer in the component class (v6 `class.component_relation_model.php:115-177`)
and kept it in a private field, **re-derived per consumer** — the datalist, the structure
context and the import target each asked the class again. The request config was never
told. On the wire (frozen fixture `section_context_extras_differential.json`, interaction
`b27806c2765aefddb4894cda`, `hierarchy27` in `cult1`, mode `list`):

```json
{
  "typo": "ddo", "tipo": "hierarchy27", "section_tipo": "cult1",
  "model": "component_relation_model",
  "properties": { "source": { "request_config": [ { "sqo": { "section_tipo": [] }, … } ] } },
  "target_sections": [ { "tipo": "cult2", "label": "Cultura [m]" } ]
}
```

The resolved target reaches the client ONLY as `target_sections`; the sqo stays `[]` (the
`properties` block is the raw ontology echo). PHP also emits **no `request_config` key at
all** on a relation-model element — `component_relation_model_json` passes
`add_request_config = false`.

## Shape after (TS)

The rule is applied at ONE seam, `buildRequestConfigForElement`
(`relations/request_config/build.ts`), and its result is **written into the built config**:
the main item's `sqo.section_tipo`, enriched by `buildSqoSectionTipoDdos` exactly like any
other resolved target, so every consumer reads it from the same place.

```json
"sqo": { "section_tipo": [ {
    "typo": "ddo", "tipo": "cult2", "model": "section",
    "permissions": <caller's grant>, "label": "<section label>",
    "buttons": [ <button_new / button_delete, above read level> ],
    "color": "<properties.color ?? #b9b9b9>", "matrix_table": "matrix_hierarchy" } ] }
```

(the standard `buildSqoSectionTipoDdos` enrichment — identical to what every other
resolved sqo target carries, which is the point: nothing downstream needs a special case.)

`target_sections` is unchanged in shape and now carries the same answer for every caller
(before this change it was `[]` for all 54 of them — the sqo was the only source it had).
Downstream, the `edit` payload gains the `datalist` it never had, and the `list`/`tm`
column resolves its label instead of rendering blank.

Four properties of the seam are part of the contract:

- **A DECLARED sqo WINS.** The model rule is a DEFAULT that fills silence. "Declared"
  means the node's own `source.request_config` named a `section_tipo` that RESOLVED
  something; an explicit `{"source":"section","value":[…]}` is left untouched. This is a
  deliberate divergence: PHP's class override bypassed the sqo unconditionally.
- **The IMPLICIT walk's pick does NOT count as declared, and loses.**
  `component_relation_model` is absent from `EXPLICIT_CONFIG_REQUIRED_MODELS`, so a node
  with no `source.request_config` takes the implicit branch, whose relations walk picks
  the first section-model entry — for `hierarchy27` that is `hierarchy20`, the raw
  69,148-row thesaurus template. That entry is the component's *belongs-to* ontology
  link, not a statement about where its options come from, so the model default
  overrides it (`relations/request_config/implicit.ts`, `applyModelDefaultTarget`).
- **An EMPTY default is still the model's answer.** When the model owns the target and
  cannot resolve one (e.g. `ich145`: no registry row and the `<tld>2` fallback `ich2` is
  a `section_group`), the result is NO target — the walk's pick is discarded rather than
  kept as a fallback, and the sqo-without-`section_tipo` caller-section fallback does not
  apply either. Anything else would reopen the silent-wrong-target hole this closes. The
  resolver has already warned; nothing is emitted twice.
- **A config with no items stays item-less.** There is no main item to write a target
  into, and one is not synthesized.

The default is resolved ONCE, before either builder runs, and threaded in as
`RequestConfigContext.modelDefaultTargets` — not stamped onto the finished config. That
matters for the `show` ddo_map: `section_tipo: 'self'` resolves to the same
`targetTipos`, so `hierarchy27` in `es1` emits "read `hierarchy25` on **es2**". Stamping
the sqo afterwards would leave every `self` ddo pointing at the caller's own section.

## Reason

PHP could afford a private field because every consumer went back through the component
class. In TS the consumers are independent modules — `relations/datalist.ts:236`,
`resolve/structure_context.ts:1009,1302`, `getElementTargetSectionTipos` (and through it
`tools/import_conform.ts:821`, `resolve/section_elements_context.ts:258`,
`relations/models/relation_index.ts:84`) and `ai/mcp/tools/discovery.ts:245` — and they
share exactly one thing: the parsed request config. Putting the answer anywhere else means
N re-derivations that can disagree; putting it in the sqo means the rule is stated once and
every surface inherits it, at the cost of these bytes.

## What a consumer must expect

1. `request_config[].sqo.section_tipo` on a `component_relation_model` element is no longer
   an empty array. A client or script that treated it as "always empty" now reads enriched
   section ddos (`typo`/`tipo`/`model`/`permissions`/`label`/`buttons`/`color`/`matrix_table`).
2. `target_sections` becomes non-empty where it was `[]` — on 55 of the 57 sections
   hosting this model, measured on `dedalo_v7_mht`. The client's select renders options;
   the CSV importer stops refusing the column ("invalid target_section_tipo").
3. The emitted `request_config` key itself on this model's elements is a SEPARATE
   pre-existing divergence (PHP suppresses it), not introduced here.

## Gate reconciliation

- `test/parity/section_context_extras_differential.test.ts` — the `hierarchy27` context
  entry is asserted, **field-scoped on `target_sections`**, not as a whole-object compare:
  the emitted `request_config` key is the pre-existing divergence above and would red an
  unrelated seam. The PHP answer (`cult1 → cult2`) is already frozen in the fixture; the
  assertion reds against the pre-change behaviour (`[]`) and greens with the fix.
- `test/parity/relation_corpus_config.test.ts` — a `hierarchy27`-in-`es1` case
  (edit + list), plus a config-less relation-model case asserting the model twin and NOT
  `hierarchy20`.
- `test/unit/model_section_native.test.ts`, `test/unit/datalist_cache_key_native.test.ts`,
  `test/unit/descriptor_completeness_tripwire.test.ts` (facet ↔ implementation pairing).
- **No re-harvest** (impossible by definition — `engineering/ORACLE_HARVEST.md`): the
  frozen store's own bytes are what the parity gate asserts against, and the gate compares
  the field PHP did emit.
