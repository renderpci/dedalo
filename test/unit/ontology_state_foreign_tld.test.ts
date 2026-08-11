/**
 * ontology_state — a MISFILED source record (its ontology7 names a DIFFERENT tld) must be
 * DIAGNOSED, never chased. TS-native write-path contract (audit 2026-07 tools, group C).
 *
 * `dd_ontology(tld)` is the projection of `matrix_ontology` section `<tld>0`. The tipo/tld of a
 * node come from the RECORD's own ontology7 value, so a typo there (live: `actv0/127` declares
 * `ontology7="act"`) parses into a node of ANOTHER tld. Before this gate, `parseMatrixNodes(tld)`
 * did not filter by tld while `storedNodes(tld)` read `WHERE tld = $1`, so that node:
 *   (a) could never appear in `stored` → reported `missing` FOREVER (a permanent false failure
 *       naming a phantom node, `act127`, instead of the real culprit record);
 *   (b) was re-upserted by EVERY reconcile run, breaking the module's own idempotency claim;
 *   (c) was written into the OTHER tld's namespace by a per-tld scoped operation, where
 *       `deleteTldNodes(tld)` (rebuild) could never remove it again.
 *
 * The contract pinned here: parse is filtered to the inspected tld; the rejects surface as their
 * own drift kind `foreign` naming the SOURCE RECORD; and the writer touches no byte outside the
 * tld it was asked about.
 *
 * Scratch: tld 'zzc' (source section 'zzc0') + the foreign namespace 'zzd'. Both swept afterwards.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology, rebuildOntology } from '../../src/core/ontology/ontology_state.ts';

const TLD = 'zzc';
const FOREIGN_TLD = 'zzd';
const SECTION = `${TLD}0`;
const USER_ID = -1;

const kinds = (state: Awaited<ReturnType<typeof inspectOntology>>, kind: string) =>
	state.drift.filter((item) => item.kind === kind).map((item) => item.tipo);

/** Seed one matrix_ontology record in section zzc0 declaring `declaredTld` as its ontology7. */
async function seedRecord(sectionId: number, declaredTld: string, term: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			sectionId,
			SECTION,
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-nolan', value: declaredTld }],
				ontology5: [{ id: 1, lang: 'lg-eng', value: term }],
			}),
		],
	);
	await clearOntologyDerivedCaches();
}

/** Pre-seed the `<tld>0` main node so the writer never runs the registry bootstrap (no residue). */
async function seedMainNode(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, tld, model, is_main, term)
		 VALUES ($1, $2, 'section', true, $3::text::jsonb)
		 ON CONFLICT (tipo) DO NOTHING`,
		[SECTION, TLD, JSON.stringify({ 'lg-eng': TLD })],
	);
	await clearOntologyDerivedCaches();
}

async function nodeCount(tld: string): Promise<number> {
	const rows = (await sql.unsafe('SELECT count(*)::int AS n FROM dd_ontology WHERE tld = $1', [
		tld,
	])) as { n: number }[];
	return Number(rows[0]?.n ?? 0);
}

async function sweep(): Promise<void> {
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld IN ($1, $2)', [TLD, FOREIGN_TLD]);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [SECTION]);
	for (const tld of [TLD, FOREIGN_TLD]) {
		await sql.unsafe(
			`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
			[JSON.stringify({ hierarchy6: [{ value: tld }] })],
		);
	}
	await clearOntologyDerivedCaches();
}

beforeEach(async () => {
	await sweep();
	await seedRecord(1, TLD, 'Good node'); // parses to zzc1 — belongs here
	await seedRecord(2, FOREIGN_TLD, 'Misfiled node'); // parses to zzd2 — does NOT
	await seedMainNode();
});

afterAll(sweep);

describe('inspectOntology with a misfiled source record', () => {
	test('never reports the foreign node as MISSING (the unfixable phantom)', async () => {
		const state = await inspectOntology(TLD);

		expect(kinds(state, 'missing')).toEqual(['zzc1']); // the real one, and only it
		expect(kinds(state, 'missing')).not.toContain('zzd2');
	});

	test('surfaces it as its own `foreign` drift naming the SOURCE RECORD', async () => {
		const state = await inspectOntology(TLD);

		const foreign = state.drift.filter((item) => item.kind === 'foreign');
		expect(foreign.length).toBe(1);
		expect(foreign[0]?.tipo).toBe('zzd2');
		expect(foreign[0]?.declaredTld).toBe(FOREIGN_TLD);
		expect(foreign[0]?.source).toBe(`${SECTION}/2`);
		expect(foreign[0]?.diffColumns).toEqual(['tld']);
	});

	test('counts only the tld’s OWN nodes as matrixNodes, the rejects separately', async () => {
		const state = await inspectOntology(TLD);

		expect(state.matrixNodes).toBe(1);
		expect(state.foreignNodes).toBe(1);
		expect(state.inSync).toBe(false); // a misfiled record IS drift — never hidden
	});
});

describe('rebuildOntology with a misfiled source record', () => {
	test('writes NOTHING into the foreign tld’s namespace', async () => {
		await rebuildOntology(TLD, USER_ID);

		expect(await nodeCount(FOREIGN_TLD)).toBe(0);
		expect(await nodeCount(TLD)).toBe(2); // zzc0 main + zzc1
	});

	test('is IDEMPOTENT — the second run lands the same two nodes, not a third', async () => {
		await rebuildOntology(TLD, USER_ID);
		const again = await rebuildOntology(TLD, USER_ID);

		expect(again.applied).toContain('rebuilt 1 node(s)');
		expect(await nodeCount(TLD)).toBe(2);
		expect(await nodeCount(FOREIGN_TLD)).toBe(0);
	});

	test('reports the CULPRIT RECORD, not a phantom missing node', async () => {
		const outcome = await rebuildOntology(TLD, USER_ID);

		expect(outcome.result).toBe(false);
		// Both operator-facing channels name the record — the tool merges errors into the
		// response and prints msg per tld, and neither may say "act127 is missing".
		expect(outcome.errors.join(' | ')).toContain(`${SECTION}/2`);
		expect(outcome.errors.join(' | ')).toContain(`'${FOREIGN_TLD}'`);
		expect(outcome.msg).toContain('declare another tld');
		expect(outcome.errors.join(' ')).not.toContain('missing');
	});

	test('converges the moment the record’s ontology7 is corrected', async () => {
		await rebuildOntology(TLD, USER_ID);
		await sql.unsafe(
			`UPDATE matrix_ontology SET string = jsonb_set(string, '{ontology7,0,value}', $2::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = 2`,
			[SECTION, JSON.stringify(TLD)],
		);
		await clearOntologyDerivedCaches();

		const outcome = await rebuildOntology(TLD, USER_ID);
		expect(outcome.applied).toContain('rebuilt 2 node(s)');
		expect(outcome.state.inSync).toBe(true);
		expect(outcome.result).toBe(true);
		expect(await nodeCount(FOREIGN_TLD)).toBe(0);
	});

	test('rebuilds only its own tld and never seeds the foreign namespace', async () => {
		const outcome = await rebuildOntology(TLD, USER_ID);

		expect(await nodeCount(FOREIGN_TLD)).toBe(0);
		expect(outcome.state.matrixNodes).toBe(1);
		expect(outcome.errors.join(' | ')).toContain(`${SECTION}/2`);
		expect(outcome.result).toBe(false); // honest: the source is still misfiled
		// …but its OWN projection is complete: zzc1 is stored and not stale.
		expect(kinds(outcome.state, 'missing')).toEqual([]);
		expect(kinds(outcome.state, 'stale')).toEqual([]);
	});
});
