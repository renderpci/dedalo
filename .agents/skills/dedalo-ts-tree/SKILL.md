---
name: dedalo-ts-tree
description: The Dédalo v7 thesaurus/ontology hierarchical tree — server node builder (ts_object, ts_node_repository, ts_term_resolver), tree mutations API (dd_ts_api with transactions, node locks and cycle guard), relation parent/children model, and the client tree widget (ts_object.js, set_open state machine, instance lifecycle, view files). Use when modifying core/ts_object/, core/area_thesaurus/, core/area_ontology/, core/api/v1/common/class.dd_ts_api.php, core/component_relation_parent/, core/component_relation_children/, or debugging tree expand/search/move/indexation behavior.
---

# Dédalo v7 thesaurus / ontology tree

Both areas share ONE machinery: `area_ontology` is an alias of `area_thesaurus` (JS: literally `export const area_ontology = area_thesaurus`; differences are runtime flags `is_ontology`/`area_model`). Every tree row is a section rendered as a `ts_object` node. Storage model (the Dédalo way — never change): the CHILD stores a parent locator in its `relation` column under the `component_relation_parent` tipo; children are ALWAYS computed by searching who points at the parent (`component_relation_children` has `use_db_data=false`).

## Data model and key tipos

- Section thesaurus config = `section_map->thesaurus` (from ontology `section_list_thesaurus` properties): `{term: hierarchy25, model: hierarchy27, order: hierarchy2, parent: hierarchy36, is_indexable: hierarchy24, is_descriptor: hierarchy23}` (canonical hierarchy tipos; test fixtures: `ts1` thesaurus, `test3`/`test71` parent / `test201` children).
- Parent locator: `{type: dd47 (DEDALO_RELATION_TYPE_PARENT_TIPO), section_tipo, section_id, from_component_tipo}` in `relation->{parent_tipo}`. `is_descriptor`/`is_indexable` are locators to the si_no section (`dd64`): first locator `section_id` 1=yes, 2=no. Order is per-parent-context dataframe items in the `number` column.
- Node identity client+server: `ts_id = section_tipo_section_id`, `ts_parent` likewise ('root' for area-attached roots).
- Tree row UI elements come from ontology `ddo_map` (`section_list_thesaurus->properties->show->ddo_map`): `{tipo, type}` where type ∈ term|icon|img|link_children (+ link_children_model in model view). **Icons including the U indexations button always have `type:'icon'`** — see Gotchas.

## Server flow and mutation safety

API = `dd_ts_api` (`get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`). Response shape `{result, msg, errors}` — `errors[]` may carry distinct codes (`'cycle'`).

- ALL mutations run inside `DBi::transaction(callable)` (real BEGIN at depth 1, SAVEPOINT `dd_tx_{n}` nesting, never commits an INERROR or externally-opened block) holding `matrix_db_manager::acquire_node_lock(st, si)` on every affected parent (xact-scoped advisory lock; REFUSED outside a transaction; lock multiple nodes in deterministic key order to avoid deadlock).
- `add_child` validates EVERYTHING (section_map props, parent tipo resolution) BEFORE `create_record()` — never reintroduce the orphan window. On rollback, clear `component_instances_cache` + `section_record_instances_cache` (worker staleness).
- Cycle guard: `component_relation_parent::is_ancestor()` — walks ancestors of the prospective PARENT (depth-bound, cheap) — enforced in `add_parent()` (before `set_child_order`, which writes) AND pre-validated in `update_parent_data` for the clean client error. Sibling order is count-then-write, race-free ONLY under the parent lock (`set_child_order` logs a warning when called outside a transaction).
- Cache invalidation on mutation success: `ts_object::invalidate_node()` (term cache prefix-evict + `resolved_child_cache` wipe). `ts_object::clear()` + `hierarchy::clear()` are registered in `worker/class.cache_manager.php`.

## Batching (the N+1 killers) — fallback contract

`core/ts_object/class.ts_node_repository.php` (explicit `require_once` from class.ts_object.php — NOT autoloadable, same for `ts_term_resolver`): `fetch_node_info()` (order + is_indexable, one query per section_tipo group) and `batch_descriptor_flags()`. **Contract: any resolution failure returns null and callers MUST run the legacy component path** (`parse_child_data`, `has_children_of_type` both do). Raw reads replicate component semantics exactly — order values go through `format_number_value()` mirroring `component_number::set_format_form_type` (default cast is FLOAT; `type:'int'` → int). Output parity incl. types is gated by `test/server/ts_object/ts_node_repository_Test.php` — never ship repository changes without it green. Pagination totals: `component_relation_children::count_children()` (SQO `full_count` + `search->count()`); `get_data_paginated` respects a caller-provided `pagination->total`.

`ts_term_resolver` owns `get_term_by_locator`/`get_term_dato_by_locator` + the term cache; `ts_object` keeps static delegates (diffusion/export/portal call them — signatures frozen).

## Client architecture (no framework, ES modules)

Files in `core/ts_object/js/`: `ts_object.js` (instance class, API, state, search), `view_default_edit_ts_object.js` (render, render_children, render_child, render_wrapper, render_link_children, render_ts_pagination), `render_ts_line.js` (row elements + render_term/render_ontology_term), `render_ts_id_column.js` (+render_order_form), `render_ts_dialogs.js` (delete dialog), `drag_and_drop.js`. Instance key = `key_instances_builder` over `['section_tipo','section_id','children_tipo','target_section_tipo','thesaurus_mode','ts_parent']` — `ts_parent` is DELIBERATELY a key part (one instance = one DOM node; same term in two contexts must not steal nodes).

Invariants (each backed by a fixed bug):
1. **`set_open(is_open, {persist, force_reload})` is the ONLY expand/collapse entry; `sync_open_dom()` the only place `open`/`hide` classes change.** `is_open` flips synchronously FIRST. `render()` never resets it; a full re-render restores via fire-and-forget `set_open(true,{persist:false}).catch(...)`. No synthetic mousedown events.
2. UI state persists in the IndexedDB `status` table via `data_manager` (expand per `self.id`, `show_models`, search panel) — never localStorage.
3. `get_children_data` dedups in-flight requests per signature (`children_request`/`children_request_signature`); error policy: data layer THROWS, view layer `console.error` + return false, user-triggered failures publish `notification`.
4. `render_children` attaches via DocumentFragments SYNCHRONOUSLY before resolving — search branch opening relies on it. With `clean_children_container:true` it first destroys registered child instances (`ar_instances` where model==='ts_object'). Collapse never destroys (instant re-open).
5. `render_child` registers children in `self.ar_instances` (standard `common.destroy` cascade), passes `mode: self.mode` (search inheritance) and ALWAYS refreshes `caller` on cache hits. Roots register in the area's `ar_instances` (area rebuild reclaims the whole tree).
6. `rekey()` after `ts_parent` changes (`swap_parent`): delete_instance(old) → rebuild key → add_instance, sync `node.dataset.id`, migrate persisted status, move between parents' `ar_instances`.
7. `parse_search_result` = orchestrator over `build_search_instances` (ONLY roots instantiated/rendered; non-roots are plain data — their wrappers are created by the parent's `render_child`, so containers exist by construction), `hierarchize_search_instances` (pure data; orphans REPORTED, never silently skipped), `open_search_branches` (explicit top-down recursion, resolves live instances by key AFTER each parent renders, MERGES search children into existing children_data), `hilite_search_results`.
8. `delete_term` destroys self (+persisted status); callers must capture `self.caller` BEFORE calling it (destroy nulls it).

## Gotchas

- **ts-line element dispatch is by `element_case`, NOT raw type**: `component_relation_index` elements (U button) have ddo_map `type:'icon'` and must dispatch by MODEL (`render_ts_line.js`). Matching by type silently routes them to the default `show_component_in_ts_object` path (component opens with view 'line' — was a real regression). The U click runs `ts_object.show_indexations` → `dd_grid` view `'indexation'` into `indexations_container`; the `show_data:'children'` variant (⇣) loads children recursively first.
- **`self.indexations_container` is created AFTER `render_ts_line` runs** (get_content_data order: id_column → ts_line → data_container → indexations_container → nd_container). Read instance pointers at CLICK time inside handlers, never capture them at render time.
- `get_ar_elements` falls back to the real section when the virtual section has no `section_list_thesaurus` properties.
- PHP `has_children_of_type` semantics: checks each child's own flag, FIRST locator only, `==` compare; empty children + `options->have_children` forced case must survive any refactor.
- `update_parent_data` source props are `new_parent_section_id/tipo` + `old_parent_section_id/tipo` (the docblock sample showing `parent_section_id` is stale).
- Search instances get `mode:'search'` (hides order form, skips local-db expand restore); children inherit parent mode through `render_child`.
- show_more pagination, add-child and duplicate handlers build pagination objects BY VALUE — never mutate `children_data.pagination`.

## Testing

`cd test/server && ../../vendor/bin/phpunit api/dd_ts_api_Test.php ts_object/ts_node_repository_Test.php components/component_relation_children_Test.php components/component_relation_parent_Test.php db/DBi_transaction_Test.php area/area_thesaurus_Test.php` (71 tests baseline green). `dd_ts_api_Test` covers move + cycle rejection + no-orphan + order idempotence against `ts1` (creates records, tearDown deletes). Parity tests sample the LIVE installation's biggest thesaurus (read-only). Known pre-existing failures (clean-tree verified, ignore): `ts_object_Test` 4 term-resolution tests; running ts_object_Test before component_relation_parent_Test pollutes `test_set_data`/`test_save_and_reload`. Client has no unit tests — verify manually: expand/reload restore, rapid double-click (one request), alt-click force reload, drag-drop onto own descendant (cycle error), search deep hits, U-button indexation grid toggle, Ctrl+M persistence.
