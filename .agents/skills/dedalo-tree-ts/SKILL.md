---
name: dedalo-tree-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the thesaurus/ontology TREE — the ts_object node builder, dd_ts_api (get_node_data/get_children_data/add_child/update_parent_data/save_order), tree search, the component_relation_parent machinery, and the shared transaction/advisory-lock primitives that every tree/ontology mutation is built on. Use when editing src/core/ts_object/**, src/core/relations/parent.ts, the dd_ts_api registration in src/core/api/dispatch.ts, the area_thesaurus/area_ontology serving in src/core/area/ (tree.ts boot payload + read.ts dispatch), or debugging why a tree node/child/expand/move/reorder resolves wrong vs the PHP oracle. Shared foundation with dedalo-ontology-ts. PHP oracle: v7_php_frozen/master_dedalo/core/ts_object, core/api/v1/common/class.dd_ts_api.php, core/area_thesaurus.
---

# Dédalo v7 tree (TypeScript rewrite)

Two areas — `area_thesaurus` (thesauri, main section `hierarchy1`) and `area_ontology` (the ontology source-of-truth, main section `ontology35`, a virtual section of hierarchy1) — render hierarchy sections as an interactive tree via ONE machinery. They differ only in which main section + main table they read; `dedalo-ontology-ts` owns the definitions the tree displays. PHP (`v7_php_frozen/master_dedalo`, read-only) is the ORACLE — verify differentially (`dedalo-parity-debugging`). Never silently narrow; throw + ledger in the file header.

**Storage inversion (never change):** the CHILD stores its parent locator (type `dd47`) in its `relation` column under the `component_relation_parent` tipo. Children are ALWAYS computed by searching who points at the parent; there are no stored children rows (`component_relation_children` `use_db_data=false`). Sibling order is a per-parent `id_key` dataframe on the child's order component_number (id_key = the parent-link locator's item id), NOT an array index.

**Node identity:** `ts_id = "${section_tipo}_${section_id}"`, `ts_parent` likewise, `'root'` for area-attached roots.

## Shared foundation (also used by dedalo-ontology-ts)
`src/core/db/postgres.ts`:
- `withTransaction(work)` — AsyncLocalStorage ambient transaction via a Proxy over the pool. Every `sql` call inside (directly or in any awaited helper) routes to ONE reserved connection, so in-tx reads see in-tx writes like PHP's per-request connection. A throw rolls back. Nesting JOINS the ambient tx (no nested BEGIN).
- `acquireNodeLock(sectionTipo, sectionId)` — `pg_advisory_xact_lock(hashtext('<tipo>_<id>'))`, BYTE-IDENTICAL to PHP `matrix_db_manager::acquire_node_lock` so PHP and TS mutually exclude on the same node during coexistence. Throws outside a tx.
- `src/core/ontology/tld.ts` (safeTld `/^[a-z]{2,}$/`, getTldFromTipo, getSectionIdFromTipo, mapTldToTargetSectionTipo=`tld+'0'`, buildTipo, isMainTipo), `ontology_tipos.ts` (all constants — dd47/dd48/dd96/dd64, HIERARCHY_*/ONTOLOGY_*), `cache_invalidation.ts` (zero-import registry hub; register your caches, ontology writes fan out to them).

## Architecture — `src/core/ts_object/`
```
term_resolver.ts   # getTermByLocator (lang-fallback via hierarchy main lang, cached) / getTermDataByLocator (raw, uncached) / invalidateNode
node_repository.ts # fetchNodeInfo (batched parent-aware order+is_indexable, ONE query/section_tipo group), batchDescriptorFlags, pickOrderValueForParent, formatNumberValue
ts_object.ts       # getArElements (section_list_thesaurus ddo_map, virtual→real fallback, model-mode transform) + buildNodeData (element loop) + parseChildData + getChildrenData + isIndexable + getPermissionsElement + getCountDataGroupBy + invalidateNode
search.ts          # searchThesaurus (SQO→hits→ancestor expansion) + getHierarchyTermsSqo
ts_api.ts          # the 5 dd_ts_api actions
src/core/relations/parent.ts  # component_relation_parent: getParentsRecursive/isAncestor + tx-half addParent/removeParent/setChildOrder/recalculateSiblingOrders/getChildrenOfType/sortChildren
```
`src/core/relations/children.ts` gained `countChildrenOrNull` (null when unresolvable ≠ 0), `getComponentOrderTipo`, `getChildrenOfType` (descriptor filter). `src/core/search/search_related.ts` `countInverseReferences({groupBy})` = PHP `count_data_group_by` (indexation icon). `dispatch.ts` registers `dd_ts_api` (5 thin wrappers, HTTP 200 even on `result:false`); the area_thesaurus/area_ontology serving lives in `src/core/area/` — `tree.ts` builds the boot payload (roots + typologies + terms_are_model; formerly resolve/area_hierarchy.ts, relocated by the area-module refactor, byte-parity preserved) and `read.ts` (`dispatchAreaRead`) applies the per-hierarchy perms filter (ontology+admin bypass) and the ts_search injection. This area wrapper is under active refactor — see the `dedalo-section-family-ts` / area skill for its shape; the tree CORE (`ts_object/*`, `search.ts`, `parent.ts`) is stable.

## Batch-first, no legacy fallback
PHP's ts_node_repository returns null→legacy per-component path; TS has no such path (both yield identical values), so: missing row → `{order:null, is_indexable:false}`; missing descriptor flag → null-skip; bad tipo grammar / SQL error → THROW. The one observable fallback (`count_children===null` → load-and-count) is preserved via `countChildrenOrNull`.

## PHP node-builder semantics (each an explicit test)
- Element types from `section_list_thesaurus.properties.show.ddo_map`: term | icon | link_children | link_children_model. model-mode: `model=true` drops link_children for hierarchy1/ontology35 roots, promotes link_children_model→link_children; `model=false` drops link_children_model.
- **Icon component data must be resolved in the ELEMENT LANG** before the empty-skip: `translatable ? DEDALO_DATA_LANG : 'lg-nolan'` (PHP `common::get_element_lang`). Getting this wrong leaks icons (e.g. an `OB` icon on a non-translatable text_area that is empty in its element lang).
- icon `CH` always skipped; icon `ND` → `is_descriptor=false` when first item `(int)section_id===2`, icon itself not rendered; `component_relation_index` icon → `"ICON:total"` + count_result (totals_group field is `value` not `count`), zero-total → element suppressed; other empty icons skipped.
- link_children → `children_tipo`, `has_descriptor_children` (batchDescriptorFlags), synthetic `{type:'link_children_nd'}` when ND children exist. Non-descriptor rule: `is_descriptor===false && type==='link_children'` → children_tipo=null, skip.
- `isIndexable`: hierarchy/ontology root tipos always false; else first locator `section_id===1`.
- Permissions: hierarchy1 button_new→hierarchy11, button_delete→ALWAYS 0 (roots undeletable); hierarchy20 → hierarchy38/hierarchy39.
- `parseChildData` assumes HOMOGENEOUS children (order tipo from FIRST locator); child `section_id` is a STRING on the wire; dedup/prefetch keys use `${tipo}_${int(id)}`.
- `pickOrderValueForParent` priority: id-keyed match (`item.id_key ?? item.id` — the written pairing field is `id`; `{value,id}` is what add_value_by_id_key/addInlineValueByIdKey produce) → section_tipo_key+section_id_key → truly unkeyed (no pairing key of ANY generation) → first. **WC-015**: PHP's picker matches the phantom `$item->id_key` and returns the FIRST item's stale value on multi-item dataframes (multi-parent/moved nodes) — the reorder-reverts-on-reload bug; TS deliberately diverges. The client sorts children by this `order` field (ts_object.js:667), so a wrong pick visually reorders the tree. Gate: ts_tree_semantics 1b–1d.

## dd_ts_api (VERBATIM wire contract — msg strings asserted by PHP tests)
Envelope `{result, msg, errors}`, PHP strings copied verbatim. `get_node_data`/`get_children_data`: read gate ≥1. Mutations: write gate ≥2, PRE-validate before any write (no orphan window), then `withTransaction` + `acquireNodeLock`:
- `add_child`: lock parent → createSectionRecord → save is_descriptor+is_indexable defaults (dd64/1) → TLD ontology7 inheritance when `getSectionIdFromTipo(section_tipo)==='0'` → addParent(type dd47). Result = int new_section_id.
- `update_parent_data`: cycle guard (self-target OR isAncestor → `errors:['cycle']`) BEFORE mutating → lock BOTH parents strcmp-sorted → removeParent(old) → addParent(new) → recalculateSiblingOrders(old).
- `save_order`: lock parent → sortChildren → `syncOrderToDdOntology(changed, parentTipo, parentId)` (imported from `../ontology/ontology_write.ts`, Track B); `result===false` = section_map lacks an order component (exact PHP msg).
Cache invalidation runs only AFTER commit; mutation handlers never populate read caches (so rollback needs no cache clear — TS has no per-request instance caches).

## Tree search (searchThesaurus)
SQO → hits → per hit `getParentsRecursive` (memo BY REF, visited BY VALUE → diamond-DAG safe) → reverse top-down. For each ancestor: emit FULL sibling set FIRST (positional order index+1, mode 'list') THEN the ancestor node (order null for non-root; `getMainOrder(tld)` for root). Dedup keeps FIRST occurrence per `section_tipo:section_id` — match PHP's iteration so the same occurrence wins. `getMainOrder` reads `matrix_ontology_main` (PHP `hierarchy extends ontology` → get_main_order reads the ONTOLOGY main, NOT matrix_hierarchy_main) → null when no ontology main (thesaurus TLDs). `getHierarchyTermsSqo`: preserves PHP's shared-`$path` mutation quirk (parity over "fixing").

## Gotchas
- Caches (term, resolved-child) are keyed by CONTENT only (tipo/id/scope/lang — NEVER user/session): persistent-runtime discipline. Register clearers with the hub.
- `removeInlineByIdKey`/`updateInlineValueByIdKey` (relations/dataframe.ts) are the pure id_key contract backing order machinery.
- `insertMatrixRecordWithExplicitId` (advisory-locked, raises counter, throws on dup) + `createSectionRecord(...,sectionId?)` for deterministic node ids.

## Testing
Unit: `test/unit/{tld,with_transaction,node_lock_coexistence,ts_tree_semantics,ts_tree_db_semantics}.test.ts`. Differentials vs live PHP: `test/parity/ts_{node_read,search,mutations}_differential.test.ts` + `ts_mutations_hardening.test.ts` (concurrency: 2 racing add_child → distinct ids + distinct sibling orders). Fixture tree = `tchi1` (children_tipo `tchi40`, node 602 descriptor, 620 parent). Differentials do two round-trips — pass `--timeout 60000`. Write tests self-revert (create→read-back→delete); NEVER leave scratch records.

## Ledgered deferrals (in file headers)
`get_indexation_grid`; `format_component_data` branches for `component_relation_related` inverse-merge + `component_svg`; the tool_ontology list-mode session-SQO divergence (dedalo-ontology-ts).
