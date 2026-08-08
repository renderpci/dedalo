/**
 * The dd1758 diffusion ledger (logDiffusionActivity) and the pending-retry
 * loop (retryPendingDiffusion), against the SCRATCH `zzd` diffusion ontology
 * (test/helpers/zzd_diffusion_fixture.ts) — the live numisdata elements in
 * this database resolve type 'unknown', so a retry bound to them never reaches
 * the sql branch at all.
 *
 * ISOLATION. DIFFUSION_ACTIVITY_TABLE is pinned (before the module import,
 * where the const is computed) to a table private to this file and its twin
 * diffusion_delete_outcomes_native.test.ts. This matters more here than
 * anywhere else: retryPendingDiffusion's SELECT is UNFILTERED — it re-runs
 * EVERY pending row of the table it is pointed at, and would otherwise both
 * flip foreign rows and make `total`/ordering assertions satisfiable by rows
 * this file never wrote.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { virtualDateNow } from '../../src/core/section/record/create_record.ts';
import {
	countZzdOntology,
	dropZzdOntology,
	SQL_KEY_ONE,
	SQL_KEY_TWO,
	SQL_SECTION,
	seedZzdOntology,
} from '../helpers/zzd_diffusion_fixture.ts';

const SCRATCH_ACTIVITY_TABLE = 'dedalo_ts_test_zzd_activity';
process.env.DIFFUSION_ACTIVITY_TABLE = SCRATCH_ACTIVITY_TABLE;

const {
	DIFFUSION_ACTION,
	DIFFUSION_ACTIVITY_TABLE,
	deleteDiffusionRecord,
	logDiffusionActivity,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
	retryPendingDiffusion,
} = await import('../../src/core/diffusion_bridge/diffusion_delete.ts');
if (DIFFUSION_ACTIVITY_TABLE !== SCRATCH_ACTIVITY_TABLE) {
	throw new Error(
		`activity-table seam not applied (got '${DIFFUSION_ACTIVITY_TABLE}') — diffusion_delete.ts was imported before the override`,
	);
}

/** Marker written into dd1765 by the rows this file inserts by hand. */
const RAW_MARKER = 'zzd_raw_probe';

interface LedgerRow {
	section_id: number;
	relation: Record<string, unknown>;
	string: Record<string, unknown>;
	date: Record<string, unknown>;
	number: Record<string, unknown>;
	misc: Record<string, unknown>;
}

async function ledgerRows(where: string, params: unknown[] = []): Promise<LedgerRow[]> {
	return (await sql.unsafe(
		`SELECT section_id, relation, string, date, number, misc
		 FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758' AND ${where}
		 ORDER BY section_id ASC`,
		params,
	)) as LedgerRow[];
}

/** Every pending (action 3) row currently visible to retryPendingDiffusion. */
async function pendingRowCount(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND relation @> '{"dd1767":[{"section_id":"3","section_tipo":"dd1774"}]}'::jsonb`,
	)) as { n: number }[];
	return rows[0]?.n ?? -1;
}

/** Drop this file's rows: the scratch id range plus the hand-written probes. */
async function purgeScratchActivityRows(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND ( (relation->'dd1763'->0->>'section_id') ~ '^932[0-9]{3}$'
		      OR string->'dd1765'->0->>'value' = $1 )`,
		[RAW_MARKER],
	);
}

beforeAll(async () => {
	// materialize the private table through the module's own bootstrap
	await retryPendingDiffusion(1);
	const { preCount } = await seedZzdOntology();
	expect(preCount).toBe(0);
});

beforeEach(async () => {
	await purgeScratchActivityRows();
	// The retry loop is unfiltered: assertions on `total` are only honest when
	// the table holds nothing but this test's rows. Fail loud if it does not.
	expect(await pendingRowCount()).toBe(0);
});

afterEach(() => {
	resetNativeDiffusionSqlDeleteForTests();
});

afterAll(async () => {
	resetNativeDiffusionSqlDeleteForTests();
	await purgeScratchActivityRows();
	const residue = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_ACTIVITY_TABLE}"
		 WHERE section_tipo = 'dd1758'
		   AND ( (relation->'dd1763'->0->>'section_id') ~ '^932[0-9]{3}$'
		      OR string->'dd1765'->0->>'value' = $1 )`,
		[RAW_MARKER],
	)) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
	await dropZzdOntology();
	expect(await countZzdOntology()).toBe(0);
});

describe('logDiffusionActivity — the dd1758 row shape', () => {
	test('every column of a fully populated row', async () => {
		const now = new Date(2026, 2, 4, 5, 6, 7); // fixed instant → exact dd1761
		await logDiffusionActivity({
			sectionTipo: 'zzd9',
			sectionId: 932030,
			elementTipo: 'numisdata29',
			action: DIFFUSION_ACTION.unpublishPending,
			userId: 5,
			now,
		});

		const rows = await ledgerRows(`relation->'dd1763'->0->>'section_id' = '932030'`);
		expect(rows.length).toBe(1);
		const row = rows[0] as LedgerRow;
		expect(row.relation).toEqual({
			dd1763: [
				{
					type: 'dd151',
					section_id: '932030', // STRING (locator convention), not the number
					section_tipo: 'zzd9',
					from_component_tipo: 'dd1763',
				},
			],
			dd1767: [
				{
					type: 'dd151',
					section_id: '3',
					section_tipo: 'dd1774',
					from_component_tipo: 'dd1767',
				},
			],
			dd1762: [
				{
					type: 'dd151',
					section_id: '5',
					section_tipo: 'dd128',
					from_component_tipo: 'dd1762',
				},
			],
			// element tipo split into the ontology-node-as-record locator
			dd1766: [
				{
					type: 'dd151',
					section_id: '29',
					section_tipo: 'numisdata0',
					from_component_tipo: 'dd1766',
				},
			],
		});
		expect(row.string).toEqual({ dd1765: [{ lang: 'lg-nolan', value: 'zzd9' }] });
		expect(row.number).toEqual({ dd1764: [{ value: 932030 }] }); // NUMBER, not string
		expect(row.date).toEqual({ dd1761: [{ start: virtualDateNow(now) }] });
		expect(row.misc).toEqual({});
	});

	test('the dd1766 element locator: tld split, no key on a miss, row still written', async () => {
		const cases: [string, number, unknown][] = [
			[
				'dd1',
				932031,
				[{ type: 'dd151', section_id: '1', section_tipo: 'dd0', from_component_tipo: 'dd1766' }],
			],
			['zz1a2', 932032, undefined], // regex miss (digits then letters) → NO key
		];
		for (const [elementTipo, sectionId, expected] of cases) {
			await logDiffusionActivity({
				sectionTipo: 'zzd9',
				sectionId,
				elementTipo,
				action: DIFFUSION_ACTION.unpublished,
			});
			const rows = await ledgerRows(
				`relation->'dd1763'->0->>'section_id' = '${String(sectionId)}'`,
			);
			expect(rows.length).toBe(1); // the row is written either way
			expect((rows[0] as LedgerRow).relation.dd1766).toEqual(expected);
		}

		// elementTipo null → same: row written, no dd1766
		await logDiffusionActivity({
			sectionTipo: 'zzd9',
			sectionId: 932033,
			elementTipo: null,
			action: DIFFUSION_ACTION.published,
		});
		const rows = await ledgerRows(`relation->'dd1763'->0->>'section_id' = '932033'`);
		expect(rows.length).toBe(1);
		expect((rows[0] as LedgerRow).relation.dd1766).toBeUndefined();
		expect((rows[0] as LedgerRow).relation.dd1767).toEqual([
			{ type: 'dd151', section_id: '1', section_tipo: 'dd1774', from_component_tipo: 'dd1767' },
		]);
	});

	test('dd1762 is OMITTED for a falsy user id — never a fabricated actor', async () => {
		for (const [sectionId, userId] of [
			[932034, undefined],
			[932035, 0],
		] as [number, number | undefined][]) {
			await logDiffusionActivity({
				sectionTipo: 'zzd9',
				sectionId,
				elementTipo: 'zzd1',
				action: DIFFUSION_ACTION.unpublishPending,
				userId,
			});
			const rows = await ledgerRows(
				`relation->'dd1763'->0->>'section_id' = '${String(sectionId)}'`,
			);
			expect(rows.length).toBe(1);
			expect((rows[0] as LedgerRow).relation.dd1762).toBeUndefined();
		}
	});
});

describe('retryPendingDiffusion', () => {
	/** Seed pending rows for one record through the real delete path. */
	async function seedPending(sectionId: number): Promise<void> {
		registerNativeDiffusionSqlDelete(async () => ({ deleted: [], errors: ['zzd outage'] }));
		const outcome = await deleteDiffusionRecord(SQL_SECTION, sectionId, true, 77);
		expect(outcome.deleted).toEqual([]);
		expect(outcome.pending.sort()).toEqual([SQL_KEY_ONE, SQL_KEY_TWO].sort());
		resetNativeDiffusionSqlDeleteForTests();
	}

	async function actionsOf(sectionId: number): Promise<string[]> {
		const rows = await ledgerRows(`relation->'dd1763'->0->>'section_id' = '${String(sectionId)}'`);
		return rows.map((row) => {
			const locator = (row.relation.dd1767 as { section_id: string }[])[0];
			return locator?.section_id ?? '';
		});
	}

	test('DIFFU-08: a retry that confirms nothing leaves the rows pending', async () => {
		await seedPending(932040);
		expect(await actionsOf(932040)).toEqual(['3', '3']);

		let calls = 0;
		registerNativeDiffusionSqlDelete(async () => {
			calls++;
			return { deleted: [], errors: ['still down'] };
		});
		const result = await retryPendingDiffusion(10);

		expect(result).toEqual({ total: 2, retried: 0, remaining: 2 });
		expect(calls).toBe(2); // one re-run per pending row
		expect(await actionsOf(932040)).toEqual(['3', '3']); // NOT flipped
		// the retry drives logActivity=false — no second generation of rows
		expect(await pendingRowCount()).toBe(2);
	});

	test('a retry that confirms targets flips the pending rows in place', async () => {
		await seedPending(932041);
		registerNativeDiffusionSqlDelete(async (targets) => ({
			deleted: targets.map((target) => `${target.database_name}|${target.table_name}`),
			errors: [],
		}));

		const result = await retryPendingDiffusion(10);

		expect(result).toEqual({ total: 2, retried: 2, remaining: 0 });
		expect(await actionsOf(932041)).toEqual(['2', '2']); // unpublished
		expect(await pendingRowCount()).toBe(0);
	});

	test('a pending row with no resolvable record locator is counted, never retried', async () => {
		// dd1763 carries a section_tipo but NO section_id: without the null guard
		// this would drive a real delete of section_id 0.
		await sql.unsafe(
			`INSERT INTO "${DIFFUSION_ACTIVITY_TABLE}" (section_tipo, relation, string, date, number, misc)
			 VALUES ('dd1758',
			   '{"dd1763":[{"type":"dd151","section_tipo":"${SQL_SECTION}","from_component_tipo":"dd1763"}],
			     "dd1767":[{"type":"dd151","section_id":"3","section_tipo":"dd1774","from_component_tipo":"dd1767"}]}'::jsonb,
			   $1::text::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
			[JSON.stringify({ dd1765: [{ lang: 'lg-nolan', value: RAW_MARKER }] })],
		);
		const before = await ledgerRows(`string->'dd1765'->0->>'value' = $1`, [RAW_MARKER]);
		expect(before.length).toBe(1);

		let calls = 0;
		registerNativeDiffusionSqlDelete(async () => {
			calls++;
			return { deleted: [SQL_KEY_ONE, SQL_KEY_TWO], errors: [] };
		});
		const result = await retryPendingDiffusion(10);

		expect(result).toEqual({ total: 1, retried: 0, remaining: 1 });
		expect(calls).toBe(0); // the executor is never consulted
		const after = await ledgerRows(`string->'dd1765'->0->>'value' = $1`, [RAW_MARKER]);
		expect(after).toEqual(before); // row byte-identical
	});

	test('the limit clamps the batch and the OLDEST pending rows go first', async () => {
		await seedPending(932042);
		await seedPending(932043);
		const all = await ledgerRows(`relation->'dd1763'->0->>'section_id' IN ('932042','932043')`);
		expect(all.length).toBe(4);
		const oldest = all.slice(0, 2).map((row) => row.section_id);

		registerNativeDiffusionSqlDelete(async (targets) => ({
			deleted: targets.map((target) => `${target.database_name}|${target.table_name}`),
			errors: [],
		}));
		const result = await retryPendingDiffusion(2);

		expect(result).toEqual({ total: 2, retried: 2, remaining: 0 });
		// exactly the two lowest-id (oldest) rows flipped; the newer pair waits
		expect(await actionsOf(932042)).toEqual(['2', '2']);
		expect(await actionsOf(932043)).toEqual(['3', '3']);
		expect(oldest).toEqual(
			(await ledgerRows(`relation->'dd1767'->0->>'section_id' = '2'`)).map((row) => row.section_id),
		);
		// a second pass with the same limit drains the rest
		expect(await retryPendingDiffusion(2)).toEqual({ total: 2, retried: 2, remaining: 0 });
		expect(await actionsOf(932043)).toEqual(['2', '2']);
	});

	test('a limit below 1 is clamped to a single row (never LIMIT 0 / a SQL error)', async () => {
		await seedPending(932044);
		registerNativeDiffusionSqlDelete(async (targets) => ({
			deleted: targets.map((target) => `${target.database_name}|${target.table_name}`),
			errors: [],
		}));

		expect(await retryPendingDiffusion(0)).toEqual({ total: 1, retried: 1, remaining: 0 });
		expect((await actionsOf(932044)).sort()).toEqual(['2', '3']);
	});
});
