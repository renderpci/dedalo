/**
 * P1-9 gate (audit 2026-08-26 DATA-30 / DATA-31) — A RESTORE OR REVERT IS
 * ATOMIC, LOCKED FIRST, AND ITSELF REVERTIBLE.
 *
 * THE TWO DOORS. `apply_value` (tool_time_machine.ts) restores ONE component
 * from one Time Machine row; `bulk_revert_process` (bulk_revert.ts) restores
 * EVERY component a dd800 batch touched to its pre-batch value and stamps the
 * restores with a NEW dd800 id. Both are read-modify-writes of a record row
 * that also replay dataframe FRAMES into the paired slots. Every row of a main
 * is COMPOSED (decision 2026-09-28: PHP-era rows always were; TS-era beta rows
 * are unsupported), so a row with no frame MEANS "no frames at that time".
 *
 * DATA-30 (the interleave). The pre-restore read used to run BEFORE the door's
 * transaction opened, and `bulk_revert` locked the row only for lang-sliced
 * models: a frame COMMITTED between the read and the door's write was handled
 * by a plan built from a stale view, with `ok:true` to both sides. Nothing
 * single-threaded can see that; it exists only BETWEEN two connections. So this gate drives two and lets POSTGRES be the
 * clock (modelled on `delete_inverse_lost_update_native`):
 *
 *   T2 (the curator) opens a transaction, inserts an ordinary dataframe frame
 *   into the SLOT through `saveComponentData` — which takes the record's
 *   `FOR UPDATE` row lock — and is HELD OPEN.
 *   T1 (the operator) then runs the door. It must WAIT on T2's lock, and the
 *   gate polls `pg_blocking_pids` until it provably does; only then is T2
 *   released, so the frame lands strictly INSIDE the door's read→write window.
 *
 * With the lock taken first, T1 plans over the committed frame: apply_value (a
 * deliberate restore of ONE row) serializes after the curator and leaves exactly
 * the row's state — the frame emptied, its own composed row recording that, the
 * curator's composed row keeping the frame in history; both bulk-revert paths
 * see a unit the run did not leave and refuse it `changed_since_run`, the frame
 * surviving. The interleave itself is asserted (a run where T1 never waited on
 * T2 is RED, never quietly green).
 *
 * DATA-31 (atomicity of the failure). Faults are injected into the DATABASE,
 * never into the module graph: `mock.module` is process-global and
 * `mock.restore()` does not revert it (bulk_process_id_tripwire re-installs
 * exports by hand for exactly that reason), so two scratch BEFORE INSERT
 * triggers do the work instead, created here and dropped in `afterAll`:
 *   - on `matrix_notes` (where dd800 lives): a dd800 row whose
 *     `data.created_by_user_id` is this gate's SCRATCH USER is refused. A
 *     `bulk_revert` run as that user cannot mint the dd800 it would be undone
 *     by, and must therefore NOT START (`tool.action_failed`): no dd800 row,
 *     no TM row, live values byte-identical. Root's mints are unaffected —
 *     asserted as the positive control, so the trigger is proven to key on the
 *     user and not on the section;
 *   - on `matrix_time_machine`: an audit row for a `zzboa*` tipo is refused,
 *     armed for one leg only. `apply_value`'s transaction then rolls back
 *     (main + slot unchanged, no TM row) and `bulk_revert` reports the row
 *     `failed` with nothing written — a restore whose audit row cannot be
 *     recorded leaves no partial state behind.
 * The scratch user is an integer no suite user carries: `createSectionRecord`
 * stamps it into `data.created_by_user_id` and the dd200 locator with no FK,
 * so it identifies THIS gate's mints and nothing else.
 *
 * REVERTIBILITY. The happy path proves the stamp: `bulk_revert` answers the new
 * dd800 id, that record exists, EVERY TM row the run wrote for the batch's
 * components carries it, and they are one undo-log B/A pair per reverted unit
 * (WC-2026-09-27-bulk-revert-undo-log).
 *
 * BOTH REVERT PATHS race the curator: a run made under the undo log (exact —
 * the revert lands, the frame survives) and a LEGACY run, built by stripping
 * the undo log (test/helpers/legacy_bulk_run.ts) — the inference path, whose
 * conflict check must see the frame behind the lock.
 *
 * Everything is built through the engine's own write path on the reserved
 * scratch TLD `zzboa` (section on `test1` → `matrix_test`; a portal MAIN with
 * a `component_dataframe` SLOT as its ontology child, no request_config so the
 * frame inserts meet no target constraint) and torn down to zero residue; the
 * dd800 rows it mints are swept by id.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DATAFRAME_RELATION_TYPE } from '../../src/core/concepts/subdatum.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import {
	type BulkRevertSkipped,
	toolTimeMachineBulkRevert,
} from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { resolveDataframeSlotTipos } from '../../tools/tool_time_machine/server/dataframe_restore.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import { demoteToLegacyRun } from '../helpers/legacy_bulk_run.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** Scratch TLD unique to this gate — concurrent gates cannot collide with it. */
const SECTION = 'zzboa1';
const MAIN = 'zzboa2';
const SLOT = 'zzboa3';
const TABLE = 'matrix_test';
const USER_ID = -1; // root
/** No suite user carries this id; it keys the dd800 fault and nothing else. */
const SCRATCH_USER = -424242;
const BULK_SECTION = 'dd800';
/** Trigger/function names — scratch-prefixed, dropped in afterAll. */
const DD800_TRIGGER = 'zzboa_refuse_dd800';
const TM_TRIGGER = 'zzboa_refuse_tm';

const SITUATION = situation({
	tld: 'zzboa',
	name: 'bulk_operation_atomicity',
	nodes: [
		{
			tipo: SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Atomicidad de operaciones masivas', 'lg-eng': 'Bulk atomicity' },
		},
		{
			tipo: MAIN,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-spa': 'Informantes', 'lg-eng': 'Informants' },
		},
		{
			tipo: SLOT,
			parent: MAIN,
			model: 'component_dataframe',
			term: { 'lg-spa': 'Rol', 'lg-eng': 'Role' },
		},
	],
});

/** The locator targets every main item and frame points at. */
let targetA = 0;
let targetB = 0;
let bulkTable = '';
/** Every dd800 row this gate minted (batches AND reverts) — swept by id. */
const mintedBulkIds: number[] = [];

async function context(
	options: Record<string, unknown>,
	userId = USER_ID,
): Promise<ToolActionContext> {
	return { principal: await resolvePrincipal(USER_ID), userId, options, background: false };
}

async function storedKey(recordId: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation->$1 AS items FROM "${TABLE}" WHERE section_tipo = $2 AND section_id = $3`,
		[key, SECTION, recordId],
	)) as { items: unknown }[];
	return rows[0]?.items ?? undefined;
}

interface TmRowOf {
	id: number;
	bulk: number | null;
	/** undo-log role (WC-2026-09-27-bulk-revert-undo-log): null = visible history. */
	role: number | null;
	data: unknown;
}

/** EVERY time-machine row of the key, hidden undo-log rows included, id ASC. */
async function tmRowsOf(recordId: number, tipo: string): Promise<TmRowOf[]> {
	const rows = (await sql.unsafe(
		`SELECT id, bulk_process_id AS bulk, tm_role AS role, data FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id ASC`,
		[SECTION, recordId, tipo],
	)) as TmRowOf[];
	return rows.map((row) => ({
		...row,
		bulk: row.bulk === null ? null : Number(row.bulk),
		role: row.role === null ? null : Number(row.role),
	}));
}

/** The key's VISIBLE history (what dd15 shows) — the undo log's hidden rows excluded. */
async function visibleRowsOf(recordId: number, tipo: string): Promise<TmRowOf[]> {
	return (await tmRowsOf(recordId, tipo)).filter((row) => row.role === null);
}

async function bulkRowExists(id: number): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM "${bulkTable}" WHERE section_tipo = $1 AND section_id = $2`,
		[BULK_SECTION, id],
	)) as unknown[];
	return rows.length > 0;
}

async function mintBulkId(userId = USER_ID): Promise<number> {
	const id = await createSectionRecord(BULK_SECTION, userId);
	mintedBulkIds.push(id);
	return id;
}

/** Insert one main locator through the engine's save door; returns the item id. */
async function saveMainLocator(
	recordId: number,
	targetId: number,
	bulkProcessId: number | null = null,
): Promise<number> {
	const saved = await saveComponentData({
		componentTipo: MAIN,
		sectionTipo: SECTION,
		sectionId: recordId,
		lang: 'lg-nolan',
		changedData: [
			{ action: 'insert', value: { section_tipo: SECTION, section_id: String(targetId) } },
		],
		userId: USER_ID,
		bulkProcessId,
	});
	expect(saved.ok).toBe(true);
	const items = (saved.data ?? []) as { id?: number; section_id?: number | string }[];
	const id = Number(items.find((item) => Number(item.section_id) === targetId)?.id ?? 0);
	expect(id).toBeGreaterThan(0);
	return id;
}

/**
 * A record with a two-row visible MAIN history — `[A]` then `[A, B]` (the
 * second save optionally stamped as a batch) — and an EMPTY slot. Both visible
 * rows are composed with an empty slot: restoring the older one plans "no
 * frames". A batched second save ALSO writes its hidden undo-log BEFORE row
 * (tm_role 1, holding `[A]`) just below its visible after-row — D1: whatever
 * saveTm says. `legacy: true` strips that BEFORE (demoteToLegacyRun), leaving
 * the shape every pre-undo-log run left: the revert then takes the LEGACY
 * inference path.
 */
async function makeHistory(
	batchId: number | null = null,
	options: { legacy?: boolean } = {},
): Promise<{ recordId: number; itemA: number; olderTmId: number }> {
	const recordId = await createSectionRecord(SECTION, USER_ID);
	const itemA = await saveMainLocator(recordId, targetA);
	await saveMainLocator(recordId, targetB, batchId);
	if (options.legacy === true && batchId !== null) {
		expect(await demoteToLegacyRun(batchId)).toBe(1);
	}
	const history = await visibleRowsOf(recordId, MAIN);
	// Corpus floor: the visible history this gate restores from is exactly two
	// rows, the older one holding ONE item and no frame (its slot was empty).
	expect(history.length).toBe(2);
	const older = history[0] as { id: number; data: unknown };
	expect(Array.isArray(older.data)).toBe(true);
	expect((older.data as unknown[]).length).toBe(1);
	expect(history[1]?.bulk).toBe(batchId);
	const hidden = (await tmRowsOf(recordId, MAIN)).filter((row) => row.role !== null);
	if (batchId === null || options.legacy === true) {
		expect(hidden).toEqual([]);
	} else {
		// the batch's BEFORE: role 1, the run's id, the exact `[A]` it replaced
		expect(hidden.map((row) => [row.role, row.bulk])).toEqual([[1, batchId]]);
		expect(hidden[0]?.data).toEqual(older.data);
		expect((hidden[0] as TmRowOf).id).toBeLessThan((history[1] as TmRowOf).id);
	}
	expect(await storedKey(recordId, SLOT)).toBeUndefined();
	return { recordId, itemA, olderTmId: older.id };
}

/** T2's ordinary curator save: one frame into the slot, paired to `itemA`. */
function saveFrame(recordId: number, itemA: number) {
	return saveComponentData({
		componentTipo: SLOT,
		sectionTipo: SECTION,
		sectionId: recordId,
		lang: 'lg-nolan',
		changedData: [
			{ action: 'insert', value: { section_tipo: SECTION, section_id: String(targetB) } },
		],
		callerDataframe: { main_component_tipo: MAIN, id_key: itemA },
		userId: USER_ID,
	});
}

/**
 * Poll until some backend is waiting on a lock HELD BY `pid`. Identity, not a
 * sleep: `pg_blocking_pids` names the blocker, so a concurrently running gate
 * on the same suite database can neither satisfy nor disturb this wait.
 */
async function waitUntilBlockedBy(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity
			 WHERE wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(pid))`,
			[String(pid)],
		)) as { n: number }[];
		if ((rows[0]?.n ?? 0) > 0) return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return false;
}

interface Interleave<T> {
	/** Did the door provably WAIT on the curator's row lock? (anti-vacuity) */
	blocked: boolean;
	curatorSaveOk: boolean;
	/** The door's settled result — a value or the error it threw. */
	door: { value: T } | { error: unknown };
}

/**
 * THE INTERLEAVE: T2 holds a frame insert open on the record; T1 runs `door`
 * and must block on T2; T2 is released only once T1 is provably waiting.
 */
async function interleave<T>(
	recordId: number,
	itemA: number,
	door: () => Promise<T>,
): Promise<Interleave<T>> {
	let releaseCurator: () => void = () => {};
	const curatorHold = new Promise<void>((resolve) => {
		releaseCurator = resolve;
	});
	let curatorCommitted: () => void = () => {};
	const curatorWrote = new Promise<void>((resolve) => {
		curatorCommitted = resolve;
	});
	let curatorPid = 0;
	let curatorSaveOk = false;

	const curator = withTransaction(async () => {
		const pidRows = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
		curatorPid = Number(pidRows[0]?.pid ?? 0);
		curatorSaveOk = (await saveFrame(recordId, itemA)).ok;
		curatorCommitted();
		await curatorHold; // the write is done; the transaction is NOT
	});
	await curatorWrote;
	expect(curatorPid).toBeGreaterThan(0);

	const run = door().then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	const blocked = await waitUntilBlockedBy(curatorPid, 15_000);
	releaseCurator();
	await curator;
	return { blocked, curatorSaveOk, door: await run };
}

/** The one frame T2 wrote, as stored — or null. */
function storedFrame(slot: unknown, itemA: number): Record<string, unknown> | null {
	if (!Array.isArray(slot)) return null;
	const frame = (slot as Record<string, unknown>[]).find(
		(entry) => Number(entry.id_key) === itemA && Number(entry.section_id) === targetB,
	);
	return frame ?? null;
}

beforeAll(async () => {
	await ensureSituation(SITUATION);
	// Structure floor: what the doors will resolve, asserted rather than assumed.
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(await getModelByTipo(MAIN)).toBe('component_portal');
	expect(await getModelByTipo(SLOT)).toBe('component_dataframe');
	expect(getColumnNameByModel('component_portal')).toBe('relation');
	expect(getColumnNameByModel('component_dataframe')).toBe('relation');
	// The slot IS discovered as the main's frame slot — otherwise no plan wipes
	// anything and every "survives" assertion below is vacuous.
	expect(await resolveDataframeSlotTipos(MAIN)).toEqual([SLOT]);
	const resolvedBulkTable = await getMatrixTableFromTipo(BULK_SECTION);
	expect(resolvedBulkTable).not.toBeNull();
	bulkTable = resolvedBulkTable as string;

	targetA = await createSectionRecord(SECTION, USER_ID);
	targetB = await createSectionRecord(SECTION, USER_ID);
	expect(targetA).toBeGreaterThan(0);
	expect(targetB).toBeGreaterThan(0);

	// Fault injection lives in the DATABASE (header). Leftovers of a crashed run
	// are dropped first; the TM trigger is only ARMED inside its own leg.
	await sql.unsafe(`DROP TRIGGER IF EXISTS ${DD800_TRIGGER} ON "${bulkTable}"`);
	await sql.unsafe(`DROP TRIGGER IF EXISTS ${TM_TRIGGER} ON matrix_time_machine`);
	await sql.unsafe(
		`CREATE OR REPLACE FUNCTION ${DD800_TRIGGER}() RETURNS trigger AS $$
		 BEGIN
		   IF NEW.section_tipo = '${BULK_SECTION}'
		      AND (NEW.data->>'created_by_user_id')::int = ${SCRATCH_USER} THEN
		     RAISE EXCEPTION '${DD800_TRIGGER}: injected dd800 mint fault';
		   END IF;
		   RETURN NEW;
		 END $$ LANGUAGE plpgsql`,
	);
	await sql.unsafe(
		`CREATE TRIGGER ${DD800_TRIGGER} BEFORE INSERT ON "${bulkTable}"
		 FOR EACH ROW EXECUTE FUNCTION ${DD800_TRIGGER}()`,
	);
	await sql.unsafe(
		`CREATE OR REPLACE FUNCTION ${TM_TRIGGER}() RETURNS trigger AS $$
		 BEGIN
		   IF NEW.tipo LIKE 'zzboa%' THEN
		     RAISE EXCEPTION '${TM_TRIGGER}: injected time-machine audit fault';
		   END IF;
		   RETURN NEW;
		 END $$ LANGUAGE plpgsql`,
	);
}, 60_000);

afterAll(async () => {
	await sql.unsafe(`DROP TRIGGER IF EXISTS ${TM_TRIGGER} ON matrix_time_machine`);
	await sql.unsafe(`DROP FUNCTION IF EXISTS ${TM_TRIGGER}()`);
	if (bulkTable !== '') {
		await sql.unsafe(`DROP TRIGGER IF EXISTS ${DD800_TRIGGER} ON "${bulkTable}"`);
		for (const id of mintedBulkIds) {
			await sql.unsafe(`DELETE FROM "${bulkTable}" WHERE section_tipo = $1 AND section_id = $2`, [
				BULK_SECTION,
				id,
			]);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`,
				[BULK_SECTION, id],
			);
		}
	}
	await sql.unsafe(`DROP FUNCTION IF EXISTS ${DD800_TRIGGER}()`);
	await sql.unsafe(`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1`, [SECTION]);
	expect(await dropSituation(SITUATION)).toBe(0);
});

/* ═══════════════════ DATA-30: THE INTERLEAVE, PER DOOR ═══════════════════ */

describe('apply_value vs a concurrent frame save (DATA-30)', () => {
	let recordId = 0;
	let itemA = 0;
	let olderTmId = 0;
	let result: Interleave<unknown>;
	let mainBefore: unknown;

	beforeAll(async () => {
		({ recordId, itemA, olderTmId } = await makeHistory());
		mainBefore = await storedKey(recordId, MAIN);
		result = await interleave(recordId, itemA, async () =>
			toolTimeMachineApplyValue(
				await context({
					section_tipo: SECTION,
					section_id: recordId,
					tipo: MAIN,
					lang: 'lg-nolan',
					matrix_id: olderTmId,
				}),
			),
		);
	}, 60_000);

	test('the interleave actually happened: the restore waited on the curator lock', () => {
		expect(result.curatorSaveOk).toBe(true);
		expect(result.blocked).toBe(true);
	});

	test('the restore LANDED after the curator: exactly the row’s state — main [A], its frames emptied', async () => {
		expect('value' in result.door).toBe(true);
		const main = (await storedKey(recordId, MAIN)) as { section_id: number }[];
		expect(main.map((item) => Number(item.section_id))).toEqual([targetA]);
		expect(mainBefore).not.toEqual(main); // the restore really wrote
		// the row recorded NO frame: planned over the COMMITTED frame, it empties it
		expect(await storedKey(recordId, SLOT)).toBeUndefined();
	});

	test('nothing is lost from history: the curator’s composed row keeps the frame, the restore’s row records none', async () => {
		// Serialized: the curator's slot save (recorded under the MAIN — a slot
		// writes no row of its own) THEN the restore's own composed row.
		const history = await tmRowsOf(recordId, MAIN);
		expect(history.length).toBe(4);
		expect(storedFrame(history[2]?.data, itemA)).not.toBeNull();
		expect(storedFrame(history[3]?.data, itemA)).toBeNull();
		expect((history[3]?.data as unknown[]).length).toBe(1);
	});
});

describe('bulk_revert of a LEGACY run vs a concurrent frame save (DATA-30)', () => {
	// A run made before the undo log has no BEFORE row: its pre-run value is
	// INFERRED from the visible (composed) history, and the conflict check —
	// the live unit against the run's last row, frames included — is what stands
	// between that inference and the curator's frame, so it must read the frame
	// COMMITTED behind its lock.
	let recordId = 0;
	let itemA = 0;
	let batchId = 0;
	let result: Interleave<Awaited<ReturnType<typeof toolTimeMachineBulkRevert>>>;
	let mainBefore: unknown;

	beforeAll(async () => {
		batchId = await mintBulkId();
		({ recordId, itemA } = await makeHistory(batchId, { legacy: true }));
		mainBefore = await storedKey(recordId, MAIN);
		result = await interleave(recordId, itemA, async () =>
			toolTimeMachineBulkRevert(await context({ bulk_process_id: batchId })),
		);
	}, 60_000);

	test('the interleave actually happened: the revert waited on the curator lock', () => {
		expect(result.curatorSaveOk).toBe(true);
		expect(result.blocked).toBe(true);
	});

	test('the key is SKIPPED as changed_since_run — never a lost update', () => {
		expect('value' in result.door).toBe(true);
		const response = 'value' in result.door ? result.door.value : null;
		expect(response?.ok).toBe(true);
		const data = response?.data as {
			counter: number;
			bulk_process_id: number;
			exact: string;
			skipped: BulkRevertSkipped[];
		};
		expect(data.counter).toBe(0);
		mintedBulkIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([
			{ reason: 'changed_since_run', section_tipo: SECTION, tipo: MAIN, section_id: recordId },
		]);
		expect(data.exact).toBe('none');
	});

	test("the curator's frame SURVIVES; the main is untouched", async () => {
		const frame = storedFrame(await storedKey(recordId, SLOT), itemA);
		expect(frame).not.toBeNull();
		expect(await storedKey(recordId, MAIN)).toEqual(mainBefore);
	});

	test('no partial audit row: nothing carries the revert id; the history is unchanged', async () => {
		// two rows it had + the curator's composed frame row (see apply_value above)
		const history = await tmRowsOf(recordId, MAIN);
		expect(history.length).toBe(3);
		expect(storedFrame(history[2]?.data, itemA)).not.toBeNull();
		const response = 'value' in result.door ? result.door.value : null;
		const revertId = (response?.data as { bulk_process_id: number }).bulk_process_id;
		expect(revertId).toBeGreaterThan(0);
		const stamped = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_time_machine WHERE bulk_process_id = $1`,
			[revertId],
		)) as { n: number }[];
		expect(stamped[0]?.n).toBe(0);
	});
});

describe('bulk_revert of an UNDO-LOG run vs a concurrent frame save (DATA-30)', () => {
	// The exact path reads the run's COMPOSED BEFORE (`[A]`, no frames) and
	// checks the LIVE main AND its frames against the run's last after-image,
	// behind the row lock. The curator commits a frame of the main inside the
	// revert's read→write window: the main's unit (main + its frames, amendment
	// 2026-09-27) is no longer what the run left, so the revert REFUSES it
	// `changed_since_run` — never a restore that silently takes the frame with it.
	let recordId = 0;
	let itemA = 0;
	let batchId = 0;
	let result: Interleave<Awaited<ReturnType<typeof toolTimeMachineBulkRevert>>>;

	beforeAll(async () => {
		batchId = await mintBulkId();
		({ recordId, itemA } = await makeHistory(batchId));
		result = await interleave(recordId, itemA, async () =>
			toolTimeMachineBulkRevert(await context({ bulk_process_id: batchId })),
		);
	}, 60_000);

	test('the interleave actually happened: the revert waited on the curator lock', () => {
		expect(result.curatorSaveOk).toBe(true);
		expect(result.blocked).toBe(true);
	});

	test('the unit is REFUSED changed_since_run — it read the committed frame; the main is untouched', async () => {
		const response = 'value' in result.door ? result.door.value : null;
		expect(response?.ok).toBe(true);
		const data = response?.data as {
			counter: number;
			bulk_process_id: number;
			exact: string;
			skipped: BulkRevertSkipped[];
		};
		mintedBulkIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([
			{ reason: 'changed_since_run', section_tipo: SECTION, tipo: MAIN, section_id: recordId },
		]);
		expect(data.counter).toBe(0);
		expect(data.exact).toBe('none');
		const main = (await storedKey(recordId, MAIN)) as { id: number; section_id: number }[];
		expect(main.map((item) => Number(item.section_id))).toEqual([targetA, targetB]);
	});

	test("the curator's frame SURVIVES, still paired to item A", async () => {
		const frame = storedFrame(await storedKey(recordId, SLOT), itemA);
		expect(frame).not.toBeNull();
		expect(frame?.type).toBe(DATAFRAME_RELATION_TYPE);
	});
});

/* ═════════════ REVERTIBILITY: THE STAMP, ON THE HAPPY PATH ═════════════ */

describe('bulk_revert stamps every row it writes with the dd800 it answers', () => {
	let recordId = 0;
	let batchId = 0;
	let data: { counter: number; bulk_process_id: number; skipped: BulkRevertSkipped[] };
	let tmMaxBefore = 0;

	beforeAll(async () => {
		batchId = await mintBulkId();
		({ recordId } = await makeHistory(batchId));
		const before = (await sql.unsafe(
			`SELECT COALESCE(max(id), 0)::int AS m FROM matrix_time_machine`,
		)) as { m: number }[];
		tmMaxBefore = before[0]?.m ?? 0;
		const response = await toolTimeMachineBulkRevert(await context({ bulk_process_id: batchId }));
		expect(response.ok).toBe(true);
		data = response.data as typeof data;
		mintedBulkIds.push(data.bulk_process_id);
	}, 60_000);

	test('the revert landed: counter 1, no skips, the main is back to [A]', async () => {
		expect(data.skipped).toEqual([]);
		expect(data.counter).toBe(1);
		const main = (await storedKey(recordId, MAIN)) as { section_id: number }[];
		expect(main.length).toBe(1);
		expect(Number(main[0]?.section_id)).toBe(targetA);
	});

	test('the answered dd800 record exists', async () => {
		expect(data.bulk_process_id).toBeGreaterThan(0);
		expect(data.bulk_process_id).not.toBe(batchId);
		expect(await bulkRowExists(data.bulk_process_id)).toBe(true);
	});

	test('EVERY TM row the run wrote for the batch carries it: one B/A pair per reverted unit', async () => {
		const written = (await sql.unsafe(
			`SELECT bulk_process_id AS bulk, tm_role AS role FROM matrix_time_machine
			 WHERE id > $1 AND section_tipo = $2 AND tipo LIKE 'zzboa%' ORDER BY id`,
			[tmMaxBefore, SECTION],
		)) as { bulk: number | null; role: number | null }[];
		// The revert is itself a bulk run with an undo log: its BEFORE (hidden,
		// role 1) then its visible after-row, so reverting the revert is exact.
		expect(written.length).toBe(data.counter * 2);
		expect(written.map((row) => row.role)).toEqual([1, null]);
		expect(written.every((row) => Number(row.bulk) === data.bulk_process_id)).toBe(true);
		const stamped = await visibleRowsOf(recordId, MAIN);
		expect(stamped.filter((row) => row.bulk === data.bulk_process_id).length).toBe(1);
	});
});

/* ═══════════ DATA-31: A FAILED dd800 MINT REFUSES THE WHOLE RUN ═══════════ */

describe('bulk_revert refuses to START when its dd800 cannot be minted (DATA-31)', () => {
	let recordId = 0;
	let batchId = 0;
	let mainBefore: unknown;
	let historyBefore: Awaited<ReturnType<typeof tmRowsOf>> = [];
	let bulkCountBefore = 0;

	async function scratchUserBulkCount(): Promise<number> {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${bulkTable}"
			 WHERE section_tipo = $1 AND (data->>'created_by_user_id')::int = $2`,
			[BULK_SECTION, SCRATCH_USER],
		)) as { n: number }[];
		return rows[0]?.n ?? 0;
	}

	beforeAll(async () => {
		batchId = await mintBulkId();
		({ recordId } = await makeHistory(batchId));
		mainBefore = await storedKey(recordId, MAIN);
		historyBefore = await tmRowsOf(recordId, MAIN);
		bulkCountBefore = await scratchUserBulkCount();
	}, 60_000);

	test('positive control: the fault is REAL and keyed on the user — root still mints', async () => {
		await expect(createSectionRecord(BULK_SECTION, SCRATCH_USER)).rejects.toThrow(DD800_TRIGGER);
		const rootMint = await mintBulkId();
		expect(rootMint).toBeGreaterThan(0);
		expect(await bulkRowExists(rootMint)).toBe(true);
	});

	test('the run is refused as tool.action_failed — nothing was changed', async () => {
		const refusal = await refusalOf(
			toolTimeMachineBulkRevert(await context({ bulk_process_id: batchId }, SCRATCH_USER)),
		);
		expect(refusal.code).toBe('tool.action_failed');
		expect(refusal.message).toContain('createRevertBulkProcess');
		// No dd800 row for the run, no TM row, live values byte-identical.
		expect(await scratchUserBulkCount()).toBe(bulkCountBefore);
		expect(await storedKey(recordId, MAIN)).toEqual(mainBefore);
		expect(await tmRowsOf(recordId, MAIN)).toEqual(historyBefore);
		// And the batch it was asked to undo is still there to be undone: its
		// hidden BEFORE and its visible after-row.
		expect(
			(await tmRowsOf(recordId, MAIN)).filter((row) => row.bulk === batchId).map((r) => r.role),
		).toEqual([1, null]);
	});
});

/* ═══════ DATA-31: A RESTORE WHOSE AUDIT ROW FAILS LEAVES NO PARTIAL STATE ═══════ */

describe('a restore whose Time Machine row cannot be written rolls back WHOLE (DATA-31)', () => {
	let applyRecord = 0;
	let applyOlderTmId = 0;
	let bulkRecord = 0;
	let batchId = 0;
	let applyMainBefore: unknown;
	let bulkMainBefore: unknown;

	beforeAll(async () => {
		({ recordId: applyRecord, olderTmId: applyOlderTmId } = await makeHistory());
		batchId = await mintBulkId();
		({ recordId: bulkRecord } = await makeHistory(batchId));
		applyMainBefore = await storedKey(applyRecord, MAIN);
		bulkMainBefore = await storedKey(bulkRecord, MAIN);
		// ARM the audit fault for this leg only.
		await sql.unsafe(
			`CREATE TRIGGER ${TM_TRIGGER} BEFORE INSERT ON matrix_time_machine
			 FOR EACH ROW EXECUTE FUNCTION ${TM_TRIGGER}()`,
		);
	}, 60_000);

	afterAll(async () => {
		await sql.unsafe(`DROP TRIGGER IF EXISTS ${TM_TRIGGER} ON matrix_time_machine`);
	});

	test('positive control: the fault is REAL — a zzboa audit row is refused', async () => {
		await expect(
			sql.unsafe(
				`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
				 VALUES ($1, $2, $3, 'lg-nolan', now(), '-1', '[]'::jsonb)`,
				[applyRecord, SECTION, MAIN],
			),
		).rejects.toThrow(TM_TRIGGER);
	});

	test('apply_value: the main write is rolled back with the audit row — no half restore', async () => {
		// The fault is a raw Postgres error here: the door lets it propagate (the
		// dispatch chokepoint is what converts it), so the assertion is on the
		// thrown text, not on a registry code.
		let thrown: unknown = null;
		try {
			await toolTimeMachineApplyValue(
				await context({
					section_tipo: SECTION,
					section_id: applyRecord,
					tipo: MAIN,
					lang: 'lg-nolan',
					matrix_id: applyOlderTmId,
				}),
			);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).not.toBeNull();
		expect(String((thrown as Error)?.message)).toContain(TM_TRIGGER);
		expect(await storedKey(applyRecord, MAIN)).toEqual(applyMainBefore);
		expect(await storedKey(applyRecord, SLOT)).toBeUndefined();
		expect((await tmRowsOf(applyRecord, MAIN)).length).toBe(2);
	});

	test("bulk_revert: the row is reported 'failed' and nothing of it is written", async () => {
		const response = await toolTimeMachineBulkRevert(await context({ bulk_process_id: batchId }));
		expect(response.ok).toBe(true);
		const data = response.data as {
			counter: number;
			bulk_process_id: number;
			skipped: BulkRevertSkipped[];
		};
		mintedBulkIds.push(data.bulk_process_id);
		expect(data.counter).toBe(0);
		expect(data.skipped).toEqual([
			{ reason: 'failed', section_tipo: SECTION, tipo: MAIN, section_id: bulkRecord },
		]);
		expect(await storedKey(bulkRecord, MAIN)).toEqual(bulkMainBefore);
		// the two visible rows + the batch's BEFORE; nothing of the revert
		expect((await tmRowsOf(bulkRecord, MAIN)).length).toBe(3);
		expect((await visibleRowsOf(bulkRecord, MAIN)).length).toBe(2);
	});
});
