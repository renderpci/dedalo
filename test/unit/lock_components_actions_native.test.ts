/**
 * dispatchLockComponentsActions — the lock_components widget's area-level action
 * (src/core/area_maintenance/widgets/lock_components.ts:21).
 *
 * WHY THIS GATE EXISTS: this entry point is dispatched OUTSIDE the widget
 * envelope (the API handler calls it directly), so its own `isGlobalAdmin`
 * check is the ONLY authorization gate standing between any logged-in user and
 * "release every component lock in the installation". The non-admin case below
 * is therefore the security-relevant one, and it asserts that the seeded locks
 * SURVIVE the refusal — a refusal that returned the right shape while still
 * deleting rows would pass a message-only assertion.
 *
 * SCRATCH SURFACE: the TS lock table `dedalo_ts_component_locks` only. Locks are
 * seeded through the public `updateLockComponentsState('focus')` path under the
 * synthetic user ids 424262/424263/424264 and the scratch section_ids
 * 990001..990004, and swept fail-loud in afterAll.
 *
 * THIS FILE RUNS ALONE ON PURPOSE: `forceUnlockAllUsers` is
 * `DELETE FROM dedalo_ts_component_locks` with NO predicate — it wipes every
 * lock row in the database, other agents' fixtures included. The all-users case
 * is deliberately the LAST test in the file.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchLockComponentsActions } from '../../src/core/area_maintenance/widgets/lock_components.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { updateLockComponentsState } from '../../src/core/section/locks.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const LOCK_TABLE = 'dedalo_ts_component_locks';

/** Synthetic lock owners — no matrix_users row is needed (the table has no FK). */
const USER_A = 424262;
const USER_B = 424263;
const USER_C = 424264;
const SCRATCH_USERS = [USER_A, USER_B, USER_C];

const SECTION_TIPO = 'test3';
const COMPONENT_TIPO = 'test78';

const ADMIN: Principal = { userId: 1, isGlobalAdmin: true, isDeveloper: true };
const NON_ADMIN: Principal = { userId: USER_A, isGlobalAdmin: false, isDeveloper: false };

/** Seed one lock through the real acquisition path. */
async function seedLock(userId: number, sectionId: number, componentTipo = COMPONENT_TIPO) {
	const res = await updateLockComponentsState({
		section_tipo: SECTION_TIPO,
		section_id: sectionId,
		component_tipo: componentTipo,
		action: 'focus',
		user_id: userId,
		full_username: `scratch user ${userId}`,
	});
	// A seed that did not acquire would make every downstream assertion vacuous.
	expect(res.result).toBe(true);
}

/** Live row count for one synthetic user (never a table-global count). */
async function lockCount(userId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${LOCK_TABLE}" WHERE user_id = $1`,
		[userId],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function sweepScratchLocks(): Promise<void> {
	for (const userId of SCRATCH_USERS) {
		await sql.unsafe(`DELETE FROM "${LOCK_TABLE}" WHERE user_id = $1`, [userId]);
	}
}

beforeAll(async () => {
	// The table is created on first use by ensureTable(); this also guarantees a
	// clean starting point for the synthetic users.
	await seedLock(USER_A, 990001);
	await sweepScratchLocks();
});

afterAll(async () => {
	await sweepScratchLocks();
	for (const userId of SCRATCH_USERS) {
		// Fail loud on residue.
		expect(await lockCount(userId)).toBe(0);
	}
});

describe('dispatchLockComponentsActions', () => {
	// ---------------------------------------------------------------------
	// PURE tier — the switch default returns before any query is issued.
	// ---------------------------------------------------------------------

	test('missing fn_action is refused with the empty-name message', async () => {
		const res = await dispatchLockComponentsActions(ADMIN, {});
		expect(res).toEqual({
			result: false,
			msg: 'Error. Invalid fn_action: ',
			errors: ['invalid_fn_action'],
		});
	});

	test('unknown fn_action is refused and named verbatim', async () => {
		const res = await dispatchLockComponentsActions(ADMIN, { fn_action: 'delete_all' });
		expect(res).toEqual({
			result: false,
			msg: 'Error. Invalid fn_action: delete_all',
			errors: ['invalid_fn_action'],
		});
	});

	test('non-string fn_action degrades to the empty name, never to a dispatch', async () => {
		// `typeof options.fn_action === 'string' ? … : ''` — a numeric/objecty
		// fn_action must not reach the unlock branch.
		for (const bad of [123, null, { fn_action: 'get_active_users' }, ['get_active_users']]) {
			const res = await dispatchLockComponentsActions(ADMIN, { fn_action: bad });
			expect(res).toEqual({
				result: false,
				msg: 'Error. Invalid fn_action: ',
				errors: ['invalid_fn_action'],
			});
		}
	});

	// ---------------------------------------------------------------------
	// THE authz gate (line :26) — the only one on this entry point.
	// ---------------------------------------------------------------------

	test('non-admin is refused AND both seeded locks survive', async () => {
		await seedLock(USER_A, 990001);
		await seedLock(USER_B, 990002);
		expect(await lockCount(USER_A)).toBe(1);
		expect(await lockCount(USER_B)).toBe(1);

		const res = await dispatchLockComponentsActions(NON_ADMIN, {
			fn_action: 'force_unlock_all_components',
		});
		expect(res).toEqual({
			result: false,
			msg: 'Error. maintenance widgets are an admin surface',
			errors: ['unauthorized'],
		});

		// The load-bearing half: the refusal must not have released anything.
		expect(await lockCount(USER_A)).toBe(1);
		expect(await lockCount(USER_B)).toBe(1);

		// The same refusal covers the read action.
		const readRes = await dispatchLockComponentsActions(NON_ADMIN, {
			fn_action: 'get_active_users',
		});
		expect(readRes.result).toBe(false);
		expect(readRes.errors).toEqual(['unauthorized']);
		expect(readRes.ar_user_actions).toBeUndefined();

		await sweepScratchLocks();
	});

	// ---------------------------------------------------------------------
	// get_active_users — enriched live lock map.
	// ---------------------------------------------------------------------

	test('get_active_users reports the seeded lock (inside a request-lang scope)', async () => {
		await seedLock(USER_C, 990003);

		// getActiveLockUsers() is fail-soft (it also feeds the eager catalog
		// value): a throw yields an EMPTY list. Its label lookups read the
		// request data lang from the ALS store, so the call is made inside a
		// request scope — outside one the case would silently degrade.
		const res = (await runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
			dispatchLockComponentsActions(ADMIN, { fn_action: 'get_active_users' }),
		)) as { result: boolean; ar_user_actions: Record<string, unknown>[] };

		expect(res.result).toBe(true);
		expect(Array.isArray(res.ar_user_actions)).toBe(true);
		// Membership only — the legacy PHP registry and other live locks may add
		// rows; a table-global assertion would be order-dependent.
		const mine = res.ar_user_actions.filter((entry) => entry.user_id === USER_C);
		expect(mine.length).toBe(1);
		const entry = mine[0] as Record<string, unknown>;
		expect(entry.full_username).toBe(`scratch user ${USER_C}`);
		expect(entry.component_tipo).toBe(COMPONENT_TIPO);
		expect(entry.section_tipo).toBe(SECTION_TIPO);
		expect(entry.section_id).toBe('990003');
		expect(typeof entry.date).toBe('string');
		expect(entry.date as string).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		// Enrichment fields are always present (empty string when unresolvable).
		expect(entry).toHaveProperty('component_model');
		expect(entry).toHaveProperty('component_label');
		expect(entry).toHaveProperty('section_label');

		await sweepScratchLocks();
	});

	// ---------------------------------------------------------------------
	// force_unlock_all_components — the scoped (one user) path.
	// ---------------------------------------------------------------------

	test('user_id scopes the unlock to that user and reports the freed count', async () => {
		await seedLock(USER_A, 990001);
		await seedLock(USER_B, 990002);
		expect(await lockCount(USER_A)).toBe(1);
		expect(await lockCount(USER_B)).toBe(1);

		// The client sends user_id as a string; Number() is what makes it match.
		const res = (await dispatchLockComponentsActions(ADMIN, {
			fn_action: 'force_unlock_all_components',
			user_id: String(USER_A),
		})) as { result: boolean; msg: string; freed: number };

		expect(res.result).toBe(true);
		expect(res.freed).toBe(1);
		expect(res.msg).toBe(`OK. 1 lock(s) released for user ${USER_A}`);

		expect(await lockCount(USER_A)).toBe(0);
		// The other user's lock is untouched — this is the scoping assertion.
		expect(await lockCount(USER_B)).toBe(1);

		await sweepScratchLocks();
	});

	test('a scoped unlock releases every lock of that user across records', async () => {
		await seedLock(USER_A, 990001);
		await seedLock(USER_A, 990002);
		await seedLock(USER_A, 990003, 'test79');
		expect(await lockCount(USER_A)).toBe(3);

		const res = (await dispatchLockComponentsActions(ADMIN, {
			fn_action: 'force_unlock_all_components',
			user_id: USER_A, // numeric form, same path
		})) as { result: boolean; msg: string; freed: number };

		expect(res.freed).toBe(3);
		expect(res.msg).toBe(`OK. 3 lock(s) released for user ${USER_A}`);
		expect(await lockCount(USER_A)).toBe(0);

		await sweepScratchLocks();
	});

	test('an unknown user frees nothing and still reports success', async () => {
		await seedLock(USER_B, 990002);

		const res = (await dispatchLockComponentsActions(ADMIN, {
			fn_action: 'force_unlock_all_components',
			user_id: '999424999',
		})) as { result: boolean; msg: string; freed: number };

		expect(res.result).toBe(true);
		expect(res.freed).toBe(0);
		expect(res.msg).toBe('OK. 0 lock(s) released for user 999424999');
		expect(await lockCount(USER_B)).toBe(1);

		await sweepScratchLocks();
	});

	// ---------------------------------------------------------------------
	// LAST IN THE FILE, ON PURPOSE.
	//
	// An empty/absent/null user_id takes the ALL-USERS path, which is
	// `DELETE FROM dedalo_ts_component_locks` with NO predicate: it releases
	// every lock row in the database, not just the ones this test seeded. That
	// collateral IS the function's contract ("unlock all users"), so `freed` is
	// asserted as a lower bound (>= the 2 seeded locks) and never as an exact
	// table-global count. Nothing may be seeded after this case.
	// ---------------------------------------------------------------------

	test('empty / null / absent user_id takes the all-users path (wipes the table)', async () => {
		for (const options of [
			{ fn_action: 'force_unlock_all_components', user_id: '' },
			{ fn_action: 'force_unlock_all_components', user_id: null },
			{ fn_action: 'force_unlock_all_components' },
		]) {
			await seedLock(USER_A, 990001);
			await seedLock(USER_B, 990002);
			expect(await lockCount(USER_A)).toBe(1);
			expect(await lockCount(USER_B)).toBe(1);

			const res = (await dispatchLockComponentsActions(ADMIN, options)) as {
				result: boolean;
				msg: string;
				freed: number;
			};

			expect(res.result).toBe(true);
			expect(res.freed).toBeGreaterThanOrEqual(2);
			expect(res.msg).toBe(`OK. ${res.freed} lock(s) released (all users)`);
			expect(res.msg).toContain('(all users)');
			expect(res.msg).not.toContain('for user');

			// Both seeded locks are gone — and so is everything else.
			expect(await lockCount(USER_A)).toBe(0);
			expect(await lockCount(USER_B)).toBe(0);
			const remaining = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM "${LOCK_TABLE}"`,
				[],
			)) as { n: number }[];
			expect(remaining[0]?.n).toBe(0);
		}
	});
});
