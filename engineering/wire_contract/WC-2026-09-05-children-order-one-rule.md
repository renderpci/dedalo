# WC-2026-09-05-children-order-one-rule — one sibling-order rule, one emission per node, and a bounded subtree

- **Date:** 2026-09-05, adopted with the batching of the children engine's
  order read (PERF-02) and the bounding of its recursive walk (PERF-03).
- **Decision:** DEC-12 (the invariants land with their gates —
  `test/unit/read_query_budget_native.test.ts`,
  `test/unit/children_bounds_native.test.ts`).

## Shape before (PHP, and TS through 2026-09-04)

Three behaviours, all reachable from a plain section read or a
`children_recursive` search:

1. **Two order rules.** The thesaurus tree resolved a child's per-parent order
   with `ts_node_repository::pick_order_value_for_parent` — a four-step chain
   (id-keyed entry, legacy `section_tipo_key`/`section_id_key` entry, legacy
   UNKEYED entry, else the first entry). The children engine
   (`relations/children.ts orderChildHits`) used its own, shorter rule:
   `paired ?? items[0].value`. On a record carrying a legacy section-coords
   entry the two answered DIFFERENT numbers, so the same child sorted one way
   in the tree and another in a list.
2. **A poly-hierarchy node came back twice.** `getChildrenRecursiveBatch`
   documented "the result is already deduplicated by locator" and was not: the
   shared walk pushed a node's whole direct-children list before the visited set
   pruned it, so a child listed by TWO parents was emitted once per parent.
   `getChildrenRecursive` (by-VALUE visited, PHP `get_children_recursive` :802)
   went further and re-walked the whole subtree once per path into it.
3. **The walk was unbounded** in depth and in nodes, and the `hierarchy_terms`
   `fixed_filter` expansion was unbounded in ids.

## Shape after (TS)

1. **ONE rule.** `pickOrderValueForParent`
   (`src/core/ts_object/node_repository.ts` — its historical home, and the one
   both source ratchets already recognise) is now imported by BOTH callers; the
   children engine answers with the full chain instead of its own. The POSITIONAL v6 fallback
   the children engine documented (mht160/6 — a polyhierarchy child under a
   non-first parent, whose id_key pairs with nothing) is step 3 of that chain
   plus the first-entry fallback, so it is preserved verbatim; what CHANGES is
   the legacy section-coords entry, which the children engine used to skip and
   now honours — the same value the tree has always served.
2. **A node is emitted ONCE.** Emission and expansion are the same event against
   one shared visited set, in both the single-root and the batch walk. Level-first
   flat order is unchanged; only duplicates disappear.
3. **Bounded, refusing.** `CHILDREN_RECURSIVE_MAX_DEPTH` (64) and
   `CHILDREN_RECURSIVE_MAX_NODES` (200,000) are compared in one pure predicate
   and REFUSE with the new closed-registry code `relation.subtree_too_large`
   (status 400, operator disclosure, `details.limit` / `details.cap`). A
   `hierarchy_terms` term expanding past 50,000 ids refuses with
   `ontology.invalid_node` — hand-authored config, so it is a config error.
   Nothing truncates: a narrowed subtree is a wrong answer that looks right.

## Reason

The client consumes children as an ORDER and as a SET. Two order rules meant the
same term sat at different positions in the tree and in the list it opens, with
no way for the client to tell which was right. The duplicate emission was masked
downstream (`sql_assembler.ts` re-dedups into a Map) but is visible to every
other caller of the batch walk, and it contradicted the function's own stated
contract. And the cost was structural: `orderChildHits` issued TWO full-row
reads PER CHILD, so a 440-wide node spent ~881 statements to answer one page.
One batched statement per section group answers the same question — the shape
`fetchNodeInfo` has always used — which is what makes the per-shape budgets
assertable at all. A read path with no ceiling degrades silently until an
install with a real corpus is slow; refusing an absurd subtree tells the caller
it asked the wrong question.

## Gate reconciliation

- `test/unit/read_query_budget_native.test.ts` (NEW) — per-shape statement
  ceilings over the museum-scale `zzscale` corpus: one list page, `getChildren`
  of the 440-wide node (1 inverse search + 1 batched order read), and
  `getChildrenRecursive` over 1,199 descendants; plus a planted N+1 as a
  positive control. Never one number for all three.
- `test/unit/children_bounds_native.test.ts` (NEW) — the depth refusal on a
  66-record chain, the bound predicate at both caps, the poly-hierarchy
  single-emission outcome, the `hierarchy_terms` cap, and the SAME order values
  through both doors (children engine and `fetchNodeInfo`) including the
  section-coords entry the retired rule missed.
- `test/unit/search_children_recursive_native.test.ts` (AMENDED) — its diamond
  leg pinned the OLD duplicate (`count(D) === 2`, annotated "PHP does not dedup
  those either"); it now pins the contract the function documents
  (`count(D) === 1`). The expansion, the fixed filter and the paging/count
  divergences of WC-2026-09-01-children-recursive-search are untouched.
- `test/unit/sql_confinement_tripwire.test.ts` — `relations/children.ts` is
  removed from the dd_ontology direct-read ratchet: `getRelatedParentTipo` now
  reads the resolver's node cache.
- **No re-harvest is needed.** The frozen oracle store holds harvested READ
  responses; none carries a record with a legacy section-coords order entry, a
  poly-hierarchy duplicate or a subtree past either cap, so no fixture's bytes
  change.
