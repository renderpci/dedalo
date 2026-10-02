# WC-2026-10-02-relation-children-write-through — a children save writes each child's parent link through the normal save, removes every link the read counts, carries the bulk id, and a derived field is never re-saved or imported

- **Date:** 2026-10-02.
- **Decision:** DEC-12 (each rule lands with its gate). User decisions 2026-09-27: a CSV
  children column is REFUSED (import the child's parent column); a per-child remove is
  BY LOCATOR. Code: `src/core/relations/children_write.ts` (entered from
  `saveComponentData`), the `derived` descriptor facet (`src/core/components/types.ts`,
  `registry.ts isDerivedModel`) and its consumers (`tools/tool_update_cache/server/index.ts`,
  `tools/tool_import_dedalo_csv/server/index.ts` + the `executeCsvImport` backstop),
  the client subclass `client/dedalo/core/component_relation_children/js/component_relation_children.js`,
  the sweep `scripts/relation_children_orphan_sweep.ts`
  (`src/core/relations/children_orphan_sweep.ts`).

## Shape before

**PHP** (`class.component_relation_children.php` `set_data` :230, `update_parent` :392):
the component owns no data; `set_data` diff-syncs the computed children against the new
list and calls `make_me_your_parent` / `remove_me_as_your_parent` on each child's
`component_relation_parent`. The removal builds a `dd47` locator and aborts on any other
type, while the inverse search that DEFINES the children matches on
`from_component_tipo` alone — a parent link stored with another type (`dd151`) was listed
as a child and could never be removed. The per-child saves dropped the bulk process id.

**TS until this entry:** the generic save engine stored the client's locators under the
children tipo in the HOST record's own `relation` column (read by no edit, list or search
path) and answered `ok:true`; no child was written. The echo (a read) served the unchanged
computed children: linking a child or clearing the field silently did nothing.
`tool_update_cache` re-saved whatever bytes sat under the tipo; a CSV column mapped to it
in replace mode was accepted.

## Shape after (TS)

1. A save addressed to a `component_relation_children` is a SET OF `saveComponentData`
   calls on each affected child — the child's `component_relation_parent` (and its
   sibling-order `component_number`, paired by id_key) — in ONE transaction under the
   host's tree node lock. Each child gets the row lock, a Time Machine row carrying the
   caller's `bulkProcessId` (so `bulk_revert` restores it), stamps, observers and the
   chokepoint obligations. The host's own column is never written.
2. Actions: `set_data` (array or null), `clear`, `insert`, `remove` **by locator**
   (`{action:'remove', id:null, value:{section_tipo, section_id}}` — the computed entries
   carry no item id; an id-only remove refuses), `add_new_element` (creates the child,
   answers `created_section_id`). `sort_data`, `sort_by_column`, `update` refuse with
   `request.invalid_data` — the children order is each child's own order value.
3. A joining child gets the canonical `dd47` link and, when the section declares
   `section_map.thesaurus.order`, its initial order (descriptor-children count + 1).
   A child whose section lacks the paired parent component (or lives in another table)
   refuses (`request.invalid_data`); a link that would close a cycle refuses
   (`tree.cycle`); a missing record and the host itself stay silent no-ops (PHP), so
   `component_portal.link_record` still sees an unchanged total and returns false.
4. A leaving child loses EVERY link of its parent component that targets the host,
   whatever its `type` — the read's own predicate (**the divergence from PHP**); a
   PHP-era link without an item id is removed by a `set_data` of the links that stay.
5. Every child is authorized BEFORE any is written, as the human save door asks the
   child's parent component (`authorizeRecordAccess`, door `save`: the dd128-aware pair +
   the write scope): `perm.denied` / `perm.out_of_scope` on ONE child refuses the whole
   save, nothing written.
6. The `derived` facet (component_relation_children, component_relation_index,
   component_inverse, component_external; component_info audited out — its stored mirrors
   ARE read): `update_cache` skips such a component server-side and reports it
   (`derived_skipped`); the CSV import refuses a column on it in ANY mode, at the
   validate/import door (the whole file, before the dd800 record) and at the executor
   (`request.invalid_data`); `tool_propagate_component_data` refuses it in every action
   (`request.invalid_options`, before the search and the dd800 record) — its region is the
   stored key, i.e. the leftover bytes, and a `set_data` of `region ± value` would unlink
   every real child missing from it.
7. Client: `component_relation_children` is a `component_portal` SUBCLASS (no longer the
   same constructor): `get_unlink_changed_data` sends the remove by locator,
   `reorderable = false` (no drag handle / drag source), `sort_data` sends nothing. The
   portal's own unlink is unchanged (`get_unlink_changed_data` → remove by item id).

## Reason

The client treats the save echo as the component's new value: an echo that contradicts
the request the save just acknowledged is silent data loss from the curator's point of
view, and a link no door can remove is an integrity defect. A child write is a write to
the child: it must be authorized, audited and revertable as one.

## Gate reconciliation

No parity fixture records a save on a `component_relation_children` tipo, so no frozen
gate changes and no re-harvest is needed. Gates:
`test/unit/relation_children_write_through_native.test.ts` (every rule above; each write
case red with the `saveComponentData` branch removed, every new leg mutation-checked),
`test/unit/descriptor_completeness_tripwire.test.ts` (the `derived` set equals the
computed-value models minus the audited-out), client half
`test_component_relation_children` CHANGE DATA (builds its own parent and child records).
Leftover bytes from the old no-op save: `bun scripts/relation_children_orphan_sweep.ts`
(dry-run default, `--apply` removes them through the write chokepoint).
