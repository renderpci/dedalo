/**
 * R5 gate: tool_time_machine.bulk_revert_process.
 *
 * preBulkState picks the correct pre-batch snapshot from a component's TM
 * history (id DESC): the row immediately older than EVERY row of the batch, or
 * empty when the batch row was the component's first-ever change. The module
 * registers both actions.
 *
 * Plus (2026-07-28) the DB DRIVE — the ledgered gap: a seeded two-record batch
 * is reverted for real and the live matrix values, the fresh bulk-tagged TM
 * rows and the per-row authorization skip are asserted against the database.
 */
// BINDS INSTALL TLDs: numisdata — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import {
	preBulkState,
	toolTimeMachineBulkRevert,
} from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const REAL_RECORD_SCOPE = { ...realRecordScope };

describe('preBulkState', () => {
	test('returns the row immediately older than the batch row', () => {
		// id DESC: newest first. Batch row (bulk 77) has an older row before it.
		const history = [
			{ bulk_process_id: 88, data: ['newest'] },
			{ bulk_process_id: 77, data: ['the batch change'] },
			{ bulk_process_id: null, data: ['pre-batch value'] },
		];
		expect(preBulkState(history, 77)).toEqual({ data: ['pre-batch value'], found: true });
	});

	test('batch row is the oldest/only row → pre-batch state is empty', () => {
		expect(preBulkState([{ bulk_process_id: 77, data: ['first ever'] }], 77)).toEqual({
			data: [],
			found: true,
		});
	});

	test('bulk id not in history → not found (empty)', () => {
		const history = [{ bulk_process_id: 88, data: ['x'] }];
		expect(preBulkState(history, 77)).toEqual({ data: [], found: false });
	});

	test('a batch that touched the component TWICE still reverts to the PRE-batch value', () => {
		// PHP `continue`s past EVERY row of the batch; taking idx+1 blindly
		// restored a value the batch itself wrote (fixed 2026-07-28).
		const history = [
			{ bulk_process_id: 77, data: ['batch write B'] },
			{ bulk_process_id: 77, data: ['batch write A'] },
			{ bulk_process_id: null, data: ['pre-batch value'] },
		];
		expect(preBulkState(history, 77)).toEqual({ data: ['pre-batch value'], found: true });
	});

	test('ALL history rows belong to the batch (n>1) → no pre-batch state, no write', () => {
		// PHP runs off the end of its inner loop and saves nothing; blanking the
		// component here would be data loss the oracle never performed.
		const history = [
			{ bulk_process_id: 77, data: ['batch B'] },
			{ bulk_process_id: 77, data: ['batch A'] },
		];
		expect(preBulkState(history, 77)).toEqual({ data: [], found: false });
	});

	test('matches on numeric-coerced bulk id (string/number)', () => {
		const history = [
			{ bulk_process_id: 77 as unknown as number, data: ['batch'] },
			{ bulk_process_id: 5, data: ['older'] },
		];
		expect(preBulkState(history, 77).data).toEqual(['older']);
	});
});

describe('tool_time_machine module', () => {
	test('registers apply_value + bulk_revert_process with the right gates', async () => {
		const loaded = await getLoadedTool('tool_time_machine');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['apply_value', 'bulk_revert_process']);
		const bulkRevert = mustGet(actions.bulk_revert_process, 'bulk_revert_process');
		expect(bulkRevert.permission).toBe('section');
		expect(bulkRevert.minLevel).toBe(2);
	});
});

/* ------------------------------------------------------------------ DB drive */

const SECTION_TIPO = 'test2';
const COMPONENT_TIPO = 'numisdata16';
const LANG = 'lg-spa';
const IDS = [905201, 905202];
const BATCH_BULK_ID = 9905201; // synthetic bulk id — no dd800 record needed to READ it
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const mintedBulkIds: number[] = [];

const contextOf = (options: Record<string, unknown>, principal = SUPERUSER): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

async function insertTm(
	sectionId: number,
	value: string,
	bulkProcessId: number | null,
	stamp: string,
): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_time_machine
			(section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text::jsonb)`,
		[
			sectionId,
			SECTION_TIPO,
			COMPONENT_TIPO,
			LANG,
			stamp,
			-1,
			bulkProcessId,
			JSON.stringify([{ id: 1, lang: LANG, value }]),
		],
	);
}

async function liveValues(): Promise<Record<number, unknown>> {
	const rows = (await sql.unsafe(
		`SELECT section_id, string->'${COMPONENT_TIPO}' AS items FROM matrix_test
		 WHERE section_tipo = $1 AND section_id IN (${IDS.join(',')})`,
		[SECTION_TIPO],
	)) as { section_id: number; items: unknown }[];
	const out: Record<number, unknown> = {};
	for (const row of rows) out[Number(row.section_id)] = row.items;
	return out;
}

describe('bulk_revert_process — DB drive', () => {
	beforeAll(async () => {
		for (const id of IDS) {
			// Live value = what the batch wrote.
			await createScratchRecord(SECTION_TIPO, id, {
				string: { [COMPONENT_TIPO]: [{ id: 1, lang: LANG, value: `BATCH-${id}` }] },
			});
			// History, oldest first: the pre-batch value, then the batch write.
			await insertTm(id, `PRE-${id}`, null, '2026-01-01 00:00:00');
			await insertTm(id, `BATCH-${id}`, BATCH_BULK_ID, '2026-01-02 00:00:00');
		}
	});

	afterAll(async () => {
		mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
		for (const id of IDS) await cleanScratchRecord(SECTION_TIPO, id);
		for (const bulkId of mintedBulkIds) {
			await sql`DELETE FROM matrix_notes WHERE section_tipo = 'dd800' AND section_id = ${bulkId}`;
		}
	});

	test('an unknown bulk_process_id is a loud not_found, never a silent success', async () => {
		const refusal = await refusalOf(
			toolTimeMachineBulkRevert(
				contextOf({ section_tipo: SECTION_TIPO, bulk_process_id: 987654321 }),
			),
		);
		expect(refusal.code).toBe('tool.target_not_found');
	});

	test('a missing/invalid bulk_process_id is refused', async () => {
		for (const bad of [{}, { bulk_process_id: 0 }, { bulk_process_id: 'x' }]) {
			const refusal = await refusalOf(
				toolTimeMachineBulkRevert(contextOf({ section_tipo: SECTION_TIPO, ...bad })),
			);
			expect(refusal.code).toBe('request.invalid_options');
		}
	});

	test('an out-of-scope record is SKIPPED with an error, never reverted (SEC-024 §9.4)', async () => {
		// The TM batch search applies no projects filter, so the per-row record
		// gate is the only thing standing between a bulk id and another tenant's
		// records. Deny it and assert nothing moved.
		mock.module('../../src/core/security/record_scope.ts', () => ({
			...REAL_RECORD_SCOPE,
			principalCanAccessRecord: async () => false,
		}));
		try {
			const before = await liveValues();
			const response = await toolTimeMachineBulkRevert(
				contextOf({ section_tipo: SECTION_TIPO, bulk_process_id: BATCH_BULK_ID }),
			);
			const skipped = response.data as { counter: number; skipped: string[] };
			expect(skipped.counter).toBe(0);
			// The per-row refusals are PAYLOAD now (`data.skipped`), never the
			// envelope's failure channel — the batch itself did not fail.
			expect(skipped.skipped.some((error) => error.startsWith('permissions_denied:'))).toBe(true);
			expect(await liveValues()).toEqual(before);
		} finally {
			mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
		}
	});

	test('reverts every component of the batch to its pre-batch value under a NEW bulk id', async () => {
		const response: ToolResponse = await toolTimeMachineBulkRevert(
			contextOf({
				section_tipo: SECTION_TIPO,
				bulk_process_id: BATCH_BULK_ID,
				bulk_revert_process_label: 'gate revert',
			}),
		);
		expect(response.ok).toBe(true);
		const batch = response.data as { counter: number; bulk_process_id: number | null };
		expect(batch.counter).toBe(IDS.length);
		const newBulkId = batch.bulk_process_id;
		if (typeof newBulkId === 'number') mintedBulkIds.push(newBulkId);

		const values = await liveValues();
		for (const id of IDS) {
			expect(values[id]).toEqual([{ id: 1, lang: LANG, value: `PRE-${id}` }]);
		}

		// The revert is itself revertible: one fresh TM row per component, all
		// carrying the NEW bulk id (never the reverted one).
		const fresh = (await sql.unsafe(
			`SELECT section_id, bulk_process_id, data FROM matrix_time_machine
			 WHERE section_tipo = $1 AND tipo = $2 AND section_id IN (${IDS.join(',')})
			   AND bulk_process_id IS NOT DISTINCT FROM $3`,
			[SECTION_TIPO, COMPONENT_TIPO, newBulkId],
		)) as { section_id: number; data: unknown }[];
		expect(fresh.length).toBe(IDS.length);
		expect(JSON.stringify(fresh)).toContain(`PRE-${IDS[0]}`);
	});
});
