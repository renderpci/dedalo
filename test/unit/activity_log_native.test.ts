/**
 * Activity log (matrix_activity, dd542) row anatomy — TS-NATIVE half, the
 * DEC-14b survival twin of test/parity/activity_log_differential.test.ts
 * (that gate's PHP-vs-TS comparison dies with the oracle; the row anatomy it
 * pinned equal to live PHP survives HERE, asserted against the TS engine
 * alone).
 *
 * Every state-changing dispatch action appends one dd542 audit row:
 *   relation.dd543 = the acting user's locator (dd128 link, no item id)
 *   relation.dd545 = the WHAT code locator (dd42: DELETE=4, SAVE=5)
 *   string.dd544   = the client host ('localhost' for loopback)
 *   string.dd546   = the WHERE tipo (component tipo for saves, section tipo
 *                    for deletes)
 *   date.dd547     = the virtual-calendar instant (start only — no id/lang)
 *   misc.dd551     = [{lang:'lg-nolan', value:<action payload>}] — the SAVE
 *                    payload names the component/table; the DELETE payload
 *                    mirrors the PHP QUIRK of hardcoding delete_mode
 *                    'delete_record'.
 * The relation/host/where/payload assertions below are exactly the fields the
 * differential deep-compared against live PHP (payload section_id
 * normalized — its TYPE differs per action, so only its VALUE is pinned).
 * date.dd547 was NOT differential-compared (instants normalized); its shape
 * is the handler's observed-live contract (api/handlers/activity_log.ts).
 *
 * Driven through dispatchRqo — logActivity lives at the dd_core_api handler
 * chokepoint (the save/delete ENGINES write no activity rows themselves).
 *
 * Scratch hygiene: one fresh test3 record (matrix_test) via
 * createSectionRecord; the record + its TM rows + the activity rows THIS test
 * appended are deleted in afterAll (matrix_activity is consultation-only for
 * the engine doors; direct SQL cleanup of our own rows mirrors the
 * differential's cleanup).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	createSectionRecord,
	virtualDateNow,
} from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

registerSessionCleanup();

const SECTION = 'test3';
const TABLE = 'matrix_test';
const COMPONENT = 'test52'; // component_input_text of test3 (the differential's twin)
const USER_ID = -1; // root

/** Virtual-calendar seconds tolerance (dd547 instant vs the test wall clock). */
const TOLERANCE_VIRTUAL_SECONDS = 120;

interface ActivityRow {
	section_id: number;
	section_tipo: string;
	relation: Record<string, unknown[]>;
	string: Record<string, { lang?: string; value?: unknown }[]>;
	date: { dd547?: Record<string, number>[] };
	misc: { dd551?: { lang?: string; value?: Record<string, unknown> }[] };
}

let recordId = 0;
const activityIds: number[] = [];
let saveRow: ActivityRow | undefined;
let deleteRow: ActivityRow | undefined;
let baselineBeforeSave = 0;
let baselineBeforeDelete = 0;
/** WC-040: the record created through the `create` DOOR (the NEW emitter). */
let createdRecordId = 0;
let newRow: ActivityRow | undefined;
let loginDenyRow: ActivityRow | undefined;
/** Unique per run so the throttle store and the row lookup cannot collide. */
const ABSENT_USERNAME = `__activity_native_absent_${process.pid}__`;

async function maxActivityId(): Promise<number> {
	const rows = (await sql`
		SELECT COALESCE(MAX(section_id), 0)::int AS max FROM matrix_activity
	`) as { max: number }[];
	return rows[0]?.max ?? 0;
}

/** The row THIS test appended: where-tipo + WHAT code + our record id. */
async function ourActivityRow(whereTipo: string, code: string): Promise<ActivityRow | undefined> {
	const rows = (await sql.unsafe(
		`SELECT section_id, section_tipo, relation, string, date, misc FROM matrix_activity
		 WHERE string->'dd546'->0->>'value' = $1
		   AND relation->'dd545'->0->>'section_id' = $2
		   AND misc->'dd551'->0->'value'->>'section_id' = $3
		 ORDER BY section_id DESC LIMIT 1`,
		[whereTipo, code, String(recordId)],
	)) as ActivityRow[];
	if (rows[0] !== undefined) activityIds.push(Number(rows[0].section_id));
	return rows[0];
}

/** Like ourActivityRow, but keyed on an explicit payload section_id (NEW). */
async function activityRowBySectionId(
	whereTipo: string,
	code: string,
	payloadSectionId: number,
): Promise<ActivityRow | undefined> {
	const rows = (await sql.unsafe(
		`SELECT section_id, section_tipo, relation, string, date, misc FROM matrix_activity
		 WHERE string->'dd546'->0->>'value' = $1
		   AND relation->'dd545'->0->>'section_id' = $2
		   AND misc->'dd551'->0->'value'->>'section_id' = $3
		 ORDER BY section_id DESC LIMIT 1`,
		[whereTipo, code, String(payloadSectionId)],
	)) as ActivityRow[];
	if (rows[0] !== undefined) activityIds.push(Number(rows[0].section_id));
	return rows[0];
}

/** The LOG IN row for one attempted username (payload key, not section_id). */
async function loginActivityRow(username: string): Promise<ActivityRow | undefined> {
	const rows = (await sql.unsafe(
		`SELECT section_id, section_tipo, relation, string, date, misc FROM matrix_activity
		 WHERE relation->'dd545'->0->>'section_id' = '1'
		   AND misc->'dd551'->0->'value'->>'username' = $1
		 ORDER BY section_id DESC LIMIT 1`,
		[username],
	)) as ActivityRow[];
	if (rows[0] !== undefined) activityIds.push(Number(rows[0].section_id));
	return rows[0];
}

async function rootContext(): Promise<Record<string, unknown>> {
	const token = createSession(USER_ID, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(USER_ID);
	return {
		requestId: 'activity_native_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}

beforeAll(async () => {
	recordId = await createSectionRecord(SECTION, USER_ID);
	const context = await rootContext();

	// SAVE (the differential's exact RQO shape — PHP-verified wire).
	const saveItem = { id: 1, lang: 'lg-nolan', value: 'ACTIVITY_NATIVE' };
	baselineBeforeSave = await maxActivityId();
	await dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				type: 'component',
				model: 'component_input_text',
				tipo: COMPONENT,
				section_tipo: SECTION,
				section_id: String(recordId),
				mode: 'edit',
				lang: 'lg-nolan',
				action: null,
			},
			data: {
				section_id: String(recordId),
				section_tipo: SECTION,
				tipo: COMPONENT,
				lang: 'lg-nolan',
				from_component_tipo: COMPONENT,
				value: [saveItem],
				changed_data: [{ action: 'set_data', key: null, value: [saveItem] }],
			},
		} as unknown as Rqo,
		context as never,
	);
	saveRow = await ourActivityRow(COMPONENT, '5');

	// DELETE (delete_record).
	baselineBeforeDelete = await maxActivityId();
	await dispatchRqo(
		{
			action: 'delete',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				model: 'section',
				tipo: SECTION,
				section_tipo: SECTION,
				section_id: String(recordId),
				action: 'delete',
				delete_mode: 'delete_record',
			},
		} as unknown as Rqo,
		context as never,
	);
	deleteRow = await ourActivityRow(SECTION, '4');

	// NEW (WC-040) — through the `create` DOOR, which is where the emitter
	// lives; the createSectionRecord call above is the ENGINE and writes no row.
	const createResult = await dispatchRqo(
		{
			action: 'create',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				model: 'section',
				tipo: SECTION,
				section_tipo: SECTION,
				action: 'create',
			},
		} as unknown as Rqo,
		context as never,
	);
	createdRecordId = Number((createResult.body as { result?: unknown }).result ?? 0);
	newRow = await activityRowBySectionId(SECTION, '3', createdRecordId);

	// LOG IN, denied (WC-040). An unknown username needs no fixture user and
	// exercises the branch that matters most: a failed attempt IS recorded.
	const { login } = await import('../../src/core/security/auth.ts');
	await login(ABSENT_USERNAME, 'wrong-password', '127.0.0.1');
	loginDenyRow = await loginActivityRow(ABSENT_USERNAME);
}, 60000);

afterAll(async () => {
	if (recordId > 0) await cleanScratchRecord(SECTION, recordId, TABLE);
	if (createdRecordId > 0) await cleanScratchRecord(SECTION, createdRecordId, TABLE);
	for (const id of activityIds) {
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND section_id = $1`,
			[id],
		);
	}
});

/** The PHP dd_date virtual-date field set (fixed 372-day years / 31-day months). */
interface VirtualStart {
	day: number;
	hour: number;
	time: number;
	year: number;
	month: number;
	minute: number;
	second: number;
}

/** dd547: {start} only, virtual-time fields self-consistent + wall-clock near NOW. */
function assertInstant(row: ActivityRow): void {
	const items = row.date.dd547 ?? [];
	expect(items.length).toBe(1);
	const item = items[0] as unknown as { start: VirtualStart };
	expect(Object.keys(item).sort()).toEqual(['start']); // no id/lang (observed live)
	const start = item.start;
	expect(Object.keys(start).sort()).toEqual([
		'day',
		'hour',
		'minute',
		'month',
		'second',
		'time',
		'year',
	]);
	// The dd_date virtual-calendar encoding recomputes from its own fields…
	const recomputed =
		start.year * 372 * 86400 +
		(start.month - 1) * 31 * 86400 +
		(start.day - 1) * 86400 +
		start.hour * 3600 +
		start.minute * 60 +
		start.second;
	expect(start.time).toBe(recomputed);
	// …and sits at the wall clock (a UTC-stamped row misses by the zone offset).
	const skew = Math.abs(start.time - virtualDateNow(new Date()).time);
	expect(skew).toBeLessThan(TOLERANCE_VIRTUAL_SECONDS);
}

describe('activity log rows, TS-native (dd542 anatomy)', () => {
	test('SAVE appends a NEW row: code 5, user locator, component where, payload fields', () => {
		expect(saveRow).toBeDefined();
		const row = saveRow as ActivityRow;
		expect(row.section_tipo).toBe('dd542');
		expect(Number(row.section_id)).toBeGreaterThan(baselineBeforeSave);

		// relation: acting user (dd543) + WHAT code SAVE=5 (dd545) — differential-pinned.
		expect(row.relation).toEqual({
			dd543: [
				{
					type: 'dd151',
					section_id: String(USER_ID),
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
				},
			],
			dd545: [
				{ type: 'dd151', section_id: '5', section_tipo: 'dd42', from_component_tipo: 'dd545' },
			],
		});

		// host + WHERE tipo — differential-pinned values.
		expect(row.string.dd544?.[0]?.value).toBe('localhost');
		expect(row.string.dd546?.[0]?.value).toBe(COMPONENT);

		// dd551 payload (differential-pinned, section_id VALUE checked loosely —
		// the differential normalized it away, so its type is not pinned).
		expect(row.misc.dd551?.length).toBe(1);
		expect(row.misc.dd551?.[0]?.lang).toBe('lg-nolan');
		const payload = { ...(row.misc.dd551?.[0]?.value ?? {}) };
		expect(String(payload.section_id)).toBe(String(recordId));
		payload.section_id = '<id>';
		expect(payload).toEqual({
			msg: 'Saved component data',
			lang: 'lg-nolan',
			tipo: COMPONENT,
			table: TABLE,
			section_id: '<id>',
			section_tipo: SECTION,
			component_name: 'component_input_text',
		});

		assertInstant(row);
	});

	test('DELETE appends a NEW row: code 4, section where, delete_record payload quirk', () => {
		expect(deleteRow).toBeDefined();
		const row = deleteRow as ActivityRow;
		expect(row.section_tipo).toBe('dd542');
		expect(Number(row.section_id)).toBeGreaterThan(baselineBeforeDelete);

		expect(row.relation).toEqual({
			dd543: [
				{
					type: 'dd151',
					section_id: String(USER_ID),
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
				},
			],
			dd545: [
				{ type: 'dd151', section_id: '4', section_tipo: 'dd42', from_component_tipo: 'dd545' },
			],
		});

		expect(row.string.dd544?.[0]?.value).toBe('localhost');
		expect(row.string.dd546?.[0]?.value).toBe(SECTION); // deletes log the SECTION tipo

		expect(row.misc.dd551?.length).toBe(1);
		expect(row.misc.dd551?.[0]?.lang).toBe('lg-nolan');
		const payload = { ...(row.misc.dd551?.[0]?.value ?? {}) };
		expect(String(payload.section_id)).toBe(String(recordId));
		payload.section_id = '<id>';
		expect(payload).toEqual({
			msg: 'DEBUG INFO section_record::delete Deleted section record and its own references. Full deleted record',
			tipo: SECTION,
			table: TABLE,
			section_id: '<id>',
			delete_mode: 'delete_record', // PHP QUIRK pinned by the differential
			section_tipo: SECTION,
		});

		assertInstant(row);
	});

	test('NEW appends a row: code 3, section where, create payload (WC-040)', () => {
		expect(createdRecordId).toBeGreaterThan(0);
		expect(newRow).toBeDefined();
		const row = newRow as ActivityRow;
		expect(row.section_tipo).toBe('dd542');

		expect(row.relation).toEqual({
			dd543: [
				{
					type: 'dd151',
					section_id: String(USER_ID),
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
				},
			],
			dd545: [
				{ type: 'dd151', section_id: '3', section_tipo: 'dd42', from_component_tipo: 'dd545' },
			],
		});

		// WHERE is the SECTION tipo (a create has no component).
		expect(row.string.dd544?.[0]?.value).toBe('localhost');
		expect(row.string.dd546?.[0]?.value).toBe(SECTION);

		expect(row.misc.dd551?.[0]?.value).toEqual({
			msg: 'Created section record',
			section_id: String(createdRecordId),
			section_tipo: SECTION,
			tipo: SECTION,
			table: TABLE,
		});

		assertInstant(row);
	});

	test('a DENIED login appends a row: code 1, dd229 where, -666 actor (WC-040)', () => {
		expect(loginDenyRow).toBeDefined();
		const row = loginDenyRow as ActivityRow;
		expect(row.section_tipo).toBe('dd542');

		// The actor is PHP's anonymous sentinel — nobody is authenticated on a
		// denied attempt, so the username lives in the payload instead.
		expect(row.relation).toEqual({
			dd543: [
				{
					type: 'dd151',
					section_id: '-666',
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
				},
			],
			dd545: [
				{ type: 'dd151', section_id: '1', section_tipo: 'dd42', from_component_tipo: 'dd545' },
			],
		});

		// WHERE is the fixed login tipo (PHP login::get_login_tipo).
		expect(row.string.dd546?.[0]?.value).toBe('dd229');

		expect(row.misc.dd551?.[0]?.value).toEqual({
			msg: `Denied login attempted by: ${ABSENT_USERNAME}. User does not exist`,
			result: 'deny',
			cause: 'User does not exist',
			username: ABSENT_USERNAME,
		});
	});

	test('the delete actually removed the audited record (the row the payload names)', async () => {
		const rows = (await sql.unsafe(
			`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, recordId],
		)) as unknown[];
		expect(rows.length).toBe(0);
	});
});
