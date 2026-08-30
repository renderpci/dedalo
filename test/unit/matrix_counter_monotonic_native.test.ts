/**
 * SECTION_ID PERMANENCE — the behavioural proof (P0-14).
 *
 * `matrix_counter_monotonic_tripwire.test.ts` is a census of SQL SHAPES. This
 * gate proves the thing that actually matters, by driving the real allocator:
 * an id that has been minted once is never minted again, even after the record
 * that held it is gone and even after the counter row itself is destroyed.
 *
 * The audit's repro is the first test, verbatim: create a run of records,
 * delete the tail, and demand that the next create is NOT born at a dead id.
 * Before the fix it was born at exactly the first deleted id and inherited that
 * record's Time Machine history.
 *
 * DB writes ONLY on the matrix_test scratch surface (synthetic `zz` tipo);
 * cleaned before and after.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	countersStatusGetValue,
	widget as countersStatusWidget,
} from '../../src/core/area_maintenance/widgets/counters_status.ts';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import {
	insertMatrixRecordWithCounter,
	insertMatrixRecordWithExplicitId,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../src/core/db/time_machine.ts';
import { isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { TransformRecorder } from '../../src/core/update/transform/report.ts';
import { executeChangesInTipos } from '../../src/core/update/transform/tipos.ts';
import { cleanScratchTipo } from '../helpers/test_data.ts';

/** The widget handler signature takes a principal; the counter actions ignore it. */
const ADMIN = { isGlobalAdmin: true } as unknown as Principal;

/** Drive the maintenance widget's modify_counter exactly as the panel does. */
async function modifyCounter(counterAction: string): Promise<unknown> {
	const handler = countersStatusWidget.apiActions?.modify_counter;
	if (handler === undefined) throw new Error('counters_status has no modify_counter action');
	return handler({ section_tipo: TIPO, counter_action: counterAction }, ADMIN);
}

// A scratch section materialized through the engine's own ontology write path,
// so the maintenance widget resolves it exactly as it resolves a real section.
// It declares the `test24` matrix_table relation (= matrix_test), so the rows
// land on the DISPOSABLE suite table rather than the installation-shaped
// `matrix` — an interrupted run must not strand scratch records where a
// residue sweep of matrix_test would never look for them.
const TLD = 'zzmint';
const TIPO = `${TLD}1`;
const TABLE = 'matrix_test';
/** dd_ontology node of model 'matrix_table' whose term is `matrix_test`. */
const MATRIX_TEST_RELATION = 'test24';

/** Mint one record through the real allocator and return its section_id. */
async function mint(): Promise<number> {
	return insertMatrixRecordWithCounter(TABLE, TIPO, {
		string: { zzcnt2: [{ id: 1, lang: 'lg-nolan', value: 'x' }] },
	});
}

async function deleteRecord(sectionId: number): Promise<void> {
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		TIPO,
		sectionId,
	]);
}

async function counterValue(): Promise<number | null> {
	const rows = (await sql`SELECT value FROM matrix_counter WHERE tipo = ${TIPO}`) as {
		value: number;
	}[];
	return rows[0] === undefined ? null : Number(rows[0].value);
}

describe('section_id permanence (P0-14)', () => {
	beforeAll(async () => {
		await deleteTldNodes(TLD);
		await upsertDdOntologyNode({
			tipo: TIPO,
			model: 'section',
			tld: TLD,
			term: { 'lg-eng': 'Counter permanence scratch section' },
			properties: {},
			relations: [{ tipo: MATRIX_TEST_RELATION }],
		});
	});

	beforeEach(async () => {
		await cleanScratchTipo(TIPO, TABLE);
	});

	afterAll(async () => {
		await cleanScratchTipo(TIPO, TABLE);
		await deleteTldNodes(TLD);
	});

	test("the audit's repro: create, delete the tail, press 'Fix counter'", async () => {
		// FINDINGS.md DATA-07, verbatim in shape: "create 1..100, delete 71..100,
		// press 'Fix counter' (single confirm) -> counter 70 -> the next create is
		// born at 71 -> its TM panel lists the dead record's snapshots."
		const minted: number[] = [];
		for (let i = 0; i < 5; i++) minted.push(await mint());
		expect(minted).toEqual([1, 2, 3, 4, 5]);

		for (const id of [3, 4, 5]) await deleteRecord(id);

		// The operator presses the one button the panel offers for this state.
		await modifyCounter('fix');

		const next = await mint();
		expect(next).toBe(6);
		expect(minted).not.toContain(next);
	});

	test('a DESTROYED counter row still cannot rewind the id space', async () => {
		const minted: number[] = [];
		for (let i = 0; i < 4; i++) minted.push(await mint());

		// The deleted records leave Time Machine history behind — that history is
		// the witness that makes their ids un-mintable even with no counter row.
		for (const id of [3, 4]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}

		// This is exactly the state the removed 'reset' action produced.
		await sql`DELETE FROM matrix_counter WHERE tipo = ${TIPO}`;

		const next = await mint();
		expect(next).toBeGreaterThan(4);
		expect(minted).not.toContain(next);
	});

	test("the widget's 'fix' raises a lagging counter and can never lower one", async () => {
		for (let i = 0; i < 3; i++) await mint();

		// A counter standing AHEAD of the data — the normal state after a tail
		// delete, and the state the old 'fix' silently destroyed.
		await sql`UPDATE matrix_counter SET value = 500 WHERE tipo = ${TIPO}`;
		await modifyCounter('fix');
		expect(await counterValue()).toBe(500);

		// A counter LAGGING the data is the one real defect, and 'fix' repairs it.
		await sql`UPDATE matrix_counter SET value = 1 WHERE tipo = ${TIPO}`;
		await modifyCounter('fix');
		expect(await counterValue()).toBe(3);
	});

	test("'fix' repairs a LAGGING counter to the historical floor, not to live MAX", async () => {
		// THE TRAP this closes (found in adversarial review of the first fix): if the
		// widget raises only to MAX(live section_id) while the allocator's floor also
		// counts the Time Machine witness, then pressing the repair button is STRICTLY
		// WORSE than pressing nothing — the button lands the counter below the highest
		// id ever minted, and the next create is born at a dead record's address.
		const minted: number[] = [];
		for (let i = 0; i < 4; i++) minted.push(await mint());

		// 3 and 4 are deleted but leave Time Machine history behind.
		for (const id of [3, 4]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		// A genuinely LAGGING counter — the one defect 'fix' exists to repair.
		await sql`UPDATE matrix_counter SET value = 1 WHERE tipo = ${TIPO}`;

		await modifyCounter('fix');

		// live MAX is 2; the historical floor is 4. Landing on 2 would re-mint 3.
		expect(await counterValue()).toBe(4);
		const next = await mint();
		expect(next).toBe(5);
		expect(minted).not.toContain(next);
	});

	test("'fix' MATERIALIZES a counter row that is missing entirely", async () => {
		for (let i = 0; i < 3; i++) await mint();
		await sql`DELETE FROM matrix_counter WHERE tipo = ${TIPO}`;
		expect(await counterValue()).toBeNull();

		await modifyCounter('fix');

		// PHP's create branch was inert; materializing the high-water mark is the
		// whole point of the action.
		expect(await counterValue()).toBe(3);
	});

	test('the COLLISION self-heal realigns to the historical floor, not to live MAX', async () => {
		// The allocator's most subtle branch: the counter row EXISTS (so the
		// bootstrap CASE is bypassed entirely) but lags, the allocated id collides
		// with a live row, and the S2-01 self-heal realigns and retries once. If
		// that realign uses live MAX alone it lands inside the dead ids.
		const minted: number[] = [];
		for (let i = 0; i < 4; i++) minted.push(await mint());
		for (const id of [3, 4]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		// Row PRESENT and lagging: next allocation is 2, which collides with the
		// live row 2 and forces the realign branch.
		await sql`UPDATE matrix_counter SET value = 1 WHERE tipo = ${TIPO}`;

		const next = await mint();

		// live MAX is 2, the TM witness carries the floor to 4 → the retry mints 5.
		// A live-max-only realign would mint 3 — a deleted record's address.
		expect(next).toBe(5);
		expect(minted).not.toContain(next);
	});

	test('THE ALREADY-DAMAGED INSTALL is reported as damaged, not as healthy', async () => {
		// The state the OLD consolidate-down button left behind, which this change
		// must not merely stop creating: counter == MAX(live section_id) EXACTLY,
		// with minted ids above it belonging to deleted records. Measured before
		// the fix: the audit row read counter 3 / last_section_id 3 (no drift, no
		// repair offered) and the next mint was born at 4 — a dead id — inheriting
		// its time-machine history.
		for (let i = 0; i < 5; i++) await mint();
		for (const id of [4, 5]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		await sql`UPDATE matrix_counter SET value = 3 WHERE tipo = ${TIPO}`;

		const audit = await countersStatusWidget.getValue?.({}, ADMIN);
		const row = ((audit?.data as { datalist?: Record<string, unknown>[] }).datalist ?? []).find(
			(entry) => entry.section_tipo === TIPO,
		);
		expect(row).toBeDefined();
		// last_section_id alone says "no drift" — the floor is what exposes it.
		expect(Number(row?.last_section_id)).toBe(3);
		expect(Number(row?.floor_value)).toBe(5);
		// This is the client's flag: counter_value < floor_value.
		expect(Number(row?.counter_value) < Number(row?.floor_value)).toBe(true);

		// And the repair the panel now offers actually closes it.
		await modifyCounter('fix');
		expect(await counterValue()).toBe(5);
		expect(await mint()).toBe(6);
	});

	test('repair_all_counters raises an already-damaged counter, and is a no-op twice', async () => {
		for (let i = 0; i < 5; i++) await mint();
		for (const id of [4, 5]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		await sql`UPDATE matrix_counter SET value = 3 WHERE tipo = ${TIPO}`;

		const handler = countersStatusWidget.apiActions?.repair_all_counters;
		if (handler === undefined) throw new Error('counters_status has no repair_all_counters');

		const first = await handler({}, ADMIN);
		expect((first.extend as { repaired?: string[] })?.repaired).toContain(TIPO);
		expect(await counterValue()).toBe(5);

		// Idempotent, and raise-only: a second run must not move a healthy counter.
		await sql`UPDATE matrix_counter SET value = 900 WHERE tipo = ${TIPO}`;
		const second = await handler({}, ADMIN);
		expect((second.extend as { repaired?: string[] })?.repaired).not.toContain(TIPO);
		expect(await counterValue()).toBe(900);
	});

	test('the audit reports the GOVERNING counter, and names a row the allocator does not read', async () => {
		// A stray row in the NON-governing table must not become the reported value.
		// An earlier draft collapsed both tables with MAX(value): a stale high row in
		// the wrong table then read as "healthy" while the governing counter went on
		// lagging — hidden by the one screen built to reveal it.
		await mint();
		await sql`UPDATE matrix_counter SET value = 2 WHERE tipo = ${TIPO}`;
		try {
			await sql`INSERT INTO matrix_counter_dd (tipo, value) VALUES (${TIPO}, 999)`;

			const audit = await countersStatusGetValue();
			const data = audit.data as {
				datalist: Record<string, unknown>[];
				errors: string[];
			};
			const row = data.datalist.find((entry) => entry.section_tipo === TIPO);

			// matrix_test is NOT a '_dd' table, so matrix_counter governs: 2, not 999.
			expect(Number(row?.counter_value)).toBe(2);
			// ...and the stray is REPORTED rather than silently folded in.
			expect(
				data.errors.some((line) => line.includes(TIPO) && line.includes('matrix_counter_dd')),
			).toBe(true);
		} finally {
			await sql`DELETE FROM matrix_counter_dd WHERE tipo = ${TIPO}`;
		}
	});

	test('a section whose records were ALL deleted is flagged, not shown as empty-and-healthy', async () => {
		// The most damaged row an install can carry, and the one an earlier client
		// predicate silently skipped: every record deleted, so live MAX is 0 and the
		// cell renders 'empty', while the time machine still witnesses the ids. The
		// per-row flag must fire — the bulk "Repair all" count already did, so the
		// page was offering to repair a row it was not flagging.
		const minted: number[] = [];
		for (let i = 0; i < 3; i++) minted.push(await mint());
		for (const id of minted) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		await sql`UPDATE matrix_counter SET value = 0 WHERE tipo = ${TIPO}`;

		const audit = await countersStatusGetValue();
		const row = (audit.data as { datalist: Record<string, unknown>[] }).datalist.find(
			(entry) => entry.section_tipo === TIPO,
		);
		expect(Number(row?.last_section_id)).toBe(0); // renders as 'empty'
		expect(Number(row?.floor_value)).toBe(3); // ...but three ids were minted
		expect(Number(row?.counter_value) < Number(row?.floor_value)).toBe(true);

		// and the repair restores the mark, so nothing is re-minted
		await modifyCounter('fix');
		expect(await counterValue()).toBe(3);
		expect(await mint()).toBe(4);
	});

	test('a section on a table the write layer does not recognize is UNVERIFIED, not healthy', async () => {
		// `getMatrixTableFromTipo` admits any safe identifier the ontology names, so
		// a section really can map to a table outside MATRIX_TABLE_ALLOWLIST —
		// `dd489` (matrix_structurations) is such a node on this install. Building
		// the floor for it throws; if that throw were swallowed into `floor_value: 0`
		// the row would render as healthy, hiding a lagging counter on the panel
		// built to reveal it. It must be NAMED instead.
		const ODD = `${TLD}7`;
		try {
			await upsertDdOntologyNode({
				tipo: ODD,
				model: 'section',
				tld: TLD,
				term: { 'lg-eng': 'Section on an unrecognized table' },
				properties: {},
				relations: [{ tipo: 'dd489' }], // matrix_structurations
			});
			await sql`INSERT INTO matrix_counter (tipo, value) VALUES (${ODD}, 7)`;

			const audit = await countersStatusGetValue();
			const data = audit.data as { datalist: Record<string, unknown>[]; errors: string[] };

			// It did not throw, the row is present, and the gap is reported.
			expect(data.datalist.some((entry) => entry.section_tipo === ODD)).toBe(true);
			expect(data.errors.some((line) => line.includes(ODD) && line.includes('UNVERIFIED'))).toBe(
				true,
			);
		} finally {
			await sql`DELETE FROM matrix_counter WHERE tipo = ${ODD}`;
		}
	});

	test('a section whose counter row was DELETED is still audited and repairable', async () => {
		// The state the removed 'reset' action left behind. An audit sourced from the
		// counter tables alone would not list this section AT ALL — flagged by
		// nothing, repaired by nothing, while "Repair all counters" reported that
		// everything was fine.
		const minted: number[] = [];
		for (let i = 0; i < 3; i++) minted.push(await mint());
		await recordTimeMachine(
			{
				sectionTipo: TIPO,
				sectionId: 3,
				componentTipo: TIPO,
				lang: 'lg-nolan',
				userId: 1,
				data: { was: 3 },
			},
			'2026-08-30 12:00:00',
		);
		await sql`DELETE FROM matrix_counter WHERE tipo = ${TIPO}`;

		const audit = await countersStatusGetValue();
		const row = (audit.data as { datalist: Record<string, unknown>[] }).datalist.find(
			(entry) => entry.section_tipo === TIPO,
		);
		expect(row).toBeDefined();
		expect(Number(row?.counter_value)).toBe(0);
		expect(Number(row?.floor_value)).toBe(3);

		const handler = countersStatusWidget.apiActions?.repair_all_counters;
		await handler?.({}, ADMIN);
		expect(await counterValue()).toBe(3);
	});

	test('a floor FAR above the live data is flagged but kept out of the BULK repair', async () => {
		// Real history (the id WAS minted) but an irreversible jump — no writer may
		// lower a counter and 'reset' is gone. Measured motivation: dd128 carries a
		// TM row at section_id 999000777 from an era when fixtures shared a database.
		await mint();
		await recordTimeMachine(
			{
				sectionTipo: TIPO,
				sectionId: 999000777,
				componentTipo: TIPO,
				lang: 'lg-nolan',
				userId: 1,
				data: { stray: true },
			},
			'2026-08-30 12:00:00',
		);

		const audit = await countersStatusGetValue();
		const data = audit.data as { datalist: Record<string, unknown>[]; errors: string[] };
		const row = data.datalist.find((entry) => entry.section_tipo === TIPO);
		expect(Number(row?.floor_value)).toBe(999000777);
		expect(row?.bulk_repair_excluded).toBe(true);
		expect(data.errors.some((line) => line.includes(TIPO) && line.includes('irreversible'))).toBe(
			true,
		);

		// The BULK button must not move it...
		const before = await counterValue();
		const handler = countersStatusWidget.apiActions?.repair_all_counters;
		const result = await handler?.({}, ADMIN);
		expect((result?.extend as { repaired?: string[] })?.repaired).not.toContain(TIPO);
		expect(await counterValue()).toBe(before);

		// ...but the deliberate per-row repair still can.
		await modifyCounter('fix');
		expect(await counterValue()).toBe(999000777);
	});

	test('an EXPLICIT-id create cannot seed a missing counter below the floor', async () => {
		// The sibling allocator door. With the counter row gone (the removed 'reset',
		// a partial restore), an explicit-id create used to seed the row at the
		// explicit id ALONE — and the next counter-driven create then took the
		// EXISTS branch, never consulted the floor, and was born at a dead record's
		// address. No collision could fire: that row was deleted.
		const minted: number[] = [];
		for (let i = 0; i < 4; i++) minted.push(await mint());
		for (const id of [3, 4]) {
			await recordTimeMachine(
				{
					sectionTipo: TIPO,
					sectionId: id,
					componentTipo: TIPO,
					lang: 'lg-nolan',
					userId: 1,
					data: { was: id },
				},
				'2026-08-30 12:00:00',
			);
			await deleteRecord(id);
		}
		await sql`DELETE FROM matrix_counter WHERE tipo = ${TIPO}`;

		// An explicit-id create at a LOW id, with no counter row standing.
		await insertMatrixRecordWithExplicitId(TABLE, TIPO, 2, {}, { onConflict: 'ignore' });

		// The counter it seeded must already stand at the historical floor...
		expect(await counterValue()).toBe(4);
		// ...so the next counter-driven create clears the dead ids.
		const next = await mint();
		expect(next).toBe(5);
		expect(minted).not.toContain(next);
	});

	test('a tipo rename CARRIES the high-water mark to the new tipo', async () => {
		const RENAMED = `${TLD}9`;
		try {
			const minted: number[] = [];
			for (let i = 0; i < 4; i++) minted.push(await mint());
			for (const id of [3, 4]) await deleteRecord(id);

			const recorder = new TransformRecorder(false);
			await executeChangesInTipos(
				[{ old: TIPO, new: RENAMED, type: 'section', perform: ['replace_tipo'] }],
				recorder,
			);
			expect(recorder.errors).toEqual([]);

			// PHP dropped the counter here and let the allocator rebuild it from the
			// LIVE rows — which, after a tail delete, restarts inside the dead ids.
			const carried = (await sql`SELECT value FROM matrix_counter WHERE tipo = ${RENAMED}`) as {
				value: number;
			}[];
			expect(Number(carried[0]?.value)).toBe(4);
		} finally {
			await cleanScratchTipo(RENAMED, TABLE);
		}
	});

	test('an IDENTITY rename entry does not destroy the counter it carries', async () => {
		// A hand-maintained move_tld map routinely lists every tipo of a TLD,
		// including ones that do not move. `{old:X,new:X}` must be a no-op — an
		// unconditional DELETE after a self-upsert would leave the section with
		// records and NO counter, which is the P0-14 defect at another door.
		for (let i = 0; i < 3; i++) await mint();
		await deleteRecord(3);

		const recorder = new TransformRecorder(false);
		await executeChangesInTipos(
			[{ old: TIPO, new: TIPO, type: 'section', perform: ['replace_tipo'] }],
			recorder,
		);

		expect(await counterValue()).toBe(3);
		expect(await mint()).toBe(4);
	});

	test("'reset' is refused and leaves the counter standing", async () => {
		await mint();
		const before = await counterValue();

		let refusal: unknown;
		try {
			await modifyCounter('reset');
		} catch (error) {
			refusal = error;
		}
		// A typed refusal, and the OPERATOR-FACING sentence must say why — this
		// is an admin removing a button they have used for years.
		expect(isDedaloError(refusal)).toBe(true);
		if (isDedaloError(refusal)) {
			expect(refusal.code).toBe('maintenance.action_refused');
			expect(refusal.publicMessage).toMatch(/reset/i);
		}

		expect(await counterValue()).toBe(before);
	});
});
