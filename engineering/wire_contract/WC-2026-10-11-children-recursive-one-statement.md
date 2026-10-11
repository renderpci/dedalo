# WC-2026-10-11-children-recursive-one-statement — sibling order is total; a subtree is one snapshot

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, Step 8 PERF-6, lane 1).
- **Decision:** the recursive children walk (`getChildrenRecursive`,
  `getChildrenRecursiveBatch` — `sqo.children_recursive`, fixed filters, the tree) fetches
  every edge of the subtree in ONE recursive statement (`src/core/relations/descendant_walk.ts`)
  and replays it in process; the sibling order is one pure rule (`orderSiblings`) shared by
  the one-level read and the walk.
- **Shape before:** one inverse search per visited node plus one order read per internal
  node (~1,650 statements for a 1,200-node branch), each against its own snapshot. Siblings
  that tie on `section_id` (a virtual section's record and the real section's record with
  the same id) came back in whatever order the query plan produced.
- **Shape after:**
  - **Sibling order** (`getChildren`, `getChildrenOfType`, the walk): `(section_id ASC,
    section_tipo ASC)`, then a stable sort by the per-parent order value, unordered last.
    Only ties across sections move — and from plan-dependent to fixed.
  - **One snapshot:** the subtree's edges are read in one statement (one more per section
    the walk had not planned), so a concurrent re-parenting cannot be half-seen.
  - **Same output otherwise:** the node set, the emission order (siblings, then each
    sibling's subtree), the shared visited set and the bounds are unchanged.
  - **Refusals:** `relation.subtree_too_large` as before (`limit:'depth'|'nodes'`). The
    edge statement counts only nodes the walk keeps (it walks only into planned sections on
    the parent's table; an edge into an unplanned section is returned, not walked), so a
    fetch that reaches the node cap proves that many reachable descendants: the replay runs
    first and the refusal it reaches wins; the backstop, should the replay reach none, is
    `'nodes'` naming the FIRST root of the call. Children on another table can never fill
    the cap and fake a refusal.
- **Reason:** a subtree read whose cost grows with the subtree (and whose pieces each see
  a different snapshot) is not a bounded read; the ordering tie was the one place the
  answer depended on the query plan.
- **Gate reconciliation:** no fixture edit, no re-harvest — no parity gate replays a
  recursive children read or a cross-section sibling tie. Gates: `test/unit/children_recursive_set_native.test.ts` (output, order and refusals
  equal to an independent per-node walk over `getChildren` on the zzscale and cross-section
  shapes, incl. a declared other-table section, an undeclared same-table section reached
  only by a second edge round, and the node bound through the real walk under the
  `getChildrenRecursiveUnderNodeCap` seam; the cross-section tree in exactly 2 edge rounds
  plus one order read per child section),
  `test/unit/read_query_budget_native.test.ts` SHAPE 3 (flat cost, equal for 1,199 nodes,
  ~1,190 nodes, a handful and a 10-root batch).
