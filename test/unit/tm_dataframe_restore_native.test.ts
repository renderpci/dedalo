/**
 * TIME-MACHINE RESTORE OF A DATAFRAME-PAIRED COMPONENT (audit 2026-08 §5.6).
 *
 * A main component that carries a `component_dataframe` slot stores its frames
 * in a SEPARATE relation key (`relation[<slot tipo>]`), paired to individual
 * main items by `id_key → id`. Restoring only the main column therefore left
 * the record in a state it was NEVER in: `oh24` (Informants) reverted while
 * `oh115` (Role) kept TODAY's frames, and frames whose `id_key` no longer
 * matched any live main item became permanent ORPHANS — the record claimed
 * informants carrying another version's roles.
 *
 * PHP restored/wiped the frames FIRST (tool_time_machine::apply_value :277-333
 * → component_dataframe::set_time_machine_data, which empties the slot then
 * replays the snapshot's frames without its own TM row).
 *
 * THE INVARIANT THIS FILE GATES (stated once, asserted mechanically below):
 *   after a component restore, every dataframe frame stored on the record for
 *   that main component pairs with a LIVE item of the restored main value,
 *   and the frame set equals the snapshot's frame set exactly.
 *
 * Scratch hygiene: a fresh `oh1` twin (counter-minted id) seeded by raw SQL,
 * swept with its TM rows and the dd542 activity rows the restore appends.
 * The `oh24`/`oh115` pair is REAL ontology in the suite DB; no record of the
 * live archive is touched.
 */
// BINDS INSTALL TLDs: ds, oh, on, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';
import {
	DataframeRestoreError,
	planDataframeRestore,
} from '../../tools/tool_time_machine/server/dataframe_restore.ts';
import { removedLocators } from '../../tools/tool_time_machine/server/restore_common.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import {
	seedTermChainIfAbsent,
	sweepSeedTermReferencerResidue,
	sweepTermChain,
	type TermSeedHandle,
} from '../helpers/observer_term_seed.ts';
import { refusalOf } from '../helpers/refusal.ts';

const SECTION = 'oh1';
const TABLE = 'matrix';
const MAIN = 'oh24'; // component_portal 'Informants'
const SLOT = 'oh115'; // its component_dataframe 'Role'

/** The value the snapshot holds — two main items, one frame each. */
const MAIN_A = [
	{ id: 1, type: 'dd151', section_id: '501', section_tipo: 'rsc197', from_component_tipo: MAIN },
	{ id: 2, type: 'dd151', section_id: '502', section_tipo: 'rsc197', from_component_tipo: MAIN },
];
const FRAMES_A = [
	{
		id: 1,
		type: 'dd490',
		id_key: 1,
		section_id: '2',
		section_tipo: 'ds1',
		from_component_tipo: SLOT,
		main_component_tipo: MAIN,
	},
	{
		id: 2,
		type: 'dd490',
		id_key: 2,
		section_id: '3',
		section_tipo: 'ds1',
		from_component_tipo: SLOT,
		main_component_tipo: MAIN,
	},
];

/**
 * The SAME snapshot as it must be STORED after a restore: the fixtures above
 * carry the historical string-form addresses on purpose (that is what a
 * pre-sweep TM row holds), and the restore door converges them on the canonical
 * int form (WC-2026-08-10-section-id-int-canonical, D6.2). Asserting against
 * these twins gates the convergence — main AND frames, since a frame's
 * section_id is a stored record address too.
 */
const intAddresses = <T extends Record<string, unknown>>(items: T[]): T[] =>
	items.map((item) => ({ ...item, section_id: Number(item.section_id) }));
const MAIN_A_STORED = intAddresses(MAIN_A);
const FRAMES_A_STORED = intAddresses(FRAMES_A);

/** TODAY's value — one main item, and a frame paired to an item that the
 * restore removes (`id_key: 9`): the orphan the old restore left behind. */
const MAIN_B = [
	{ id: 1, type: 'dd151', section_id: '901', section_tipo: 'rsc197', from_component_tipo: MAIN },
];
const FRAMES_B = [
	{
		id: 1,
		type: 'dd490',
		id_key: 1,
		section_id: '77',
		section_tipo: 'ds1',
		from_component_tipo: SLOT,
		main_component_tipo: MAIN,
	},
	{
		id: 9,
		type: 'dd490',
		id_key: 9,
		section_id: '88',
		section_tipo: 'ds1',
		from_component_tipo: SLOT,
		main_component_tipo: MAIN,
	},
];

const twins: number[] = [];

async function context(options: Record<string, unknown>) {
	return {
		principal: await resolvePrincipal(-1),
		userId: -1,
		options,
		background: false,
	};
}

/**
 * A scratch oh1 twin holding MAIN_B and (unless `liveFrames` is false)
 * FRAMES_B, plus a TM row for `MAIN` carrying `snapshot`.
 */
async function makeTwin(
	snapshot: unknown[],
	liveFrames = true,
): Promise<{ recordId: number; tmRowId: number }> {
	const recordId = await createSectionRecord(SECTION, -1);
	twins.push(recordId);
	await sql.unsafe(
		`UPDATE ${TABLE}
		 SET relation = COALESCE(relation, '{}'::jsonb) || $3::text::jsonb
		 WHERE section_tipo = $1 AND section_id = $2`,
		[
			SECTION,
			recordId,
			JSON.stringify(liveFrames ? { [MAIN]: MAIN_B, [SLOT]: FRAMES_B } : { [MAIN]: MAIN_B }),
		],
	);
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-01 10:00:00', -1, $4::text::jsonb)
		 RETURNING id`,
		[recordId, SECTION, MAIN, JSON.stringify(snapshot)],
	)) as { id: number }[];
	return { recordId, tmRowId: rows[0]?.id ?? 0 };
}

async function storedKey(recordId: number, key: string): Promise<unknown> {
	const record = await readMatrixRecord(TABLE, SECTION, recordId);
	const relation = (record?.columns.relation ?? {}) as Record<string, unknown>;
	return relation[key];
}

afterAll(async () => {
	for (const recordId of twins) {
		await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			recordId,
		]);
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${SECTION} AND section_id = ${recordId}`;
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1 AND data->>'section_id' = $2`,
			[SECTION, String(recordId)],
		);
	}
});

describe('apply_value restores the paired dataframe frames', () => {
	let recordId = 0;
	let tmRowId = 0;

	beforeAll(async () => {
		({ recordId, tmRowId } = await makeTwin([...MAIN_A, ...FRAMES_A]));
	});

	test('the main value reverts WITHOUT frames leaking into its column', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId,
				tipo: MAIN,
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.ok).toBe(true);
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_A_STORED);
	});

	test('the frame slot equals the snapshot frames — no survivors from today', async () => {
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_A_STORED);
	});

	test('NO orphan frame survives: every id_key pairs with a live main item', async () => {
		const mainItems = (await storedKey(recordId, MAIN)) as { id?: number }[];
		const frames = ((await storedKey(recordId, SLOT)) ?? []) as { id_key?: number }[];
		const liveIds = new Set(mainItems.map((item) => Number(item.id)));
		expect(frames.length).toBeGreaterThan(0);
		for (const frame of frames) {
			expect(liveIds.has(Number(frame.id_key))).toBe(true);
		}
	});

	test('the fresh TM audit row carries main + frames, so the restore is revertible', async () => {
		const rows = (await sql.unsafe(
			`SELECT data FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND id <> $4
			 ORDER BY id DESC LIMIT 1`,
			[SECTION, recordId, MAIN, tmRowId],
		)) as { data: unknown }[];
		expect(rows[0]?.data).toEqual([...MAIN_A_STORED, ...FRAMES_A_STORED]);
	});

	test('the slot itself gets NO TM row (PHP suppresses it — the main row carries it)', async () => {
		const rows = (await sql.unsafe(
			`SELECT id FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3`,
			[SECTION, recordId, SLOT],
		)) as unknown[];
		expect(rows.length).toBe(0);
	});
});

/**
 * THE FRAMELESS-WIPE GUARD (the destructive half of this change).
 *
 * `save_component.ts` builds a main's TM snapshot from its OWN items and never
 * appends the paired slots' frames (PHP `get_time_machine_data_to_save` :1580
 * did), so EVERY TM row the TS engine has written for a dataframe-paired main
 * is frameless. Replaying PHP's "a slot absent from the snapshot is emptied"
 * contract on such a row DELETES frames that exist in no other row — PHP writes
 * no TM row for a slot (`oh115` has 0 in the live archive against `oh24`'s 172)
 * and the slot-row restore door is itself refused. The pre-fix defect merely
 * left the frames STALE; the wipe is UNRECOVERABLE, so the door refuses.
 *
 * Narrow on purpose: only when the snapshot carries NO frame for ANY planned
 * slot AND a planned slot actually holds live frames. Retire these two tests
 * together with the guard when the capture half lands — never by loosening
 * them.
 */
describe('apply_value refuses a frameless snapshot that would delete live frames', () => {
	let recordId = 0;
	let tmRowId = 0;

	beforeAll(async () => {
		({ recordId, tmRowId } = await makeTwin([...MAIN_A]));
	});

	test('nothing is written — main AND frames stay exactly as they were', async () => {
		const refusal = await refusalOf(
			toolTimeMachineApplyValue(
				await context({
					section_tipo: SECTION,
					section_id: recordId,
					tipo: MAIN,
					lang: 'lg-nolan',
					matrix_id: tmRowId,
				}),
			),
		);
		expect(refusal.code).toBe('engine.uncovered_scope');
		// The slot tipo names the refusal in the LOG line (operator disclosure).
		expect(refusal.message).toContain(SLOT);
		// The whole restore is refused, not partially applied.
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_B);
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_B);
		// And no audit row was minted for a restore that never happened.
		const fresh = (await sql.unsafe(
			`SELECT id FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND id <> $4`,
			[SECTION, recordId, MAIN, tmRowId],
		)) as unknown[];
		expect(fresh.length).toBe(0);
	});
});

describe('apply_value applies a frameless snapshot when the slot is already empty', () => {
	let recordId = 0;
	let tmRowId = 0;

	beforeAll(async () => {
		// No live frames ⇒ nothing to lose ⇒ PHP's contract stands unguarded.
		({ recordId, tmRowId } = await makeTwin([...MAIN_A], false));
	});

	test('the main restores and the empty slot stays empty (guard is not a blanket)', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId,
				tipo: MAIN,
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.ok).toBe(true);
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_A_STORED);
		expect(await storedKey(recordId, SLOT)).toBeUndefined();
	});
});

/**
 * PHP FIDELITY (Law 3's second half — do NOT throw where the oracle handled a
 * case generically). PHP never inspects a frame's `from_component_tipo` on its
 * own: it loops the slots it discovered and filters the snapshot per slot, so a
 * frame naming a tipo that is not a live dataframe slot of this main matches
 * nothing, restores nowhere, and is stripped out of the main data. An earlier
 * revision refused such a restore, which broke the Phase-6 contract gate
 * `tool_request.test.ts` "apply_value strips dataframe frames from the restored
 * main data" — the measured regression this test now pins on the frame-aware
 * door as well.
 */
describe('apply_value drops a frame naming a tipo that is not a live slot', () => {
	let recordId = 0;
	let tmRowId = 0;
	const FOREIGN = 'oh14'; // component_input_text — a real node, never a slot

	beforeAll(async () => {
		({ recordId, tmRowId } = await makeTwin([
			...MAIN_A,
			...FRAMES_A,
			{ ...FRAMES_A[0], id: 3, from_component_tipo: FOREIGN },
		]));
	});

	test('the restore succeeds; the unplaceable frame lands nowhere', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId,
				tipo: MAIN,
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.ok).toBe(true);
		// Not in the main column (the strip), not in the slot, not in a key of
		// its own — inert, exactly as PHP left it.
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_A_STORED);
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_A_STORED);
		expect(await storedKey(recordId, FOREIGN)).toBeUndefined();
	});
});

/**
 * The plan primitive on its own — the two shapes the doors cannot stage with
 * real ontology (a main with NO slot at all, and a main with TWO).
 */
describe('planDataframeRestore attribution rules', () => {
	test('with no slots in play every frame is inert — no throw (the Phase-6 shape)', async () => {
		const plan = await planDataframeRestore(
			MAIN,
			[
				{ id: 1, lang: 'lg-spa', value: 'MAIN-ONLY' },
				{ type: 'dd490', section_id: 9, section_tipo: 'ds1', from_component_tipo: 'oh14' },
				{ main_component_tipo: MAIN, section_id_key: 1 },
			],
			[],
		);
		expect(plan).toEqual([]);
	});

	test('a legacy frame with SEVERAL slots in play refuses instead of duplicating', async () => {
		// Both are real `component_dataframe` nodes; no main in this ontology
		// declares two, which is why the plan is exercised directly. PHP handed
		// the frame to every slot it looped over — that duplication IS the
		// corruption, so the entry is unattributable and the restore refuses.
		await expect(
			planDataframeRestore(
				MAIN,
				[{ main_component_tipo: MAIN, section_id_key: 1 }],
				[SLOT, 'dd560'],
			),
		).rejects.toThrow(DataframeRestoreError);
	});

	test('a frame naming an UNDISCOVERED real slot adds that slot to the plan', async () => {
		const plan = await planDataframeRestore(MAIN, [...FRAMES_A], []);
		expect(plan).toEqual([{ slotTipo: SLOT, frames: FRAMES_A }]);
	});
});

describe('apply_value refuses to restore a dataframe SLOT row', () => {
	let recordId = 0;
	let tmRowId = 0;

	beforeAll(async () => {
		const twin = await makeTwin([...FRAMES_A]);
		recordId = twin.recordId;
		// Re-point the TM row at the SLOT itself.
		await sql.unsafe(`UPDATE matrix_time_machine SET tipo = $2 WHERE id = $1`, [
			twin.tmRowId,
			SLOT,
		]);
		tmRowId = twin.tmRowId;
	});

	test('a slot restore is denied instead of silently emptying the slot', async () => {
		const refusal = await refusalOf(
			toolTimeMachineApplyValue(
				await context({
					section_tipo: SECTION,
					section_id: recordId,
					tipo: SLOT,
					lang: 'lg-nolan',
					matrix_id: tmRowId,
				}),
			),
		);
		expect(refusal.code).toBe('engine.uncovered_scope');
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_B);
	});
});

describe('bulk_revert_process restores the paired frames too', () => {
	let recordId = 0;
	const BATCH = 987001;
	const mintedBulkIds: number[] = [];

	beforeAll(async () => {
		recordId = await createSectionRecord(SECTION, -1);
		twins.push(recordId);
		await sql.unsafe(
			`UPDATE ${TABLE}
			 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb, $5::text, $6::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, recordId, MAIN, JSON.stringify(MAIN_B), SLOT, JSON.stringify(FRAMES_B)],
		);
		// History (oldest first): the pre-batch value, then the batch write.
		await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
			 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-01 09:00:00', -1, $4::text::jsonb)`,
			[recordId, SECTION, MAIN, JSON.stringify([...MAIN_A, ...FRAMES_A])],
		);
		await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
			 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-02 09:00:00', -1, $4, $5::text::jsonb)`,
			[recordId, SECTION, MAIN, BATCH, JSON.stringify([...MAIN_B, ...FRAMES_B])],
		);
	});

	afterAll(async () => {
		for (const bulkId of mintedBulkIds) {
			await sql`DELETE FROM matrix_notes WHERE section_tipo = 'dd800' AND section_id = ${bulkId}`;
		}
	});

	test('the batch revert restores main AND frames — no orphans left behind', async () => {
		const response = await toolTimeMachineBulkRevert(
			await context({ section_tipo: SECTION, bulk_process_id: BATCH }),
		);
		expect(response.ok).toBe(true);
		const batch = response.data as { skipped: string[]; bulk_process_id?: unknown };
		expect(batch.skipped).toEqual([]);
		if (typeof batch.bulk_process_id === 'number') mintedBulkIds.push(batch.bulk_process_id);
		// PHP's bulk_revert fed the raw snapshot to set_data, which writes frame
		// locators into the MAIN column and leaves the slot at today's values.
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_A_STORED);
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_A_STORED);
	});
});

describe('bulk_revert_process refuses a frameless pre-batch state too', () => {
	let recordId = 0;
	const BATCH = 987002;
	const mintedBulkIds: number[] = [];

	beforeAll(async () => {
		recordId = await createSectionRecord(SECTION, -1);
		twins.push(recordId);
		await sql.unsafe(
			`UPDATE ${TABLE}
			 SET relation = COALESCE(relation, '{}'::jsonb) || $3::text::jsonb
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, recordId, JSON.stringify({ [MAIN]: MAIN_B, [SLOT]: FRAMES_B })],
		);
		// Pre-batch snapshot with NO frames (the shape TS capture writes today).
		await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
			 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-01 09:00:00', -1, $4::text::jsonb)`,
			[recordId, SECTION, MAIN, JSON.stringify([...MAIN_A])],
		);
		await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
			 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-02 09:00:00', -1, $4, $5::text::jsonb)`,
			[recordId, SECTION, MAIN, BATCH, JSON.stringify([...MAIN_B, ...FRAMES_B])],
		);
	});

	afterAll(async () => {
		for (const bulkId of mintedBulkIds) {
			await sql`DELETE FROM matrix_notes WHERE section_tipo = 'dd800' AND section_id = ${bulkId}`;
		}
	});

	test('the row is skipped with a surfaced error and its frames survive', async () => {
		const response = await toolTimeMachineBulkRevert(
			await context({ section_tipo: SECTION, bulk_process_id: BATCH }),
		);
		const skippedBatch = response.data as { skipped: string[]; bulk_process_id?: unknown };
		if (typeof skippedBatch.bulk_process_id === 'number') {
			mintedBulkIds.push(skippedBatch.bulk_process_id);
		}
		expect(skippedBatch.skipped.some((error) => error.includes(`${MAIN}#${recordId}`))).toBe(true);
		expect(await storedKey(recordId, MAIN)).toEqual(MAIN_B);
		expect(await storedKey(recordId, SLOT)).toEqual(FRAMES_B);
	});
});

/**
 * TRIPWIRE for a stated-but-unenforced invariant (audit follow-up).
 *
 * `restore_common.ts removedLocators` re-expresses, byte-for-byte, the
 * `removedItems` closure inside `saveComponentData` (save_component.ts) — the
 * observer cascade's removed-target set. Its header asserts "the two MUST
 * agree" and, until now, NOTHING bound them: a change to the save door's rule
 * would silently diverge the TM write doors' observer propagation. The closure
 * is private to the save body and that file is owned elsewhere, so this gates
 * the invariant BEHAVIOURALLY instead of by extraction: run a real save that
 * drops a locator, and require the save's own `removedItems` to equal what
 * `removedLocators` computes from the same before/after. Retire this test only
 * together with the extraction it is standing in for.
 */
describe('removedLocators agrees with saveComponentData.removedItems', () => {
	let recordId = 0;

	beforeAll(async () => {
		recordId = await createSectionRecord(SECTION, -1);
		twins.push(recordId);
		await sql.unsafe(
			`UPDATE ${TABLE}
			 SET relation = COALESCE(relation, '{}'::jsonb) || $3::text::jsonb
			 WHERE section_tipo = $1 AND section_id = $2`,
			// A MIXED main column (the legacy shape the strip exists for): both
			// halves of the rule then matter — the locator diff AND the dd490
			// exclusion, which only bites on an entry present BEFORE and absent
			// after. A frame-free `before` makes the exclusion unobservable and
			// the gate vacuous; that was checked by mutation, not assumed.
			[SECTION, recordId, JSON.stringify({ [MAIN]: [...MAIN_A, FRAMES_A[0]], [SLOT]: FRAMES_A })],
		);
	});

	test('the same before/after yields the same removal set at both write doors', async () => {
		const before = (await storedKey(recordId, MAIN)) as unknown[];
		expect(before).toHaveLength(3);
		// Drop the second locator AND the frame; keep the first locator.
		const after = [MAIN_A[0]];
		const saved = await saveComponentData({
			componentTipo: MAIN,
			sectionTipo: SECTION,
			sectionId: recordId,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', key: null, value: after }],
			userId: -1,
		});
		expect(saved.ok).toBe(true);
		const doorRemoved = Array.isArray(saved.removedItems) ? saved.removedItems : [];
		// Exactly one removal: the dropped locator. The dropped dd490 frame is a
		// pairing record, not an edge, so it is NOT a removed observer target —
		// and the TM door's copy of the rule must agree exactly.
		expect(doorRemoved).toEqual([MAIN_A[1]]);
		expect(removedLocators(before, after)).toEqual(doorRemoved);
	});
});

/**
 * The observer half (audit P2): PHP restored through `element->save()`, whose
 * last act is `propagate_to_observers()`. The direct-write port skipped it, so
 * a TM restore of an observed component left every mirror at the pre-restore
 * value AND wrote no observer TM audit row.
 *
 * Fixture: hierarchy93 ("who indexes me", on a term) observes rsc387 (the
 * indexer slot on an rsc205 record) — the same pair the observer gates use.
 */
describe('apply_value fires the observer cascade', () => {
	const TERM = { section_tipo: 'on1', section_id: 58 };
	let termSeed: TermSeedHandle = { seededChain: false, seededSectionNode: false };
	let twin = 0;
	let tmRowId = 0;
	let originalBag: unknown = null;
	let baselineTmId = 0;

	async function termMirror(): Promise<unknown> {
		const rows = (await sql.unsafe(
			`SELECT relation->'hierarchy93' AS bag FROM matrix_hierarchy
			 WHERE section_tipo = $1 AND section_id = $2`,
			[TERM.section_tipo, TERM.section_id],
		)) as { bag: unknown }[];
		return rows[0]?.bag ?? null;
	}

	beforeAll(async () => {
		termSeed = await seedTermChainIfAbsent();
		if (termSeed.seededChain) await sweepSeedTermReferencerResidue();
		originalBag = await termMirror();
		twin = await createSectionRecord('rsc205', -1);
		const maxRows = (await sql.unsafe(
			`SELECT COALESCE(MAX(id), 0) AS id FROM matrix_time_machine`,
		)) as { id: number }[];
		baselineTmId = Number(maxRows[0]?.id ?? 0);
		const rows = (await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
			 VALUES ($1, 'rsc205', 'rsc387', 'lg-nolan', '2026-07-01 10:00:00', -1, $2::text::jsonb)
			 RETURNING id`,
			[
				twin,
				JSON.stringify([
					{
						id: 1,
						type: 'dd96',
						section_id: String(TERM.section_id),
						section_tipo: TERM.section_tipo,
						from_component_tipo: 'rsc387',
					},
				]),
			],
		)) as { id: number }[];
		tmRowId = rows[0]?.id ?? 0;
	});

	afterAll(async () => {
		// Restore the term's mirror byte-for-byte, then sweep everything seeded.
		await sql.unsafe(
			`UPDATE matrix_hierarchy
			 SET relation = CASE WHEN $3::text IS NULL
				THEN COALESCE(relation, '{}'::jsonb) - 'hierarchy93'
				ELSE COALESCE(relation, '{}'::jsonb) || jsonb_build_object('hierarchy93', $3::text::jsonb) END
			 WHERE section_tipo = $1 AND section_id = $2`,
			[
				TERM.section_tipo,
				TERM.section_id,
				originalBag === null ? null : JSON.stringify(originalBag),
			],
		);
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${TERM.section_tipo} AND section_id = ${TERM.section_id} AND tipo = 'hierarchy93' AND id > ${baselineTmId}`;
		await sql`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = ${twin}`;
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = ${twin}`;
		await sweepTermChain(termSeed);
	});

	test("the restored locator's target recomputes its mirror and gets a TM audit row", async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: 'rsc205',
				section_id: twin,
				tipo: 'rsc387',
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.ok).toBe(true);

		const bag = ((await termMirror()) ?? []) as { section_tipo?: string; section_id?: string }[];
		expect(
			bag.some(
				(entry) => entry.section_tipo === 'rsc205' && String(entry.section_id) === String(twin),
			),
		).toBe(true);

		const audit = (await sql.unsafe(
			`SELECT id FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = 'hierarchy93' AND id > $3`,
			[TERM.section_tipo, TERM.section_id, baselineTmId],
		)) as unknown[];
		expect(audit.length).toBeGreaterThan(0);
	});
});
