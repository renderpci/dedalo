/**
 * THE SUBTREE EDGE FETCH (PERF-6) — every parent→child edge reachable from a
 * seed set, in ONE recursive statement over matrix_relation_index.
 *
 * The recursive children walk (children.ts getChildrenRecursive /
 * getChildrenRecursiveBatch) used to ask each visited node for its own children
 * — one inverse-index search per node plus one order read per internal node
 * (~1,650 statements for a 1,200-node branch). The walk's QUESTION is a graph
 * reachability question the database answers in one statement; the walk's
 * ANSWER (order, dedup, bounds, refusals) stays in children.ts, which replays
 * these edges synchronously.
 *
 * THE EDGE RULE is getChildren's, per parent node P in section S:
 *   - a row r of matrix_relation_index with r.target = P and
 *     r.from_component_tipo = S's parent component (the plan's `parent_tipo`) —
 *     exactly the locatorIndexClause narrowing a one-level getChildren issues
 *     (from_component_tipo present ⇒ no type predicate);
 *   - only from a section whose plan names a `parent_tipo`: a section that
 *     cannot have children here (no children / parent component, or a table
 *     outside the relation index) is planned with `parent_tipo: null`, which
 *     no index row matches — one representation, no second flag to drift;
 *   - the CHILD must live on P's table (PHP searches only the parent section's
 *     table). An edge into a section the plan map does not name yet is RETURNED
 *     (`cm IS NULL`) for the caller to judge once it has planned that section,
 *     but the statement does not WALK into it: it is neither expanded nor
 *     counted toward `cap`. So every node the walk counts is a node the caller
 *     keeps (planned, on its parent's table), and `walked >= cap` proves that
 *     many kept nodes — a child on another table in an unplanned section can
 *     never fill the cap and fake a refusal.
 *
 * `UNION` (not `UNION ALL`) deduplicates walked nodes, which is also what makes
 * a parent CYCLE terminate. `bounded` stops the recursion at `cap` nodes; the
 * result carries how many were walked, so a caller can tell a complete edge
 * set from a truncated one. The plan map and the seeds are BOUND (jsonb
 * recordsets), never interpolated. Steps ride `matrix_relation_index_target_idx`.
 *
 * Imports only the db layer: the PLANNING (ontology) lives in children.ts.
 */

import { sql } from '../db/postgres.ts';

/** One planned section — what the edge rule needs to know about it. */
export interface WalkSectionPlan {
	section_tipo: string;
	/**
	 * Its component_relation_parent tipo — null when its nodes are NOT expanded
	 * at all (no children / parent component, or a table outside the relation
	 * index: findInverseReferences answers [] there).
	 */
	parent_tipo: string | null;
	/** Its matrix table. */
	tbl: string;
}

/** One parent→child edge (deduplicated). */
export interface WalkEdge {
	parent_tipo: string;
	parent_id: number;
	child_tipo: string;
	child_id: number;
}

/**
 * Every edge reachable from `seeds` under the edge rule, and the number of
 * nodes walked (seeds included). `walked >= cap` means the walk was cut.
 */
export async function fetchSubtreeEdges(
	seeds: readonly { section_tipo: string; section_id: number }[],
	map: readonly WalkSectionPlan[],
	cap: number,
): Promise<{ edges: WalkEdge[]; walked: number }> {
	if (seeds.length === 0) return { edges: [], walked: 0 };
	const rows = (await sql.unsafe(
		`WITH RECURSIVE
		 m AS MATERIALIZED (
		   SELECT * FROM jsonb_to_recordset($1::text::jsonb)
		     AS x(section_tipo text, parent_tipo text, tbl text)
		 ),
		 walk(section_tipo, section_id) AS (
		   SELECT s.section_tipo, s.section_id
		     FROM jsonb_to_recordset($2::text::jsonb) AS s(section_tipo text, section_id int)
		   UNION
		   SELECT r.section_tipo::text, r.section_id::int
		     FROM walk w
		     JOIN m pm ON pm.section_tipo = w.section_tipo
		     JOIN matrix_relation_index r
		       ON r.target_section_tipo = w.section_tipo
		      AND r.target_section_id = w.section_id
		      AND r.from_component_tipo = pm.parent_tipo
		     JOIN m cm ON cm.section_tipo = r.section_tipo::text AND cm.tbl = pm.tbl
		 ),
		 bounded AS MATERIALIZED (SELECT section_tipo, section_id FROM walk LIMIT $3::int)
		 SELECT b.section_tipo AS parent_tipo, b.section_id AS parent_id,
		        r.section_tipo::text AS child_tipo, r.section_id::int AS child_id,
		        (SELECT count(*) FROM bounded)::int AS walked
		   FROM bounded b
		   JOIN m pm ON pm.section_tipo = b.section_tipo
		   JOIN matrix_relation_index r
		     ON r.target_section_tipo = b.section_tipo
		    AND r.target_section_id = b.section_id
		    AND r.from_component_tipo = pm.parent_tipo
		   LEFT JOIN m cm ON cm.section_tipo = r.section_tipo::text
		  WHERE cm.section_tipo IS NULL OR cm.tbl = pm.tbl
		  GROUP BY 1, 2, 3, 4`,
		[
			JSON.stringify(
				map.map((plan) => ({
					section_tipo: plan.section_tipo,
					parent_tipo: plan.parent_tipo,
					tbl: plan.tbl,
				})),
			),
			JSON.stringify(seeds),
			cap,
		],
	)) as {
		parent_tipo: string;
		parent_id: number;
		child_tipo: string;
		child_id: number;
		walked: number;
	}[];
	const edges = rows.map((row) => ({
		parent_tipo: row.parent_tipo,
		parent_id: Number(row.parent_id),
		child_tipo: row.child_tipo,
		child_id: Number(row.child_id),
	}));
	return { edges, walked: rows.length === 0 ? seeds.length : Number(rows[0]?.walked) };
}
