/**
 * DATA-02 gate — a record DELETE must not silently destroy a locator another
 * curator committed on the record it rewrites.
 *
 * THE FAILURE CLASS. `removeAllInverseReferences` (delete step 3) is a
 * read-modify-write of ANOTHER record's component key: it reads the OWNING
 * record's relation bag, filters the deleted record's locators out in JS, and
 * writes the WHOLE key back. The delete's transaction locks only the record
 * being DELETED. With an UNLOCKED read of the owner, everything a curator
 * commits on that key between the delete's read and the delete's write is
 * overwritten out of existence — the curator's save answered `ok:true`, no
 * error, no counter, no detection, and the delete's own Time Machine row then
 * canonizes the stale bag as if it were the truth. For a heritage collection
 * that is a silent, un-notified loss of curatorial work.
 *
 * WHY THIS SHAPE OF GATE. Nothing single-threaded can see it: the defect only
 * exists BETWEEN two connections. The three standing concurrency gates model
 * other things entirely — `concurrency_interleave.test.ts` is request-scoped
 * ALS isolation (no row locks at all), and the write-path gates drive one
 * connection. So this one drives TWO, and lets POSTGRES be the clock rather
 * than a sleep:
 *
 *   T2 (the curator) opens a transaction, saves an ordinary new locator onto
 *   the owner's portal through `saveComponentData` — which takes the owner's
 *   `FOR UPDATE` row lock — and is HELD OPEN.
 *   T1 (the admin) then deletes the target record. Whatever it does to the
 *   owner row, locked read or unlocked read + later UPDATE, it must WAIT on
 *   T2's lock, and the gate polls `pg_blocking_pids` until it provably does.
 *   Only then is T2 released to commit, so the curator's locator lands
 *   strictly INSIDE the delete's read→write window — the exact interleave the
 *   audit reproduced, forced rather than hoped for.
 *
 * With the unlocked read, T1's stale bag (which never contained the curator's
 * locator) is written over the committed one and the whole key disappears.
 * With the locked read, T1 queues behind T2 and reads what T2 committed, so
 * the curator's locator survives and only the deleted record's locator goes.
 *
 * The gate therefore reproduces the ORIGINAL RACE — it is not a post-fix
 * invariant restated. Its anti-vacuity floor is explicit: the situation's
 * structure is asserted (section → `matrix_test`, portal → `relation`
 * column), the seeded corpus is asserted non-empty AND discoverable by the
 * very breakdown search the delete uses, and the blocked-on-T2 wait must
 * genuinely have happened — a run where the interleave did not occur is RED,
 * never quietly green.
 *
 * Everything is built through the engine's own write path on a reserved
 * scratch TLD (`zzdlu`) and torn down; nothing here reads whatever the
 * database happens to hold.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import { findInverseReferenceLocators } from '../../src/core/search/search_related.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** Scratch TLD unique to this gate — concurrent gates cannot collide with it. */
const SECTION = 'zzdlu1';
const PORTAL = 'zzdlu2';
const TABLE = 'matrix_test';
const USER_ID = -1; // root, as every other delete gate

/**
 * Section + one portal, nothing else. The portal declares NO
 * `source.request_config`, so the relation-insert validation has no target
 * constraint to apply — this gate is about the delete's write protocol, not
 * about the picker gates, which have their own.
 */
const SITUATION = situation({
	tld: 'zzdlu',
	name: 'delete_inverse_lost_update',
	nodes: [
		{
			tipo: SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Pérdida de actualización al borrar', 'lg-eng': 'Delete lost update' },
		},
		{
			tipo: PORTAL,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-spa': 'Relacionados', 'lg-eng': 'Related' },
		},
	],
	// Anchor record: dropSituation sweeps every row of every section the
	// situation declares, so the runtime-created records below go with it.
	records: [{ section_tipo: SECTION, section_id: 900801 }],
});

/** The record the admin deletes. */
let targetId = 0;
/** The record the curator links to while the delete runs — the loss victim. */
let siblingId = 0;
/** The record whose portal bag holds BOTH locators — the rewritten owner. */
let ownerId = 0;

/** Did the delete provably WAIT on the curator's row lock? (anti-vacuity) */
let deleteBlockedOnCurator = false;
/** Did the curator's ordinary save answer ok? */
let curatorSaveOk = false;
/** The item id the curator's insert allocated. */
let curatorItemId = 0;
/** Anything the delete threw (a deadlock would surface here, not as a hang). */
let deleteError: unknown = null;
/** The owner's portal bag as stored AFTER both transactions committed. */
let finalBag: Record<string, unknown>[] | null = null;
/** The data of the TM row the delete wrote for the owner's portal. */
let deleteTmData: unknown = null;

/** The owner's stored portal bag, read raw. */
async function readOwnerBag(): Promise<Record<string, unknown>[] | null> {
	const rows = (await sql.unsafe(
		`SELECT relation->$1 AS items FROM "${TABLE}" WHERE section_tipo = $2 AND section_id = $3`,
		[PORTAL, SECTION, ownerId],
	)) as { items: unknown }[];
	const items = rows[0]?.items;
	return Array.isArray(items) ? (items as Record<string, unknown>[]) : null;
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

beforeAll(async () => {
	await ensureSituation(SITUATION);

	// --- structure floor: the situation resolved to what this gate asserts on.
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	const portalModel = await getModelByTipo(PORTAL);
	expect(portalModel).toBe('component_portal');
	expect(getColumnNameByModel(portalModel as string)).toBe('relation');

	targetId = await createSectionRecord(SECTION, USER_ID);
	siblingId = await createSectionRecord(SECTION, USER_ID);
	ownerId = await createSectionRecord(SECTION, USER_ID);
	expect(targetId).toBeGreaterThan(0);
	expect(siblingId).toBeGreaterThan(0);
	expect(ownerId).toBeGreaterThan(0);

	// The pre-existing reference, written through the engine's own save door.
	const seeded = await saveComponentData({
		componentTipo: PORTAL,
		sectionTipo: SECTION,
		sectionId: ownerId,
		lang: 'lg-nolan',
		changedData: [
			{ action: 'insert', value: { section_tipo: SECTION, section_id: String(targetId) } },
		],
		userId: USER_ID,
	});
	expect(seeded.ok).toBe(true);

	// --- corpus floor: the bag is non-empty AND the delete's own discovery
	// half can see it. A moved index or a shrunken fixture reddens HERE
	// instead of making the survival assertion below trivially true.
	const seededBag = await readOwnerBag();
	expect(seededBag?.length).toBe(1);
	const hits = await findInverseReferenceLocators([
		{ section_tipo: SECTION, section_id: targetId },
	]);
	expect(hits.length).toBeGreaterThan(0);

	// ---------------- THE INTERLEAVE ----------------
	let releaseCurator: () => void = () => {};
	const curatorHold = new Promise<void>((resolve) => {
		releaseCurator = resolve;
	});
	let curatorCommitted: () => void = () => {};
	const curatorWrote = new Promise<void>((resolve) => {
		curatorCommitted = resolve;
	});
	let curatorPid = 0;

	// T2 — an ORDINARY curator save on the owner's portal, held open on its own
	// connection so the delete meets a real, live row lock.
	const curator = withTransaction(async () => {
		const pidRows = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
		curatorPid = Number(pidRows[0]?.pid ?? 0);
		const saved = await saveComponentData({
			componentTipo: PORTAL,
			sectionTipo: SECTION,
			sectionId: ownerId,
			lang: 'lg-nolan',
			changedData: [
				{ action: 'insert', value: { section_tipo: SECTION, section_id: String(siblingId) } },
			],
			userId: USER_ID,
		});
		curatorSaveOk = saved.ok;
		const items = (saved.data ?? []) as { id?: number; section_id?: number | string }[];
		curatorItemId = Number(items.find((item) => Number(item.section_id) === siblingId)?.id ?? 0);
		curatorCommitted();
		await curatorHold; // the write is done; the transaction is NOT
	});
	await curatorWrote;
	expect(curatorPid).toBeGreaterThan(0);

	// T1 — the admin's delete. It must reach the owner rewrite and WAIT there.
	const deletion = deleteSectionRecord(SECTION, targetId, USER_ID).catch((error: unknown) => {
		deleteError = error;
		return null;
	});
	deleteBlockedOnCurator = await waitUntilBlockedBy(curatorPid, 15_000);

	// Only now does the curator's locator become visible to anyone else — i.e.
	// strictly inside the delete's read→write window.
	releaseCurator();
	await curator;
	await deletion;

	finalBag = await readOwnerBag();
	const tmRows = (await sql.unsafe(
		`SELECT data FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3
		 ORDER BY id DESC LIMIT 1`,
		[SECTION, ownerId, PORTAL],
	)) as { data: unknown }[];
	deleteTmData = tmRows[0]?.data ?? null;
}, 60000);

afterAll(async () => {
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('delete_record inverse rewrite vs a concurrent save (DATA-02)', () => {
	test('the interleave actually happened: the delete waited on the curator lock', () => {
		// Anti-vacuity. Without this, a delete that finished BEFORE the curator's
		// save became visible would satisfy every assertion below while proving
		// nothing at all about the window.
		expect(deleteError).toBeNull();
		expect(curatorSaveOk).toBe(true);
		expect(curatorItemId).toBeGreaterThan(0);
		expect(deleteBlockedOnCurator).toBe(true);
	});

	test("the curator's locator SURVIVES the delete's owner rewrite", () => {
		// THE DEFECT. Unlocked, the delete re-persists a bag read before the
		// curator's commit: the key is written back without the new locator (here,
		// emptied and removed outright), destroying committed curatorial work with
		// no error anywhere.
		expect(finalBag).not.toBeNull();
		const survivor = (finalBag ?? []).find((item) => Number(item.section_id) === siblingId);
		expect(survivor).toBeDefined();
		expect(survivor?.id).toBe(curatorItemId);
		expect(survivor?.from_component_tipo).toBe(PORTAL);
	});

	test("the deleted record's locator IS stripped, and the target row is gone", async () => {
		// The other half of non-vacuity: the delete must genuinely have rewritten
		// THIS owner. A gate where the rewrite never ran would "preserve" the
		// curator's locator for the wrong reason.
		expect((finalBag ?? []).some((item) => Number(item.section_id) === targetId)).toBe(false);
		const rows = (await sql.unsafe(
			`SELECT 1 FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, targetId],
		)) as unknown[];
		expect(rows.length).toBe(0);
	});

	test("the delete's Time Machine row canonizes the SURVIVING bag, not the stale one", () => {
		// The audit half of the finding: the TM row the delete writes for the
		// owner is the record's history. Written from a stale read it records a
		// bag that never existed, so even the history hides the loss.
		expect(Array.isArray(deleteTmData)).toBe(true);
		const tmItems = (deleteTmData ?? []) as Record<string, unknown>[];
		expect(tmItems.some((item) => Number(item.section_id) === siblingId)).toBe(true);
		expect(tmItems.some((item) => Number(item.section_id) === targetId)).toBe(false);
	});
});
