# WC-2026-08-17-list-row-is-indexable — a thesaurus list row answers its own selectability

- **Date:** 2026-08-17.
- **Scope:** `src/core/section/read.ts` (the `sections` envelope entries),
  `src/core/resolve/component_data.ts` (`SectionsEnvelope.entries`),
  `client/dedalo/core/section/js/view_thesaurus_list_section.js`.
- **Related:** the thesaurus picker (`client/dedalo/core/area_thesaurus/js/thesaurus_picker.js`,
  `term_selectability`), the write-path twin in `src/core/relations/save.ts`
  (gate 3, SELECTABILITY).

## Shape before (PHP)

The list envelope entry was `{section_tipo, section_id, paginated_key}` and
nothing else. PHP's thesaurus list did not need more: its id-column arrow was
gated on the `initiator` URL variable
(`core/section/js/view_thesaurus_list_section.js:607`,
`self.initiator.indexOf('tool_indexation_')!==-1`), so an indexation-opened list
drew a link button on EVERY row and published `link_term_<linker_id>`
unconditionally. PHP's write path had no selectability check to disagree with it.

## Shape after (TS)

`readSection` stamps `is_indexable` (boolean) on each envelope entry, in `list`
and `list_thesaurus` mode, **only** when the section's
`section_map.thesaurus.is_indexable` names a component tipo. The value comes from
`ts_object/node_repository.fetchNodeInfo` — the same resolver, the same batched
query, that already answers for tree nodes.

Absent ≠ `false`. A section that declares no `is_indexable` component has no
selectable-term contract at all (the same scope the write path's
`targetDeclaresSelectability` uses), so its rows carry no key.

## Reason

The TS picker refuses to offer an affordance it cannot justify: `term_selectability`
reads `root_terms_selectable` (area read) or the node's own `is_indexable`, and a
LIST row was neither — UNKNOWN, so no control. A search result is the primary way
into a large thesaurus, so that gap made the whole surface unpickable.

Restoring PHP's ungated arrow was NOT the fix: `relations/save.ts` gate 3
re-asks the term's own answer on write, so an ungated arrow would offer a link
the server then refuses. One fact, one resolver, both doors — the affordance now
follows the same answer the write path enforces.

**Operational note.** In an install where the `is_indexable` component was never
populated (dedalo7_mht: zero of 357 `rsc197` records carry `rsc1028`), every row
answers `false` and no arrow renders. That is data, not a defect in this seam:
PHP allowed the pick because it never asked. Flag the terms, or drop
`is_indexable` from the section_map, to make the surface pickable again.

## Gate reconciliation

`test/unit/thesaurus_list_row_selectability.test.ts` — mints two scratch `rsc197`
rows (one flagged, one not), asserts per-row `true`/`false` in both `list` and
`list_thesaurus`, and asserts the key is ABSENT for `test3` (a thesaurus scope
with no `is_indexable` component). No re-harvest: the frozen fixture store holds
PHP responses, and this is an ADDITIVE key on the TS side — the parity gates
compare the fields PHP emits, which are unchanged.
