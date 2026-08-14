# WC-2026-08-14-model-section-registry-branch — the registry branch actually runs, diverging from the frozen tree on purpose

- **Date:** 2026-08-14 (landed with `src/core/ontology/model_section.ts`; same change as
  `WC-2026-08-14-relation-model-target-in-sqo`).
- **Decision:** — (oracle-of-record choice: v6, not the frozen v7 PHP. Canon:
  `engineering/RELATIONS_SPEC.md` §6.7; harvest rules `engineering/ORACLE_HARVEST.md`.)

## The divergence in one line

The frozen v7 PHP **cannot** reach its own registry answer, so it always returns the
`tld + '2'` naming rule. TS follows v6 and consults the registry first. Where the two
disagree, TS is deliberately not byte-compatible with the frozen tree.

## Shape before (frozen v7 PHP)

`core/component_relation_model/class.component_relation_model.php` documents the intended
three-stage lookup (find the registry record whose `hierarchy53` equals the caller's
section, read its `hierarchy58`, else fall back to `prefix.'2'`) and implements stage 2 as:

```php
$component = component_common::get_instance($model, DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO, …);
$target_section_tipo = $component->get_valor();
```

**`get_valor()` does not exist in the frozen tree.** It was deleted from `component_common`
(v6 `class.component_common.php:1759`; the only survivor in v7 is the unrelated
`diffusion/migration/v1_get_valor.php` free function). The call therefore falls into
`common::__call`'s accessor bridge, which maps `get_x` to `GetAccessor('x')`, finds no
property named `valor`, and returns **`false`** — no exception, no log line. `false` is
`empty()`, so control drops straight into the final fallback:

```php
// final fallback (calculated from current prefix)
// (!) This is a best-effort guess. Sections whose model section does not
// follow the '<prefix>2' naming convention will silently get the wrong target.
```

Net frozen-v7 behaviour: **stage 1-2 are dead code and every caller gets `tld + '2'`**,
including the ones whose registry record says otherwise.

## Shape after (TS)

`getModelSectionForSection` (`src/core/ontology/model_section.ts`) tries the registry
FIRST and the naming rule only on a miss, validating both:

1. the registry record whose `hierarchy53` EQUALS the caller's section tipo (exact string
   equality; no active-flag filter; lowest `section_id` wins on a duplicate, matching
   `hierarchy::get_hierarchy_section` v6 `:679-713` `reset()`) yields its `hierarchy58`;
   absent or empty → fall through;
2. `tld(caller) + '2'`;
3. every candidate must resolve to ontology model `section`
   (`WC-2026-08-14-non-section-target-refused`).

Both registries of the family are read, derived from the ontology rather than hard-coded:
every section whose real tipo is `hierarchy1` — `hierarchy1` itself on
`matrix_hierarchy_main` and `ontology35` (a virtual section of it) on
`matrix_ontology_main`.

## Reason

The pairing is **operator data**, and an operator is entitled to break a naming convention.
On `dedalo_v7_mht` the registry row for the `WW` hierarchy (`hierarchy1/250`) pairs
`hierarchy53 = mht72` with `hierarchy58 = ww2`, while the naming rule answers `mht2` — a
`diffusion_element`. No string arithmetic can produce `ww2` from `mht72`; only the registry
knows. Shipping the frozen tree's behaviour would mean freezing a defect into the engine
that replaced it, and would make the registry columns decorative — while
`ontology/hierarchy_state.ts` is being taught, in the same change, to stop overwriting them.

The frozen tree is the parity oracle for the wire, not for a rule it demonstrably fails to
execute. Where the frozen engine's behaviour is the accident of a deleted method, **v6 is
the oracle of record**.

## Adjudicability — read this before "fixing" a parity red

The frozen store holds exactly ONE `component_relation_model` target datapoint:
`hierarchy27` in `cult1` → `cult2`
(`test/parity/fixtures/oracle_harvest/section_context_extras_differential.json`,
interaction `b27806c2765aefddb4894cda`). `cult1` is a caller where the registry pairing and
the naming rule give the SAME answer, so the fixture is green under either rule and
**cannot adjudicate this divergence**. A re-harvest is impossible by definition
(`engineering/ORACLE_HARVEST.md`), so no future fixture can either.

Consequences to hold on to:

1. On this install the registry branch changes NOTHING observable for
   `component_relation_model`: the one row where registry and naming rule disagree
   (`mht72 → ww2`) hosts no such component. It is correctness insurance, and it is
   observable through the explicit `{"source":"section_model"}` sqo.
2. Because live data cannot exercise the hit path, it must be gated against **scratch
   registry rows** — a test that only asserts live callers is asserting the fallback.
3. `ontology35`'s half yields nothing today (all 204 rows lack `hierarchy58`). It is still
   read, and its absence is reported by the hierarchy `targets` check, never assumed.

## Gate reconciliation

- `test/unit/model_section_native.test.ts` — scratch registry rows in BOTH registries: a
  `hierarchy1` hit, an `ontology35` hit, the fall-through when `hierarchy58` is empty, the
  naming-rule fallback, and the assertion that the registry family is DERIVED
  (`getSectionRealTipo === 'hierarchy1'`) so a third registry needs no code edit. DB writes
  on scratch surfaces only, cleaned up after.
- `test/parity/section_context_extras_differential.test.ts` — green under either rule for
  `cult1`; it pins the `target_sections` value, not the path taken to it. Do NOT read its
  green as evidence for or against this entry.
- **No re-harvest** (impossible; the store is frozen and the divergence is unobservable in
  it).
