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
 *
 * Plus the SKIP CHANNEL's disclosure law (SEC-16,
 * WC-2026-09-03-bulk-revert-skipped-typed-entries): `data.skipped[]` is typed
 * entries, and a row's
 * coordinates ride one ONLY once the row passed the scope gate — a denied row
 * is counted, never located; a throw from before the gate (planted through
 * `getModelByTipo`, carrying a path-shaped sentinel) yields a `failed` entry
 * with neither coordinates nor the exception text; a throw from AFTER it
 * (planted at `getMatrixTableFromTipo`) yields EXACTLY `{reason:'failed',
 * section_tipo, tipo, section_id}` — located, still wordless; and the positive
 * control, an in-scope row with no pre-batch state, DOES carry its coordinates.
 * DB tier: seeds matrix_time_machine batches + scratch records on the suite
 * database and mocks record_scope / the resolver.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The DB
// drive's component became the phase-2 clone of the install component it used
// (a component_input_text, so the `string` column the revert reads back is
// unchanged). The section carrier was already the generic `test2`, whose test24
// matrix_table relation puts every record in `matrix_test` — which is why
// `liveValues()` reads that table and not `matrix`.

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import * as realResolver from '../../src/core/ontology/resolver.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import {
	type BulkRevertSkipped,
	preBulkState,
	toolTimeMachineBulkRevert,
} from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { mustGet } from '../helpers/assert.ts';
import { refusalOf } from '../helpers/refusal.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const REAL_RECORD_SCOPE = { ...realRecordScope };
const REAL_RESOLVER = { ...realResolver };

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
const COMPONENT_TIPO = 'testmint1002'; // component_input_text (string column)
const LANG = 'lg-spa';
const IDS = [905201, 905202];
/** A third record whose WHOLE history belongs to the batch: no pre-batch state. */
const NO_PRE_ID = 905203;
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
		// The positive control: two batch rows and NOTHING older (preBulkState
		// found:false) — skipped with coordinates, never written.
		await createScratchRecord(SECTION_TIPO, NO_PRE_ID, {
			string: { [COMPONENT_TIPO]: [{ id: 1, lang: LANG, value: `BATCH-${NO_PRE_ID}` }] },
		});
		await insertTm(NO_PRE_ID, `BATCH-A-${NO_PRE_ID}`, BATCH_BULK_ID, '2026-01-02 00:00:00');
		await insertTm(NO_PRE_ID, `BATCH-B-${NO_PRE_ID}`, BATCH_BULK_ID, '2026-01-02 00:00:01');
	});
	/** One TM row per batch write: the batch above holds IDS.length + 2 rows. */
	const BATCH_ROWS = IDS.length + 2;

	afterAll(async () => {
		mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
		mock.module('../../src/core/ontology/resolver.ts', () => REAL_RESOLVER);
		for (const id of [...IDS, NO_PRE_ID]) await cleanScratchRecord(SECTION_TIPO, id);
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
			const batch = response.data as {
				counter: number;
				bulk_process_id: number;
				skipped: BulkRevertSkipped[];
			};
			mintedBulkIds.push(batch.bulk_process_id);
			expect(batch.counter).toBe(0);
			// The per-row refusals are PAYLOAD (`data.skipped`), never the
			// envelope's failure channel — the batch itself did not fail.
			expect(batch.skipped.length).toBe(BATCH_ROWS);
			// SEC-16: a denied row is COUNTED, never LOCATED. The batch row set
			// comes from a TM search with no projects filter and the bulk id is a
			// small integer: the coordinates of records outside the caller's
			// scope are exactly what this channel used to echo.
			for (const entry of batch.skipped) expect(entry).toEqual({ reason: 'out_of_scope' });
			const wire = JSON.stringify(response);
			for (const id of [...IDS, NO_PRE_ID]) expect(wire).not.toContain(String(id));
			expect(wire).not.toContain(COMPONENT_TIPO);
			expect(wire).not.toContain(`"${SECTION_TIPO}"`);
			expect(await liveValues()).toEqual(before);
		} finally {
			mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
		}
	});

	test('a throw from BEFORE the scope gate is a `failed` entry with neither coordinates nor the exception text', async () => {
		// getModelByTipo runs first in the loop, ahead of the gate: a throw there
		// must locate nothing (the row may be another tenant's) and must not
		// carry what threw (Postgres/fs text — here a path-shaped sentinel).
		const sentinel = 'SENTINEL-/srv/secret/relation "matrix_private" does not exist';
		mock.module('../../src/core/ontology/resolver.ts', () => ({
			...REAL_RESOLVER,
			getModelByTipo: async (tipo: string) => {
				if (tipo === COMPONENT_TIPO) throw new Error(sentinel);
				return REAL_RESOLVER.getModelByTipo(tipo);
			},
		}));
		const quiet = console.error;
		console.error = () => {};
		try {
			const before = await liveValues();
			const response = await toolTimeMachineBulkRevert(
				contextOf({ section_tipo: SECTION_TIPO, bulk_process_id: BATCH_BULK_ID }),
			);
			const batch = response.data as {
				counter: number;
				bulk_process_id: number;
				skipped: BulkRevertSkipped[];
			};
			mintedBulkIds.push(batch.bulk_process_id);
			expect(batch.counter).toBe(0);
			expect(batch.skipped.length).toBe(BATCH_ROWS);
			for (const entry of batch.skipped) expect(entry).toEqual({ reason: 'failed' });
			const wire = JSON.stringify(response);
			expect(wire).not.toContain('SENTINEL-');
			expect(wire).not.toContain('/srv/secret');
			for (const id of [...IDS, NO_PRE_ID]) expect(wire).not.toContain(String(id));
			expect(await liveValues()).toEqual(before);
		} finally {
			console.error = quiet;
			mock.module('../../src/core/ontology/resolver.ts', () => REAL_RESOLVER);
		}
	});

	test('a throw from AFTER the scope gate is a `failed` entry WITH coordinates and STILL without the exception text', async () => {
		// The other half of the law: an in-scope row that fails (Postgres/fs text
		// from persistRecordKeys, the transaction, the frame restore…) is located
		// — it is the caller's to see — and STILL carries nothing of what threw.
		// Planted at `getMatrixTableFromTipo`, which runs after both gate halves
		// and after preBulkState (so the no-pre-state control keeps its own
		// reason); the entry is asserted EXACTLY, so a `detail` smuggled onto it
		// through skip()'s log parameter is a red, not a limit.
		const sentinel = 'SENTINEL-/srv/secret/relation "matrix_private" does not exist';
		mock.module('../../src/core/ontology/resolver.ts', () => ({
			...REAL_RESOLVER,
			getMatrixTableFromTipo: async (tipo: string) => {
				if (tipo === SECTION_TIPO) throw new Error(sentinel);
				return REAL_RESOLVER.getMatrixTableFromTipo(tipo);
			},
		}));
		const quiet = console.error;
		console.error = () => {};
		try {
			const before = await liveValues();
			const response = await toolTimeMachineBulkRevert(
				contextOf({ section_tipo: SECTION_TIPO, bulk_process_id: BATCH_BULK_ID }),
			);
			const batch = response.data as {
				counter: number;
				bulk_process_id: number;
				skipped: BulkRevertSkipped[];
			};
			mintedBulkIds.push(batch.bulk_process_id);
			expect(batch.counter).toBe(0);
			expect(batch.skipped.length).toBe(BATCH_ROWS);
			const failed = batch.skipped.filter((entry) => entry.reason === 'failed');
			expect(failed.length).toBe(IDS.length);
			for (const id of IDS) {
				const entry = failed.find((candidate) => candidate.section_id === id);
				expect(entry).toStrictEqual({
					reason: 'failed',
					section_tipo: SECTION_TIPO,
					tipo: COMPONENT_TIPO,
					section_id: id,
				});
			}
			const wire = JSON.stringify(response);
			expect(wire).not.toContain('SENTINEL-');
			expect(wire).not.toContain('/srv/secret');
			expect(wire).not.toContain('matrix_private');
			expect(await liveValues()).toEqual(before);
		} finally {
			console.error = quiet;
			mock.module('../../src/core/ontology/resolver.ts', () => REAL_RESOLVER);
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
		const batch = response.data as {
			counter: number;
			bulk_process_id: number | null;
			skipped: BulkRevertSkipped[];
		};
		expect(batch.counter).toBe(IDS.length);
		const newBulkId = batch.bulk_process_id;
		if (typeof newBulkId === 'number') mintedBulkIds.push(newBulkId);
		// POSITIVE CONTROL for the disclosure law: an IN-SCOPE row that could not
		// be reverted DOES carry its coordinates — the omission above is the
		// gate's doing, not a channel that never locates anything. (One entry
		// per batch ROW, and the control record has two — PHP's loop shape.)
		const located: BulkRevertSkipped = {
			reason: 'no_pre_batch_state',
			section_tipo: SECTION_TIPO,
			tipo: COMPONENT_TIPO,
			section_id: NO_PRE_ID,
		};
		expect(batch.skipped).toEqual([located, located]);

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
