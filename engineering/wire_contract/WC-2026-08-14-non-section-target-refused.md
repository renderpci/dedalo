# WC-2026-08-14-non-section-target-refused — a target candidate that is not a section is REFUSED, not forwarded

- **Date:** 2026-08-14 (landed with `src/core/ontology/model_section.ts`; same change as
  `WC-2026-08-14-relation-model-target-in-sqo`).
- **Decision:** — (CONVENTIONS §1: degraded, reported, defined. Canon:
  `engineering/RELATIONS_SPEC.md` §6.7, step 3 of the resolution rule.)

## Shape before (PHP)

The target of a `component_relation_model` was computed by string arithmetic and used
unchecked: registry pairing first, else `tld(owner) + '2'`
(v6 `class.component_relation_model.php:115-177`). Whatever came out was handed to the
list-of-values search as a section tipo. Nothing asked the ontology whether that tipo IS a
section.

On this install the arithmetic lands on a non-section four times:

| caller | candidate | its ontology model | hosts the model? |
|---|---|---|---|
| `hierarchy20` (the raw thesaurus template) | `hierarchy2` (fallback) | `component_number` | yes — `hierarchy27` is defined on it |
| `ich145` | `ich2` (fallback) | `section_group` | yes — a virtual section of `hierarchy20` |
| `mht134`, `mht140` | `mht2` (fallback; registry row carries no `hierarchy58`) | `diffusion_element` | no |
| `mht160` | `mht2` (registry `hierarchy58`) | `diffusion_element` | no |

A search over a section that does not exist resolves nothing, so the two live hosts
rendered an empty select and an empty list column — silently, with the bad tipo travelling
as far as the emitted `target_sections` and the import's accepted-target list on the way.
The three registry rows are reachable through the explicit `section_model` sqo source, and
are the data defects the pairing invariant now reports rather than overwrites.

## Shape after (TS)

`getModelSectionForSection` VALIDATES **every** candidate — the registry answer exactly as
strictly as the naming-rule fallback — and keeps it only if `getModelByTipo(candidate) === 'section'`.
A candidate equal to the registry row's own `hierarchy53` is refused as well (it would aim
the option list at the TERMS section: `es1` alone is 69,148 records, and `getDatalist`
reads every option record).

When no candidate survives, the resolver returns `[]` and emits ONE `console.warn` naming
the component, the caller section, and every rejected candidate **with the model it
resolved to**. Nothing is thrown; the element keeps the pre-existing empty-target shape
(`target_sections: []`, `sqo.section_tipo: []`, no datalist), and the seam adds no second
warning on top of the resolver's.

## Reason

Validation cannot be deferred to the consumer, and there is no consumer that could do it:
`resolve/structure_context.ts` emits `target_sections` to the client unfiltered, and on the
write path `tools/import_conform.ts`'s `SAFE_TIPO` regex is the only thing between a target
tipo and an import — a regex checks the SHAPE of a tipo, never that it names a section. The
resolver is the single place that knows all the candidates and can name the rejected ones.

The visible behaviour barely moves (these callers render nothing today and render nothing
after), but the divergence is real: PHP forwarded a wrong answer, TS refuses it. The
replacement of a silent zero with a loud, greppable line is the point — three of the four
cases are registry DATA defects (`hierarchy1/251`, `/252` carry no `hierarchy58`; `/253`
points at a `diffusion_element`) that nothing surfaced before. `ontology/hierarchy_state.ts`
now reports them in the maintenance widget's `targets` check as well, instead of
"repairing" them by overwriting.

## What a consumer must expect

1. Opening the raw `hierarchy20` section (or `ich145`) produces one warn line per build of
   that element, where the server was silent. The request still returns 200.
2. No tipo that is not a section can reach `target_sections` or the import's target list
   from this model. A caller that hard-coded one of the four bad tipos (nothing does) would
   stop seeing it.
3. The warn is per resolution, not per request — a wide list read of such a section emits
   it once per element build, so it is a real signal in the log, not a one-off.

## Gate reconciliation

- `test/unit/model_section_native.test.ts` — the refusals, each asserted separately:
  a non-section registry answer, a non-section fallback, `hierarchy58 == hierarchy53`, and
  "no answer at all"; plus that a failing candidate does NOT stop the walk (a non-section
  registry answer still lets the fallback win when the fallback is a section).
- **No fixture is affected and no re-harvest is possible** (`engineering/ORACLE_HARVEST.md`):
  the frozen store's only `component_relation_model` target datapoint is `hierarchy27` in
  `cult1`, a caller whose candidate IS a section. The four refusing callers appear in the
  store only as ddo entries inside a `show`/`choose` ddo_map, which carry no target.
