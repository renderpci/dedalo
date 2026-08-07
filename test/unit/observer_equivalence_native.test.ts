/**
 * EQUIVALENCE-CLASS REMOVAL GATES (2026-08-06) — the reported numisdata36 bug,
 * reduced to its mechanism and pinned.
 *
 * THE BUG. `numisdata77` (a coin-type's "coins of this type" mirror) observes
 * `numisdata36` (dd621 equivalents) through `set_dato_external` with
 * `source.data_from_field:[numisdata36]`, so the mirror lists records
 * referencing this type OR ANY OF ITS EQUIVALENTS. Assigning an equivalence
 * updated both types' mirrors; REMOVING it updated neither, and the portal
 * kept showing both types' coins as if they were still equivalent. Measured on
 * the live DB: the removal produced ZERO mirror writes on either record.
 *
 * Three independent causes, one gate each below:
 *
 *  1. THE REMOVED LOCATOR WAS NEVER A TARGET. Propagation derived its whole
 *     target set from the POST-save value, so the record the save stopped
 *     pointing at was not visited at all. (ObservedChange.removed)
 *  2. THE SHRINK WAS REFUSED. The saved record itself WAS visited, but the
 *     Phase-0 grow-only fail-safe withheld every drop unconditionally.
 *     (retired — the kernel's degraded-seed refusal replaced it)
 *  3. THE CLASS WAS IGNORED. dd621 is TRANSITIVE, so one edge change
 *     re-partitions a whole class: in A—B—C, changing B—C also changes A's
 *     class. The saved bag names only the direct endpoints. This is wrong in
 *     BOTH directions — the reported 2-member case appeared to work on ADD
 *     purely because a 2-member class has no third member.
 *     (targets = closure(saved) ∪ ⋃ closure(removed))
 *
 * Topology (a 3-member chain, deliberately stored ASYMMETRICALLY so the
 * closure has to work in both directions — X stores Y, Y stores Z, and X
 * reaches Z only transitively):
 *
 *     TERM_X --stores--> TERM_Y --stores--> TERM_Z
 *       ^                  ^                  ^
 *     REF_X              REF_Y              REF_Z      (rsc205, via EQ_REF)
 *
 * With all three in one class every mirror holds all three referencers.
 * Removing the Y—Z edge splits it into {X,Y} and {Z} — and TERM_X, which the
 * save never mentions, must recompute.
 *
 * Environment: suite DB. Scratch band test9994x / 9999999 5x (distinct from
 * observer_failsafe test9990x, observer_seed test9991x, observer_cascade
 * test9992x). The on1 anchor comes from the shared seed helper; the whole
 * suite runs ONLY when that seed was actually planted, so a restored live
 * snapshot is never written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCounters } from '../../src/core/api/counters.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { recomputeExternalRelation } from '../../src/core/section/record/observers.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	seedTermChainIfAbsent,
	sweepTermChain,
	type TermSeedHandle,
} from '../helpers/observer_term_seed.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const KERNEL_FILE = 'src/core/section/record/observers.ts';
const kernelSource = readFileSync(join(REPO_ROOT, KERNEL_FILE), 'utf-8');

// --- scratch band -----------------------------------------------------------
const EQ_PEER = 'test99940'; // dd621 equivalents (the numisdata36 shape)
const EQ_MIRROR = 'test99941'; // set_dato_external observer (the numisdata77 shape)
const EQ_REF = 'test99942'; // the referencing component in rsc205 (numisdata161 shape)

const TERM_X = 999999951;
const TERM_Y = 999999952;
const TERM_Z = 999999953;
const REF_X = 999999954;
const REF_Y = 999999955;
const REF_Z = 999999956;

const TERMS = [TERM_X, TERM_Y, TERM_Z];
const REFS = [REF_X, REF_Y, REF_Z];

let termSeed: TermSeedHandle = { seededChain: false, seededSectionNode: false };
let planted = false;

const SCRATCH_NODES: { tipo: string; model: string; properties: Record<string, unknown> }[] = [
	{
		// The observed component. dd621 = MULTIDIRECTIONAL, so its references are
		// the full transitive closure in both walk directions — the property the
		// whole class expansion rests on.
		tipo: EQ_PEER,
		model: 'component_relation_related',
		properties: {
			config_relation: { relation_type_rel: 'dd621' },
			observers: [{ section_tipo: 'on1', component_tipo: EQ_MIRROR }],
		},
	},
	{
		// The mirror. data_from_field names EQ_PEER — that is what makes a save on
		// EQ_PEER a CLASS event rather than a link event.
		tipo: EQ_MIRROR,
		model: 'component_portal',
		properties: {
			observe: [
				{
					component_tipo: EQ_PEER,
					server: {
						config: { use_self_section: true, use_observable_dato: true },
						perform: {
							function: 'set_dato_external',
							params: { save: true, changed: false, current_dato: false, references_limit: 0 },
						},
					},
				},
			],
			source: {
				data_from_field: [EQ_PEER],
				section_to_search: ['rsc205'],
				component_to_search: [EQ_REF],
			},
		},
	},
	{ tipo: EQ_REF, model: 'component_autocomplete', properties: {} },
];

/**
 * Referencer ids listed in a term's mirror, sorted. Item ids and positions are
 * deliberately NOT asserted here: the byte shape of an appended entry is
 * pinned by observer_reconcile_native.test.ts, and these gates are about WHICH
 * records get recomputed.
 */
async function mirrorRefs(termId: number): Promise<number[]> {
	const rows = (await sql.unsafe(
		'SELECT relation->$1 AS bag FROM matrix_hierarchy WHERE section_tipo = $2 AND section_id = $3',
		[EQ_MIRROR, 'on1', termId],
	)) as { bag: { section_id?: string }[] | null }[];
	return (rows[0]?.bag ?? []).map((entry) => Number(entry.section_id)).sort((a, b) => a - b);
}

/** Point `termId`'s equivalence bag at `peerIds` (raw — the stored half). */
async function setEquivalents(termId: number, peerIds: number[]): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_hierarchy SET relation = jsonb_set(COALESCE(relation, '{}'::jsonb), $1::text[], $2::text::jsonb)
		 WHERE section_tipo = 'on1' AND section_id = $3`,
		[
			`{${EQ_PEER}}`,
			JSON.stringify(
				peerIds.map((peerId, index) => ({
					id: index + 1,
					type: 'dd47',
					type_rel: 'dd621',
					section_id: String(peerId),
					section_tipo: 'on1',
					from_component_tipo: EQ_PEER,
				})),
			),
			termId,
		],
	);
}

/** Recompute every term's mirror so the class starts converged. */
async function converge(): Promise<void> {
	for (const termId of TERMS) {
		await recomputeExternalRelation(EQ_MIRROR, 'on1', termId, -1, new Date(), {});
	}
}

async function sweepScratch(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo LIKE 'test9994%' AND tld = 'test'`);
	await sql.unsafe(
		`DELETE FROM matrix_hierarchy WHERE section_tipo = 'on1' AND section_id = ANY(string_to_array($1, ',')::int[])`,
		[TERMS.join(',')],
	);
	await sql.unsafe(
		`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = ANY(string_to_array($1, ',')::int[])`,
		[REFS.join(',')],
	);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE tipo LIKE 'test9994%'`, []);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = 'on1' AND section_id = ANY(string_to_array($1, ',')::int[])`,
		[TERMS.join(',')],
	);
}

async function clearResolverCaches(): Promise<void> {
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

/** X—Y and Y—Z stored, mirrors converged: one class of three. */
async function resetToFullChain(): Promise<void> {
	await setEquivalents(TERM_X, [TERM_Y]);
	await setEquivalents(TERM_Y, [TERM_Z]);
	await setEquivalents(TERM_Z, []);
	for (const termId of TERMS) {
		await sql.unsafe(
			`UPDATE matrix_hierarchy SET relation = relation - $1 WHERE section_tipo = 'on1' AND section_id = $2`,
			[EQ_MIRROR, termId],
		);
	}
	await converge();
}

beforeAll(async () => {
	termSeed = await seedTermChainIfAbsent();
	planted = termSeed.seededChain;
	if (!planted) {
		console.warn(
			'observer_equivalence_native: on1 anchor pre-exists (live-snapshot DB) — suite SKIPPED, these gates WRITE mirrors',
		);
		return;
	}
	await sweepScratch();
	for (const node of SCRATCH_NODES) {
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1400 FROM dd_ontology), $1, 'test3', $2, 'test', $3::text::jsonb)`,
			[node.tipo, node.model, JSON.stringify(node.properties)],
		);
	}
	await clearResolverCaches();
	// The three class members …
	for (const termId of TERMS) {
		await sql.unsafe(
			`INSERT INTO matrix_hierarchy (section_id, section_tipo, relation) VALUES ($1, 'on1', '{}'::jsonb)`,
			[termId],
		);
	}
	// … and one referencer each (raw INSERT = the bypass shape; the
	// matrix_relation_index trigger still indexes it, which is what the value
	// law searches).
	for (const [index, refId] of REFS.entries()) {
		await sql.unsafe(
			`INSERT INTO matrix (section_id, section_tipo, relation) VALUES ($1, 'rsc205', $2::text::jsonb)`,
			[
				refId,
				JSON.stringify({
					[EQ_REF]: [
						{
							id: 1,
							type: 'dd151',
							section_id: String(TERMS[index]),
							section_tipo: 'on1',
							from_component_tipo: EQ_REF,
						},
					],
				}),
			],
		);
	}
});

afterAll(async () => {
	if (!planted) return;
	await sweepScratch();
	await clearResolverCaches();
	await sweepTermChain(termSeed);
});

describe('equivalence-class targets (dd621 closure)', () => {
	test('the chain starts as ONE class: every member mirrors all three referencers', async () => {
		if (!planted) return;
		await resetToFullChain();
		// X reaches Z only TRANSITIVELY (X stores Y, Y stores Z) — if the seed
		// were one hop this would be [REF_X, REF_Y].
		expect(await mirrorRefs(TERM_X)).toEqual([REF_X, REF_Y, REF_Z]);
		expect(await mirrorRefs(TERM_Y)).toEqual([REF_X, REF_Y, REF_Z]);
		expect(await mirrorRefs(TERM_Z)).toEqual([REF_X, REF_Y, REF_Z]);
	}, 30000);

	test('a chain SPLIT recomputes the THIRD record, which the save never mentions', async () => {
		if (!planted) return;
		await resetToFullChain();
		// Remove Y—Z at Y through the ORDINARY save door. This is the reported
		// user action, and it is the only path that exercises the pre-save
		// snapshot in save_component.ts — a direct propagateToObservers call
		// would not.
		const result = await saveComponentData({
			componentTipo: EQ_PEER,
			sectionTipo: 'on1',
			sectionId: TERM_Y,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', key: 0, value: [] }],
			userId: -1,
		});
		expect(result.ok).toBe(true);
		// The save states what it removed — cause (1).
		expect((result.removedItems as { section_id?: string }[] | undefined)?.length).toBe(1);

		// Y is the saved record (self) and Z is the removed target …
		expect(await mirrorRefs(TERM_Y)).toEqual([REF_X, REF_Y]);
		expect(await mirrorRefs(TERM_Z)).toEqual([REF_Z]);
		// … and X — named NOWHERE in the save, reachable only through the
		// closure of the saved record — recomputed too. THE cause-(3) gate.
		expect(await mirrorRefs(TERM_X)).toEqual([REF_X, REF_Y]);
	}, 30000);

	test('a chain MERGE also recomputes the third record (the expansion is not remove-only)', async () => {
		if (!planted) return;
		// Start SPLIT: {X,Y} and {Z}.
		await setEquivalents(TERM_X, [TERM_Y]);
		await setEquivalents(TERM_Y, []);
		await setEquivalents(TERM_Z, []);
		for (const termId of TERMS) {
			await sql.unsafe(
				`UPDATE matrix_hierarchy SET relation = relation - $1 WHERE section_tipo = 'on1' AND section_id = $2`,
				[EQ_MIRROR, termId],
			);
		}
		await converge();
		expect(await mirrorRefs(TERM_X)).toEqual([REF_X, REF_Y]);
		expect(await mirrorRefs(TERM_Z)).toEqual([REF_Z]);

		// Add Y—Z at Y: the two classes merge into one.
		const result = await saveComponentData({
			componentTipo: EQ_PEER,
			sectionTipo: 'on1',
			sectionId: TERM_Y,
			lang: 'lg-nolan',
			changedData: [
				{
					action: 'set_data',
					key: 0,
					value: [
						{
							id: 1,
							type: 'dd47',
							type_rel: 'dd621',
							section_id: String(TERM_Z),
							section_tipo: 'on1',
							from_component_tipo: EQ_PEER,
						},
					],
				},
			],
			userId: -1,
		});
		expect(result.ok).toBe(true);
		// X is not in the saved bag either — only in the closure. Without the
		// expansion it keeps the stale 2-member view.
		expect(await mirrorRefs(TERM_X)).toEqual([REF_X, REF_Y, REF_Z]);
		expect(await mirrorRefs(TERM_Y)).toEqual([REF_X, REF_Y, REF_Z]);
		expect(await mirrorRefs(TERM_Z)).toEqual([REF_X, REF_Y, REF_Z]);
	}, 30000);

	test('a legitimate removal is mirrored WITHOUT any shrink refusal', async () => {
		if (!planted) return;
		await resetToFullChain();
		const refusedBefore = getCounters().observers_shrink_refused_degraded_seed ?? 0;
		await saveComponentData({
			componentTipo: EQ_PEER,
			sectionTipo: 'on1',
			sectionId: TERM_Y,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', key: 0, value: [] }],
			userId: -1,
		});
		// The seed is clean, so nothing withholds the drop — cause (2).
		expect((getCounters().observers_shrink_refused_degraded_seed ?? 0) - refusedBefore).toBe(0);
		expect(await mirrorRefs(TERM_X)).toEqual([REF_X, REF_Y]);
	}, 30000);

	test('the removal is AUDITED: every recomputed member gets a TM row', async () => {
		if (!planted) return;
		await resetToFullChain();
		const before = (await sql.unsafe(
			`SELECT count(*)::int AS c FROM matrix_time_machine WHERE tipo = $1`,
			[EQ_MIRROR],
		)) as { c: number }[];
		await saveComponentData({
			componentTipo: EQ_PEER,
			sectionTipo: 'on1',
			sectionId: TERM_Y,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', key: 0, value: [] }],
			userId: -1,
		});
		const after = (await sql.unsafe(
			`SELECT DISTINCT section_id FROM matrix_time_machine WHERE tipo = $1`,
			[EQ_MIRROR],
		)) as { section_id: number }[];
		// A silent recompute is not acceptable on a value users read.
		expect((before[0]?.c ?? 0) > 0 || after.length > 0).toBe(true);
		expect(after.map((row) => Number(row.section_id)).sort((a, b) => a - b)).toEqual(TERMS);
	}, 30000);
});

// ---------------------------------------------------------------------------
// Static pins — the guard order and the lock order cannot silently regress.
// ---------------------------------------------------------------------------

describe('equivalence expansion (static pins)', () => {
	test('the cheapest test gates the walk: data_from_field BEFORE model/typeRel resolution', () => {
		// An edge with no data_from_field (hierarchy93 ← rsc387 is the live
		// example) must pay NOTHING — not "resolve the model, then find an empty
		// closure". Ordering is the whole cost story: this branch runs on every
		// covered save in the install.
		const dffTest = kernelSource.indexOf('dataFromField.includes(observedTipo)');
		const modelResolve = kernelSource.indexOf('const observedModel = await getModelByTipo(');
		expect(dffTest).toBeGreaterThan(0);
		expect(modelResolve).toBeGreaterThan(dffTest);
		// And the walk itself is gated on the SAME dispatch getStoredWithReferences
		// uses, so a dd620 or non-related peer skips it instead of computing empty.
		expect(kernelSource).toContain("observedModel === 'component_relation_related'");
		expect(kernelSource).toContain('RELATED_MULTIDIRECTIONAL');
	});

	test('targets are sorted before the recompute loop, with a total comparator', () => {
		// Each recompute takes the target row's FOR UPDATE lock, and
		// withTransaction JOINS an ambient tx, so the locks accumulate to the
		// outer COMMIT. With class expansion one save can lock every member, so
		// the order it takes them in matters.
		//
		// This pins the ordering of the EXPANDED SET only — it is deliberately
		// NOT a claim of global lock order: the saving record's own FOR UPDATE is
		// taken earlier, outside this set, and a residual window remains (see the
		// kernel comment's HONEST LIMIT note). Do not "strengthen" this test into
		// asserting something the code does not do.
		const sortAt = kernelSource.indexOf('observableTargets.sort(');
		const loopAt = kernelSource.indexOf('for (const target of observableTargets)');
		expect(sortAt).toBeGreaterThan(0);
		expect(loopAt).toBeGreaterThan(sortAt);
		// A non-numeric section_id must not yield NaN (implementation-defined
		// order); the comparator falls back to a string compare.
		expect(kernelSource.slice(sortAt, loopAt)).toContain('Number.isFinite(left)');
	});

	test('a degenerate class is reported but never refused', () => {
		// Refusing a wide class would re-create exactly the staleness the
		// expansion exists to remove — it is a signal, not a gate.
		expect(kernelSource).toContain("incrementCounter('observers_equivalence_class_wide')");
		expect(kernelSource).toContain('EQUIVALENCE_CLASS_WIDE');
	});
});
