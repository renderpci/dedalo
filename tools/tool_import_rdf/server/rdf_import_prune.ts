/**
 * tool_import_rdf — PRUNING a plan before anything is fetched or written:
 *
 *   - `withoutKey`: the ops without some records and everything that reaches
 *     them (a linked term dropped as "not fetched", a record whose link the
 *     ontology maps off target).
 *   - `pruneOffTarget`: THE TARGET CHECK. A `link` (or an `intermediate`, whose
 *     record is linked too) puts a locator into section S in component C of a
 *     record. When S is not one of C's target sections, the insert door would
 *     refuse it (`relation.insert_refused`, off_target — relations/save.ts) —
 *     AFTER the term was looked up, fetched and created. It is asked here first,
 *     with the insert door's OWN resolution (picker_constraint.ts
 *     `resolveCallerTargets` + `isTargetAllowed`, never a second copy), and the
 *     op is skipped with the reason the operator can act on: the external
 *     ontology node maps a section the component does not target. The record it
 *     would have linked is not created either when no other (valid) link
 *     reaches it — it would be an orphan no later run could find — and every op
 *     that depends on it is skipped with it.
 *
 * Called by the run (rdf_import_run.ts) before any linked term is looked up or
 * fetched, and by the executor before its transaction (a plan handed to it
 * directly is held to the same check). Nothing here writes, and nothing is
 * module state: the target memo is the call's own.
 */

import {
	isTargetAllowed,
	resolveCallerTargets,
} from '../../../src/core/relations/picker_constraint.ts';
import type {
	RdfFindOrCreateOp,
	RdfImportOp,
	RdfIntermediateOp,
	RdfLinkOp,
	RecordRef,
} from './rdf_import_plan.ts';

/** The refusal an off-target link would meet at the insert door. */
export const OFF_TARGET_CODE = 'relation.insert_refused';

/** One op the prune skipped: the component it addressed, why, and the refusal it stands for. */
export interface PrunedSkip {
	component_tipo: string;
	reason: string;
	code: string;
}

/** The skip of an op that names a record that failed (or will never be bound). */
export function dependsOn(key: string): string {
	return `depends on ${key}, which failed`;
}

/**
 * The ops without the records `keys` and everything that reaches them: ops on
 * them, links to them, intermediates under them (and, in turn, what reaches
 * those) — and the INTERMEDIATE that only leads to one of them (see
 * {@link deadIntermediates}). One pass suffices — a key is always emitted
 * before any op names it.
 */
export function withoutKey(
	ops: readonly RdfImportOp[],
	keys: string | Iterable<string>,
): { kept: RdfImportOp[]; removed: RdfImportOp[] } {
	const dead = new Set(typeof keys === 'string' ? [keys] : keys);
	for (const key of deadIntermediates(ops, dead)) dead.add(key);
	const kept: RdfImportOp[] = [];
	const removed: RdfImportOp[] = [];
	for (const op of ops) {
		if (!reaches(op, dead)) {
			kept.push(op);
			continue;
		}
		removed.push(op);
		if (op.op === 'intermediate') dead.add(op.key);
	}
	return { kept, removed };
}

/** A record an op emits: its key and the identifier it is found by. */
function identityOf(op: RdfImportOp): { key: string; identifier: string } | null {
	if (op.op !== 'find_or_create' && op.op !== 'intermediate') return null;
	return { key: op.key, identifier: op.match_value };
}

/**
 * The INTERMEDIATES that die with a dead record. An intermediate (creators →
 * person → URI) is found again ONLY through its path to the resource it is
 * pinned to; when that resource's record is dropped, the intermediate would be
 * created EMPTY, linked from the caller, and never found by the next run, which
 * would create another. So an intermediate that links (or nests) a dead record
 * of ITS OWN identifier dies too, and so, in turn, does one above it. Children
 * are emitted after their parent, so one backward pass reaches the top.
 */
function deadIntermediates(ops: readonly RdfImportOp[], dead: ReadonlySet<string>): Set<string> {
	const { identifiers, pins } = identitiesOf(ops);
	const killed = new Set<string>();
	for (const op of [...ops].reverse()) {
		const edge = childEdge(op);
		if (edge === null || !(dead.has(edge.child) || killed.has(edge.child))) continue;
		if (pinnedTo(pins, edge.parent, identifiers.get(edge.child))) killed.add(edge.parent);
	}
	return killed;
}

/** Every emitted record's identifier, and every intermediate's pin (its resource's identifier). */
function identitiesOf(ops: readonly RdfImportOp[]): {
	identifiers: Map<string, string>;
	pins: Map<string, string>;
} {
	const identifiers = new Map<string, string>();
	const pins = new Map<string, string>();
	for (const op of ops) {
		const identity = identityOf(op);
		if (identity !== null) identifiers.set(identity.key, identity.identifier);
		if (op.op === 'intermediate') pins.set(op.key, op.match_value);
	}
	return { identifiers, pins };
}

/** The record an op hangs under another one: a link's target, a nested intermediate's. */
function childEdge(op: RdfImportOp): { parent: string; child: string } | null {
	if (op.op !== 'link' && op.op !== 'intermediate') return null;
	const child = op.op === 'link' ? op.to : refOf(op.key);
	if (op.target.kind !== 'found_or_created' || child.kind !== 'found_or_created') return null;
	return { parent: op.target.key, child: child.key };
}

function refOf(key: string): RecordRef {
	return { kind: 'found_or_created', key };
}

/** Is `key` an intermediate pinned to `identifier`? */
function pinnedTo(
	pins: ReadonlyMap<string, string>,
	key: string,
	identifier: string | undefined,
): boolean {
	return identifier !== undefined && pins.get(key) === identifier;
}

/** Does `op` emit a dead record, or name one? */
function reaches(op: RdfImportOp, dead: ReadonlySet<string>): boolean {
	const own = identityOf(op);
	if (own !== null && dead.has(own.key)) return true;
	if (op.op === 'find_or_create') return false;
	return refsOf(op).some((ref) => ref.kind === 'found_or_created' && dead.has(ref.key));
}

function refsOf(op: Exclude<RdfImportOp, RdfFindOrCreateOp>): RecordRef[] {
	return op.op === 'link' ? [op.target, op.to] : [op.target];
}

// ---------------------------------------------------------------------------
// The target check
// ---------------------------------------------------------------------------

/** An op that puts a locator into a relation component. */
type EdgeOp = RdfLinkOp | RdfIntermediateOp;

/** The call's memo: `${component}|${host}` → C's target sections. */
type TargetMemo = Map<string, readonly string[]>;

function isEdge(op: RdfImportOp): op is EdgeOp {
	return op.op === 'link' || op.op === 'intermediate';
}

/** The section the locator points into: the linked record's, or the intermediate's own. */
function linkedSection(op: EdgeOp): string {
	return op.op === 'link' ? op.to_section_tipo : op.intermediate_section_tipo;
}

/** The section of the record holding the component: the caller's, else the plan's. */
function hostSection(ref: RecordRef, op: EdgeOp, callerSection: string): string {
	return ref.kind === 'caller' ? callerSection : op.section_tipo;
}

async function targetsOf(op: EdgeOp, host: string, memo: TargetMemo): Promise<readonly string[]> {
	const name = `${op.component_tipo}|${host}`;
	const known = memo.get(name);
	if (known !== undefined) return known;
	const targets = await resolveCallerTargets(op.component_tipo, host);
	memo.set(name, targets);
	return targets;
}

/** The ontology node that MAPS the linked section: the class of the term, else the property. */
function mappedBy(op: EdgeOp, classes: ReadonlyMap<string, string>): string {
	if (op.op === 'link' && op.to.kind === 'found_or_created') {
		return classes.get(op.to.key) ?? op.ontology_tipo;
	}
	return op.ontology_tipo;
}

/** Why `op` links a section its component does not target, or null. */
async function offTargetReason(
	op: EdgeOp,
	callerSection: string,
	classes: ReadonlyMap<string, string>,
	memo: TargetMemo,
): Promise<string | null> {
	const section = linkedSection(op);
	const targets = await targetsOf(op, hostSection(op.target, op, callerSection), memo);
	if (await isTargetAllowed(targets, section)) return null;
	return (
		`ontology ${mappedBy(op, classes)} maps ${section}, but ${op.component_tipo} ` +
		`targets ${targets.join(', ')} — fix the ontology node`
	);
}

/** find_or_create key → its class tipo (the node that maps the term's section). */
function classesOf(ops: readonly RdfImportOp[]): Map<string, string> {
	const classes = new Map<string, string>();
	for (const op of ops) {
		if (op.op === 'find_or_create') classes.set(op.key, op.class_tipo);
	}
	return classes;
}

/** Every off-target edge of `ops`, with its reason. */
async function offTargetEdges(
	ops: readonly RdfImportOp[],
	callerSection: string,
): Promise<Map<EdgeOp, string>> {
	const classes = classesOf(ops);
	const memo: TargetMemo = new Map();
	const verdicts = new Map<EdgeOp, string>();
	for (const op of ops) {
		if (!isEdge(op)) continue;
		const reason = await offTargetReason(op, callerSection, classes, memo);
		if (reason !== null) verdicts.set(op, reason);
	}
	return verdicts;
}

/**
 * The records that die with their off-target edges: an off-target
 * intermediate, and a term this list emits that NO on-target link reaches (a
 * term linked validly elsewhere is still bound; only the bad link goes).
 */
function deadKeys(ops: readonly RdfImportOp[], verdicts: ReadonlyMap<EdgeOp, string>): Set<string> {
	const dead = new Set(
		ops.flatMap((op) => (op.op === 'intermediate' && verdicts.has(op) ? [op.key] : [])),
	);
	const { offLinked, onLinked } = linkedKeys(ops, verdicts);
	const emitted = new Set(ops.filter((op) => op.op === 'find_or_create').map((op) => op.key));
	for (const key of offLinked) {
		if (emitted.has(key) && !onLinked.has(key)) dead.add(key);
	}
	return dead;
}

/** The records links reach: through an off-target link, through an on-target one. */
function linkedKeys(
	ops: readonly RdfImportOp[],
	verdicts: ReadonlyMap<EdgeOp, string>,
): { offLinked: Set<string>; onLinked: Set<string> } {
	const offLinked = new Set<string>();
	const onLinked = new Set<string>();
	for (const op of ops) {
		if (op.op !== 'link' || op.to.kind !== 'found_or_created') continue;
		(verdicts.has(op) ? offLinked : onLinked).add(op.to.key);
	}
	return { offLinked, onLinked };
}

/** The record `op` depends on: the first dead record it names, else its own. */
function blamedKey(op: Exclude<RdfImportOp, RdfFindOrCreateOp>, dead: ReadonlySet<string>): string {
	const refs = op.op === 'link' ? [op.target, op.to] : [op.target];
	for (const ref of refs) {
		if (ref.kind === 'found_or_created' && dead.has(ref.key)) return ref.key;
	}
	return op.op === 'intermediate' ? op.key : refKey(op.target);
}

function refKey(ref: RecordRef): string {
	return ref.kind === 'caller' ? 'caller' : ref.key;
}

/** The skip of every removed op but a dead term's own find_or_create (its link says why). */
function dependentSkips(removed: readonly RdfImportOp[], dead: ReadonlySet<string>): PrunedSkip[] {
	const skips: PrunedSkip[] = [];
	for (const op of removed) {
		if (op.op === 'find_or_create') continue;
		const reason = dependsOn(blamedKey(op, dead));
		skips.push({ component_tipo: op.component_tipo ?? '', reason, code: OFF_TARGET_CODE });
	}
	return skips;
}

/**
 * The ops with every off-target edge removed (skipped with the ontology's
 * reason), and the records only those edges reached — their find_or_create
 * never looked up, fetched or created — with every op on them, each skipped
 * as depending on it.
 */
export async function pruneOffTarget(
	ops: readonly RdfImportOp[],
	callerSection: string,
): Promise<{ ops: RdfImportOp[]; skipped: PrunedSkip[] }> {
	const verdicts = await offTargetEdges(ops, callerSection);
	if (verdicts.size === 0) return { ops: [...ops], skipped: [] };
	const skipped: PrunedSkip[] = [...verdicts].map(([op, reason]) => ({
		component_tipo: op.component_tipo,
		reason,
		code: OFF_TARGET_CODE,
	}));
	const dead = deadKeys(ops, verdicts);
	const live = ops.filter((op) => !(isEdge(op) && verdicts.has(op)));
	const { kept, removed } = withoutKey(live, dead);
	return { ops: kept, skipped: [...skipped, ...dependentSkips(removed, dead)] };
}
