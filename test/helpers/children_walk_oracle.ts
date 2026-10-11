/**
 * THE CHILDREN-WALK ORACLE — an independent, deliberately naive descendant walk
 * built ONLY on the public one-level door `getChildren`, for the PERF-6 gate
 * (`test/unit/children_recursive_set_native.test.ts`).
 *
 * WHY AN ORACLE. `getChildrenRecursive` / `getChildrenRecursiveBatch` were a
 * per-node recursion (one `getChildren` per visited node — ~1,650 statements
 * for a 1,200-node subtree); PERF-6 replaces that with ONE recursive statement
 * that fetches every edge plus a synchronous in-process replay. A rewrite of
 * that kind is only safe if its OUTPUT is provably the old one's, so this file
 * keeps the old semantics as an executable specification, re-derived from the
 * public contract rather than copied from the engine:
 *
 *   - ONE visited set per call, shared across every root of a batch (a root
 *     already reached from an earlier root emits nothing);
 *   - a node is claimed (visited + counted) when its PARENT lists it, and all of
 *     a parent's fresh children are claimed BEFORE any of them is descended —
 *     emission order is `[fresh siblings…, subtree(sibling 1)…, subtree(2)…]`;
 *   - sibling order is exactly `getChildren`'s order (the one order rule);
 *   - the bounds: past `CHILDREN_RECURSIVE_MAX_DEPTH` (depth of the node being
 *     emitted, the root's own children being depth 1) or past
 *     `CHILDREN_RECURSIVE_MAX_NODES` emitted nodes (counted across the whole
 *     batch — or `options.maxNodes`, the lower bound the engine's
 *     getChildrenRecursiveUnderNodeCap seam takes), the walk refuses, naming
 *     the root it was expanding.
 *
 * It returns the refusal as DATA (`{refused:{code, root, limit}}`) so a gate can
 * compare engine and oracle refusals field by field.
 */

import {
	CHILDREN_RECURSIVE_MAX_DEPTH,
	CHILDREN_RECURSIVE_MAX_NODES,
	type ChildLocator,
	getChildren,
} from '../../src/core/relations/children.ts';

export interface WalkRefusal {
	code: 'relation.subtree_too_large';
	root: { section_tipo: string; section_id: number };
	limit: 'depth' | 'nodes';
}

export type WalkOutcome = { nodes: ChildLocator[] } | { refused: WalkRefusal };

class OracleRefusal extends Error {
	constructor(readonly refusal: WalkRefusal) {
		super('oracle refusal');
	}
}

/** The oracle walk over many roots (the batch form; one root = the single form). */
export async function oracleDescendants(
	roots: readonly { section_tipo: string; section_id: number }[],
	options: { componentTipo?: string | null; maxNodes?: number } = {},
): Promise<WalkOutcome> {
	const maxNodes = options.maxNodes ?? CHILDREN_RECURSIVE_MAX_NODES;
	const visited = new Set<string>();
	let emitted = 0;
	const out: ChildLocator[] = [];
	let currentRoot = roots[0] ?? { section_tipo: '', section_id: 0 };

	async function walk(sectionId: number, sectionTipo: string, depth: number): Promise<void> {
		const direct = await getChildren(sectionId, sectionTipo, options.componentTipo);
		const fresh: ChildLocator[] = [];
		for (const child of direct) {
			const key = `${child.section_tipo}_${child.section_id}`;
			if (visited.has(key)) continue;
			visited.add(key);
			emitted++;
			if (depth > CHILDREN_RECURSIVE_MAX_DEPTH) {
				throw new OracleRefusal({
					code: 'relation.subtree_too_large',
					root: currentRoot,
					limit: 'depth',
				});
			}
			if (emitted > maxNodes) {
				throw new OracleRefusal({
					code: 'relation.subtree_too_large',
					root: currentRoot,
					limit: 'nodes',
				});
			}
			fresh.push(child);
		}
		out.push(...fresh);
		for (const child of fresh) await walk(child.section_id, child.section_tipo, depth + 1);
	}

	try {
		for (const root of roots) {
			const key = `${root.section_tipo}_${root.section_id}`;
			if (visited.has(key)) continue;
			visited.add(key);
			currentRoot = { section_tipo: root.section_tipo, section_id: root.section_id };
			await walk(root.section_id, root.section_tipo, 1);
		}
	} catch (error) {
		if (error instanceof OracleRefusal) return { refused: error.refusal };
		throw error;
	}
	return { nodes: out };
}

/** The engine's walk outcome in the oracle's shape (a refusal becomes data). */
export async function engineOutcome(run: () => Promise<ChildLocator[]>): Promise<WalkOutcome> {
	try {
		return { nodes: await run() };
	} catch (error) {
		const typed = error as {
			code?: string;
			coordinates?: { section_tipo?: unknown; section_id?: unknown };
			details?: { limit?: unknown };
		};
		if (typed?.code !== 'relation.subtree_too_large') throw error;
		return {
			refused: {
				code: 'relation.subtree_too_large',
				root: {
					section_tipo: String(typed.coordinates?.section_tipo),
					section_id: Number(typed.coordinates?.section_id),
				},
				limit: typed.details?.limit as 'depth' | 'nodes',
			},
		};
	}
}
