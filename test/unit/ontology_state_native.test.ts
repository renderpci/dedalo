/**
 * ontology_state — inspect / rebuild. TS-NATIVE write-path contract.
 *
 * `dd_ontology` is a projection of `matrix_ontology` (one node per record). The PHP-inherited
 * `regenerate` enforced that by WIPING every node for the TLD and rebuilding, with a leftover
 * `dd_ontology_bk` table as its only, untested, rollback. `ontology_state` keeps the wipe but
 * makes it TRANSACTIONAL, and adds the DIFF that says why you would run one (`inspectOntology`).
 *
 * The incremental `ensureOntology` companion this file also used to gate was removed
 * 2026-08-11 (module header): a transactional rebuild publishes atomically, so every case
 * below is now asserted against `rebuildOntology` — the ONE writer.
 *
 * Scratch: TLD 'zzo'. Its matrix_ontology records are seeded DIRECTLY (section 'zzo0',
 * ontology7=tld, ontology5=term) so each test starts from a known source, independent of the
 * hierarchy provisioning machinery. Everything 'zzo' is swept afterwards.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { inspectOntology, rebuildOntology } from '../../src/core/ontology/ontology_state.ts';

const TLD = 'zzo';
const SECTION = `${TLD}0`; // matrix_ontology section for this tld
const USER_ID = -1;

const drift = (state: Awaited<ReturnType<typeof inspectOntology>>, kind: string) =>
	state.drift.filter((d) => d.kind === kind).map((d) => d.tipo);

async function seedRecord(sectionId: number, term: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			sectionId,
			SECTION,
			JSON.stringify({
				ontology7: [{ id: 1, lang: 'lg-spa', value: TLD }],
				ontology5: [{ id: 1, lang: 'lg-eng', value: term }],
			}),
		],
	);
	await clearOntologyDerivedCaches();
}

async function storedTerm(tipo: string): Promise<string | null> {
	const rows = (await sql.unsafe("SELECT term->>'lg-eng' AS t FROM dd_ontology WHERE tipo = $1", [
		tipo,
	])) as { t: string | null }[];
	return rows[0]?.t ?? null;
}

async function backupTableExists(): Promise<boolean> {
	const rows = (await sql.unsafe("SELECT to_regclass('dd_ontology_bk') AS reg")) as {
		reg: string | null;
	}[];
	return rows[0]?.reg != null;
}

async function sweep(): Promise<void> {
	await deleteTldNodes(TLD);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = 'ontology35' AND string @> $1::text::jsonb`,
		[JSON.stringify({ hierarchy6: [{ value: TLD }] })],
	);
	await clearOntologyDerivedCaches();
}

beforeEach(async () => {
	await sweep();
	await seedRecord(1, 'First');
	await seedRecord(2, 'Second');
});

afterAll(sweep);

describe('inspectOntology', () => {
	test('reports every parsed record as MISSING when dd_ontology is empty', async () => {
		const state = await inspectOntology(TLD);

		expect(state.inSync).toBe(false);
		expect(state.matrixNodes).toBe(2);
		expect(drift(state, 'missing').sort()).toEqual(['zzo1', 'zzo2']);
		expect(state.mainNodeOk).toBe(false);
		// pure read — it created nothing
		expect(state.storedNodes).toBe(0);
	});
});

describe('rebuildOntology', () => {
	test('builds every parsed node + the main node, and becomes in sync', async () => {
		const outcome = await rebuildOntology(TLD, USER_ID);

		expect(outcome.ok).toBe(true);
		expect(outcome.state.inSync).toBe(true);
		expect(outcome.state.mainNodeOk).toBe(true);
		expect(await storedTerm('zzo1')).toBe('First');
		expect(outcome.applied).toContain('rebuilt 2 node(s)');
	});

	test('is idempotent — the second rebuild lands the same projection', async () => {
		await rebuildOntology(TLD, USER_ID);
		const again = await rebuildOntology(TLD, USER_ID);

		expect(again.ok).toBe(true);
		expect(again.state.inSync).toBe(true);
		expect(again.state.storedNodes).toBe(3); // zzo0 (main) + zzo1 + zzo2
		expect(await storedTerm('zzo1')).toBe('First');
	});

	test('re-creates a node deleted out from under it (missing drift)', async () => {
		await rebuildOntology(TLD, USER_ID);
		await sql.unsafe("DELETE FROM dd_ontology WHERE tipo = 'zzo1'");
		await clearOntologyDerivedCaches();

		const before = await inspectOntology(TLD);
		expect(drift(before, 'missing')).toEqual(['zzo1']);

		const outcome = await rebuildOntology(TLD, USER_ID);
		expect(outcome.state.inSync).toBe(true);
		expect(await storedTerm('zzo1')).toBe('First');
	});

	test('drops an ORPHANED node the matrix source no longer produces', async () => {
		await rebuildOntology(TLD, USER_ID);
		// A node with this tld but no backing matrix record (e.g. a record was deleted).
		await upsertDdOntologyNode({
			tipo: 'zzo9',
			parent: null,
			term: { 'lg-eng': 'ghost' },
			model: 'section',
			order_number: null,
			relations: null,
			tld: TLD,
			properties: null,
			model_tipo: null,
			is_model: false,
			is_translatable: false,
			is_main: false,
			propiedades: null,
		});
		await clearOntologyDerivedCaches();

		const before = await inspectOntology(TLD);
		expect(drift(before, 'orphaned')).toEqual(['zzo9']);

		const outcome = await rebuildOntology(TLD, USER_ID);
		expect(outcome.state.inSync).toBe(true);
		expect(drift(outcome.state, 'orphaned')).toEqual([]);
	});

	test('fixes a STALE node when the matrix source changed', async () => {
		await rebuildOntology(TLD, USER_ID);
		// Edit the matrix record without updating dd_ontology (the drift scenario).
		await sql.unsafe(
			`UPDATE matrix_ontology SET string = jsonb_set(string, '{ontology5,0,value}', '"Renamed"')
			 WHERE section_tipo = $1 AND section_id = 1`,
			[SECTION],
		);
		await clearOntologyDerivedCaches();

		const before = await inspectOntology(TLD);
		const stale = before.drift.find((d) => d.tipo === 'zzo1');
		expect(stale?.kind).toBe('stale');
		expect(stale?.diffColumns).toContain('term');

		const outcome = await rebuildOntology(TLD, USER_ID);
		expect(outcome.state.inSync).toBe(true);
		expect(await storedTerm('zzo1')).toBe('Renamed');
	});

	test('re-derives the bootstrap main node — the wipe never leaves the tld rootless', async () => {
		const outcome = await rebuildOntology(TLD, USER_ID);
		// zzo0 is created by the bootstrap, not parsed from a matrix record. deleteTldNodes
		// takes it with the rest, so the rebuild MUST put it back or the tld loses its
		// runtime root.
		expect(outcome.state.mainNodeOk).toBe(true);
		expect(outcome.applied).toContain(`main node ${TLD}0`);

		const again = await rebuildOntology(TLD, USER_ID);
		expect(again.state.mainNodeOk).toBe(true);
	});

	test('rebuilds transactionally and leaves NO backup table behind', async () => {
		await rebuildOntology(TLD, USER_ID);

		const outcome = await rebuildOntology(TLD, USER_ID);

		expect(outcome.ok).toBe(true);
		expect(outcome.state.inSync).toBe(true);
		expect(await storedTerm('zzo1')).toBe('First');
		// The new rebuild uses a transaction, NOT the old fragile dd_ontology_bk protocol.
		expect(await backupTableExists()).toBe(false);
	});
});
