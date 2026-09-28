/**
 * DEEP-PATH REVERSAL — the multi-hop filter leaf, driven from the LEAF.
 *
 * The forward shape (conform.ts buildJoinChain, purpose 'filter') starts at
 * EVERY record of the searched section, unnests every locator of every hop and
 * only then tests the leaf: the cost is the size of the main section whatever
 * the filter selects (measured monedaiberica numisdata4, 184k records, Tipo →
 * Ceca → name 'ikalesken': 2906 ms), and the fan-out forces
 * count(DISTINCT section_id).
 *
 * The reversed shape finds the matching LEAF records first (with the
 * search-store prefilter the forward join must not carry), then walks each hop
 * BACK through matrix_relation_index (target → source):
 *
 *   (main.section_tipo, main.section_id) IN (
 *     SELECT r1.section_tipo, r1.section_id FROM matrix_relation_index r1
 *     WHERE r1.from_component_tipo = '<hop1>' AND (r1.target_section_tipo, r1.target_section_id) IN (
 *       … SELECT leaf.section_tipo, leaf.section_id FROM <leaf table> AS <leaf alias>
 *         WHERE <leaf ACL> AND <leaf predicate>))
 *
 * Same query: 33 ms, same count. No join fragments → no fan-out → count(*).
 *
 * EXACTNESS — a unit is reversed ONLY when the answer is provably identical;
 * otherwise the forward shape stays, byte-identical. The forward semantics:
 * a record matches when SOME fan-out row satisfies the predicate, where a row
 * whose hop found nothing (no locator, dangling locator, ACL-refused record)
 * is the all-NULL row. The reversed shape only ever sees real target records,
 * so it is exact when:
 *
 *  1. the predicate is NOT TRUE on the all-NULL row — PROBED in SQL
 *     (`LEFT JOIN <table> ON false` yields one typed all-NULL row), never
 *     inferred from operator spelling. Negations / "is empty" are TRUE there
 *     and keep the forward shape;
 *  2. the leaf sits in a POSITIVE context (no $not/$nand/$nor ancestor);
 *  3. every alias of its chain is used ONLY by the leaves of its unit. Forward
 *     aliases dedup by path (the PHP rule), so two leaves sharing a hop are
 *     tested on the SAME joined row — the same related record. A unit is the
 *     set of sibling leaves (same $and/$or parent) with the identical chain;
 *     its predicates are combined INSIDE the innermost WHERE with the parent's
 *     operator, which keeps "same related record". Any other sharing (a prefix
 *     shared with a longer path, a same path in another group) stays forward;
 *  4. matrix_relation_index covers every SOURCE table of the chain (its sync
 *     trigger keys index rows by the relation STORAGE key, = hopDataTipo).
 *
 * The frontier ACL (SEC-02) travels with it: the leaf record's predicate in
 * the innermost WHERE, an intermediate record's predicate on a join of its own
 * table — the same predicate text the forward ON clause carries, on the same
 * alias name.
 */

import { sql } from '../db/postgres.ts';
import { compound } from './builders/types.ts';
import type { ConformedFilter, DeepLeafPlan, JoinHop } from './conform.ts';
import { ParamsCollector, resolveBuilderResult } from './params.ts';
import { relationIndexCovers } from './search_store.ts';

type LeafNode = Extract<ConformedFilter, { kind: 'leaf' }>;
type GroupNode = Extract<ConformedFilter, { kind: 'group' }>;

const NEGATING_OPS: ReadonlySet<string> = new Set(['$not', '$nand', '$nor']);
/** The group operators whose sibling leaves may form a reversed unit. */
const REVERSIBLE_OPS: ReadonlySet<string> = new Set(['$and', '$or']);

/** Rewrite eligible multi-hop leaves into the reversed shape (in place). */
export async function reverseDeepPaths(tree: ConformedFilter): Promise<ConformedFilter> {
	// A leaf contributing NO predicate contributes no rows either: its join
	// chain only fans the record out. Dropping it is exact and keeps it from
	// pinning a shared alias below.
	const root = dropInertJoins(tree);

	const aliasUsers = new Map<string, Set<LeafNode>>();
	collectAliasUsers(root, aliasUsers);

	if (root.kind === 'leaf') {
		const reversed = await tryReverse([root], '$and', aliasUsers);
		return reversed ?? root;
	}
	if (root.kind === 'group') await rewriteGroup(root, true, aliasUsers);
	return root;
}

function dropInertJoins(node: ConformedFilter): ConformedFilter {
	if (node.kind === 'leaf') {
		return node.fragment === false && node.joins !== undefined
			? { kind: 'leaf', fragment: false }
			: node;
	}
	if (node.kind === 'group') node.items = node.items.map(dropInertJoins);
	return node;
}

function addAliasUser(sink: Map<string, Set<LeafNode>>, alias: string, leaf: LeafNode): void {
	const users = sink.get(alias) ?? new Set<LeafNode>();
	users.add(leaf);
	sink.set(alias, users);
}

function collectAliasUsers(node: ConformedFilter, sink: Map<string, Set<LeafNode>>): void {
	if (node.kind === 'leaf') {
		for (const join of node.joins ?? []) addAliasUser(sink, join.alias, node);
		return;
	}
	if (node.kind === 'group') for (const item of node.items) collectAliasUsers(item, sink);
}

/** Units: sibling candidate leaves with the identical chain. */
function groupUnits(group: GroupNode): LeafNode[][] {
	const units = new Map<string, LeafNode[]>();
	for (const item of group.items) {
		if (!isCandidate(item)) continue;
		const key = chainKey(item.deep as DeepLeafPlan);
		units.set(key, [...(units.get(key) ?? []), item]);
	}
	return [...units.values()];
}

/** Put `reversed` in the unit's first slot; the unit's other leaves become inert. */
function replaceUnit(group: GroupNode, unit: LeafNode[], reversed: ConformedFilter): void {
	const [first, ...rest] = unit;
	group.items = group.items.map((item) => {
		if (item === first) return reversed;
		return rest.includes(item as LeafNode) ? { kind: 'leaf', fragment: false } : item;
	});
}

async function reverseGroupUnits(
	group: GroupNode,
	aliasUsers: Map<string, Set<LeafNode>>,
): Promise<void> {
	for (const unit of groupUnits(group)) {
		const reversed = await tryReverse(unit, group.op, aliasUsers);
		if (reversed !== null) replaceUnit(group, unit, reversed);
	}
}

async function rewriteGroup(
	group: GroupNode,
	positive: boolean,
	aliasUsers: Map<string, Set<LeafNode>>,
): Promise<void> {
	const childPositive = positive && !NEGATING_OPS.has(group.op);
	if (childPositive && REVERSIBLE_OPS.has(group.op)) await reverseGroupUnits(group, aliasUsers);
	for (const item of group.items) {
		if (item.kind === 'group') await rewriteGroup(item, childPositive, aliasUsers);
	}
}

function isCandidate(node: ConformedFilter): node is LeafNode {
	return (
		node.kind === 'leaf' &&
		node.deep !== undefined &&
		node.fragment !== false &&
		(node.joins?.length ?? 0) > 0
	);
}

function chainKey(plan: DeepLeafPlan): string {
	return plan.hops.map((hop) => hop.alias).join('|');
}

/** Every plan of a unit, or null when any leaf lacks one (or the unit is empty). */
function unitPlans(unit: LeafNode[]): DeepLeafPlan[] | null {
	const plans = unit.map((leaf) => leaf.deep).filter((plan) => plan !== undefined);
	return plans.length === unit.length && plans.length > 0 ? plans : null;
}

/** 3. alias exclusivity: no join alias of the unit is used outside it. */
function aliasesExclusive(unit: LeafNode[], aliasUsers: Map<string, Set<LeafNode>>): boolean {
	const joins = unit.flatMap((leaf) => leaf.joins ?? []);
	return joins.every((join) =>
		[...(aliasUsers.get(join.alias) ?? [])].every((user) => unit.includes(user)),
	);
}

/** 1. the all-NULL row: TRUE when any plan's forward predicate holds on it. */
async function anyTrueOnNullRow(plans: DeepLeafPlan[], leafHop: JoinHop): Promise<boolean> {
	for (const leafPlan of plans) {
		if (await trueOnNullRow(leafPlan, leafHop)) return true;
	}
	return false;
}

async function tryReverse(
	unit: LeafNode[],
	op: string,
	aliasUsers: Map<string, Set<LeafNode>>,
): Promise<ConformedFilter | null> {
	const plans = unitPlans(unit);
	if (plans === null) return null;
	const plan = plans[0] as DeepLeafPlan;

	if (!aliasesExclusive(unit, aliasUsers)) return null;
	// 4. index coverage of every source table.
	const sourceTables = [plan.mainTable, ...plan.hops.slice(0, -1).map((hop) => hop.table)];
	if (!(await relationIndexCovers([...new Set(sourceTables)]))) return null;
	const leafHop = plan.hops[plan.hops.length - 1] as JoinHop;
	if (await anyTrueOnNullRow(plans, leafHop)) return null;

	const { open, close } = reverseShell(plan);
	return {
		kind: 'reverse',
		open,
		inner: compound(
			op === '$or' ? '$or' : '$and',
			plans.map((p) => p.reverseFragment),
		),
		close,
	};
}

/**
 * TRUE when the FORWARD predicate holds on the all-NULL row of the leaf table
 * — i.e. the forward shape would match records whose hop found nothing, which
 * the reversed shape cannot see. Any doubt (a predicate naming another alias,
 * a probe error) answers true: keep the forward shape.
 */
async function trueOnNullRow(plan: DeepLeafPlan, leafHop: JoinHop): Promise<boolean> {
	const params = new ParamsCollector();
	const predicate = resolveBuilderResult(plan.forward, params);
	if (predicate === '') return true;
	const foreignAliases = [plan.mainAlias, ...plan.hops.slice(0, -1).map((hop) => hop.alias)];
	if (foreignAliases.some((alias) => new RegExp(`\\b${alias}\\.`).test(predicate))) return true;
	try {
		// Same executor as the search itself (an ambient transaction included):
		// the predicate is the one the forward query runs on this alias/table.
		const rows = (await sql.unsafe(
			`SELECT COALESCE((${predicate}), false) AS m FROM (SELECT 1) AS dd_null_probe ` +
				`LEFT JOIN ${leafHop.table} AS ${leafHop.alias} ON false`,
			params.toArray() as (string | number | null)[],
		)) as { m: boolean }[];
		return rows[0]?.m !== false;
	} catch {
		return true;
	}
}

/** The reversed chain around the innermost leaf predicate. */
function reverseShell(plan: DeepLeafPlan): { open: string; close: string } {
	const hops = plan.hops;
	const leafHop = hops[hops.length - 1] as JoinHop;
	let open =
		`SELECT ${leafHop.alias}.section_tipo, ${leafHop.alias}.section_id ` +
		`FROM ${leafHop.table} AS ${leafHop.alias} WHERE ` +
		(leafHop.acl === '' ? '' : `(${leafHop.acl}) AND `) +
		'(';
	let close = ')';
	for (let index = hops.length - 1; index >= 0; index--) {
		const hop = hops[index] as JoinHop;
		const ri = `ri_${hop.alias}`;
		const source = index === 0 ? undefined : (hops[index - 1] as JoinHop);
		const sourceJoin =
			source === undefined || source.acl === ''
				? ''
				: ` JOIN ${source.table} AS ${source.alias} ON ${source.alias}.section_tipo = ${ri}.section_tipo ` +
					`AND ${source.alias}.section_id = ${ri}.section_id AND (${source.acl})`;
		open =
			`SELECT ${ri}.section_tipo, ${ri}.section_id FROM matrix_relation_index AS ${ri}${sourceJoin} ` +
			`WHERE ${ri}.from_component_tipo = '${hop.hopDataTipo}' ` +
			`AND (${ri}.target_section_tipo, ${ri}.target_section_id) IN (${open}`;
		close = `${close})`;
	}
	return {
		open: `(${plan.mainAlias}.section_tipo, ${plan.mainAlias}.section_id) IN (${open}`,
		close: `${close})`,
	};
}
