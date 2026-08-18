# WC-2026-08-17-list-row-selectability-declared — "no selectability contract" is an ANSWER, not silence

- **Date:** 2026-08-17.
- **Scope:** `src/core/section/read.ts` (the `sections` envelope entries),
  `src/core/resolve/component_data.ts` (`SectionsEnvelope.entries`),
  `client/dedalo/core/area_thesaurus/js/thesaurus_picker.js` (`term_selectability`),
  `client/dedalo/core/section/js/view_thesaurus_list_section.js`,
  `src/core/ontology/section_map.ts` (`declaresTermSelectability`, new export),
  `src/core/relations/save.ts` (gate 3 delegates instead of re-deriving).
- **Supersedes the ABSENT-key half of:** `WC-2026-08-17-list-row-is-indexable`
  (the `is_indexable` key itself is unchanged).

## Shape before

A section that declares no `section_map.thesaurus.is_indexable` component got no
key on its envelope entries at all — the read stayed silent. The client's
`term_selectability` has three outcomes (`true` / `false` / `null` = unknown) and
silence landed on `null`, so `render_term_pick_control` returned no control:

```
entries: [ {section_tipo:'rsc197', section_id:4, paginated_key:0} ]
```

## Shape after

The read STATES the no-contract case, once per row:

```
entries: [ {section_tipo:'rsc197', section_id:4, paginated_key:0,
            selectability_declared:false} ]
```

`selectability_declared` is emitted **only** when the section declares no
contract, and never carries `true`. It is mutually exclusive with `is_indexable`:
a declaring section answers per row through that key and carries no
`selectability_declared`. The client maps `selectability_declared:false` →
selectable.

## Reason

The affordance and the write gate were answering the same question differently,
and each was internally defensible:

- `relations/save.ts` gate 3 **exempts** a target section with no selectability
  contract — nothing to re-ask, the pick is authorized.
- `term_selectability` read the same absence as UNKNOWN and refused the arrow,
  under the (correct) rule that an affordance is never offered on a guess.

So a People row (`rsc197` on dedalo7_mht, reached through tool_indexation's
people picker) rendered with no link arrow while the write door stood open for
exactly that pick. The picker's own header states the invariant this broke:
"Two call sites, one answer."

The rule survives intact, in both directions: an affordance must not be offered
on a guess, and must not be **withheld** on one either. `null` now means only
what it should — a section that DOES declare the contract failed to answer for
this row.

The predicate moved to `ontology/section_map.declaresTermSelectability` and the
private copy in `save.ts` is gone. Two copies of a gate predicate is the
mechanism by which the two doors drifted; one function is the fix, not a tidy-up.

## Gate reconciliation

`test/unit/thesaurus_list_row_selectability.test.ts` — extended with: the
no-contract section (`test3`) carries `selectability_declared:false` on every
row and still no `is_indexable`; a declaring section (`rsc197` in the test DB)
carries `is_indexable` per row and never the exemption; and the delegation
itself, so gate 3 cannot grow a second copy of the predicate. Verified red by
mutation on the read stamp.

No re-harvest: the frozen fixture store holds PHP responses and this is an
ADDITIVE key on the TS side — the parity gates compare the fields PHP emits,
which are unchanged.
