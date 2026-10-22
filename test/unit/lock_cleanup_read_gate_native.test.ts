/**
 * update_lock_components_state — WHICH lock actions need the section read gate
 * (WC-2026-10-23-own-lock-cleanup-ungated).
 *
 * THE OWNER REPORT: a regular user holding a section's §7.4 time_machine_list
 * grant paginated the inspector "Latest changes" list (an embedded dd15
 * section) and got a 403: the section's navigate() sent
 * `delete_user_section_locks` for section_tipo 'dd15', and the handler's read
 * gate — getPermissions(principal, 'dd15', 'dd15'), 0 for every non-admin on
 * a bare dd15 — refused it.
 *
 * THE RULE: the read gate exists so a user cannot fabricate focus/blur on
 * records they cannot see (focus ACQUIRES a lock other users then hit; blur
 * names a record). `delete_user_section_locks` deletes only the CALLER's own
 * rows (`user_id = principal`) — it can neither create state nor touch another
 * user's live lock — so it needs no read gate. Every other action (focus, blur,
 * an unknown one) stays gated, fail-closed.
 *
 * Every leg goes through the HANDLER (utilsApiActions), never the locks module:
 * the defect lived in the handler's gate.
 *
 * SCRATCH SURFACE: the TS lock table only, synthetic user ids 424281/424282
 * (no matrix_users row: the non-admin has no profile, so level 0 everywhere),
 * scratch section_ids 990101..990103 on the generic `test3` section; swept
 * fail-loud in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { utilsApiActions } from '../../src/core/api/handlers/dd_utils_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { updateLockComponentsState } from '../../src/core/section/locks.ts';
import { getPermissions, type Principal } from '../../src/core/security/permissions.ts';

const LOCK_TABLE = 'dedalo_ts_component_locks';
const SECTION_TIPO = 'test3';
const COMPONENT_TIPO = 'test78';
const TM_SECTION = 'dd15';

/** The regular user: no profile, so no read on test3 nor on a bare dd15. */
const CALLER_ID = 424281;
/** Another user holding a LIVE lock in the same section. */
const OTHER_ID = 424282;
const SCRATCH_USERS = [CALLER_ID, OTHER_ID];

const CALLER: Principal = { userId: CALLER_ID, isGlobalAdmin: false, isDeveloper: false };

function contextFor(principal: Principal): ApiRequestContext {
	return {
		requestId: `lock-gate-${crypto.randomUUID()}`,
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	} as unknown as ApiRequestContext;
}

/** One update_lock_components_state call through the real handler. */
async function lockAction(principal: Principal, options: Record<string, unknown>) {
	const handler = utilsApiActions.update_lock_components_state;
	if (handler === undefined) throw new Error('update_lock_components_state is not registered');
	return handler(
		{ dd_api: 'dd_utils_api', action: 'update_lock_components_state', options } as unknown as Rqo,
		contextFor(principal),
	);
}

/** The DedaloError the handler refused with. */
async function refused(
	principal: Principal,
	options: Record<string, unknown>,
): Promise<DedaloError> {
	try {
		await lockAction(principal, options);
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error('expected update_lock_components_state to refuse, it answered');
}

/** Seed one lock through the real acquisition path (the module, below the gate). */
async function seedLock(userId: number, sectionId: number): Promise<void> {
	const res = await updateLockComponentsState({
		section_tipo: SECTION_TIPO,
		section_id: sectionId,
		component_tipo: COMPONENT_TIPO,
		action: 'focus',
		user_id: userId,
		full_username: `scratch user ${userId}`,
	});
	// A seed that did not acquire would make every downstream assertion vacuous.
	expect(res.applied).toBe(true);
}

/** Live row count for one synthetic user in the scratch section. */
async function lockCount(userId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${LOCK_TABLE}" WHERE user_id = $1 AND section_tipo = $2`,
		[userId, SECTION_TIPO],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function sweep(): Promise<void> {
	for (const userId of SCRATCH_USERS) {
		await sql.unsafe(`DELETE FROM "${LOCK_TABLE}" WHERE user_id = $1`, [userId]);
	}
}

beforeAll(async () => {
	// ensureTable() runs on first use; then start clean.
	await seedLock(CALLER_ID, 990101);
	await sweep();
});

afterAll(async () => {
	await sweep();
	for (const userId of SCRATCH_USERS) expect(await lockCount(userId)).toBe(0);
});

describe('update_lock_components_state read gate', () => {
	test('precondition: the caller holds no read on test3 nor on a bare dd15', async () => {
		// Without this, an "ok" below would prove nothing about the gate.
		expect(await getPermissions(CALLER, SECTION_TIPO, SECTION_TIPO)).toBe(0);
		expect(await getPermissions(CALLER, TM_SECTION, TM_SECTION)).toBe(0);
	});

	test("delete_user_section_locks on an unreadable section: ok, only the caller's own rows go", async () => {
		await seedLock(CALLER_ID, 990101);
		await seedLock(CALLER_ID, 990102);
		await seedLock(OTHER_ID, 990103);
		expect(await lockCount(CALLER_ID)).toBe(2);
		expect(await lockCount(OTHER_ID)).toBe(1);

		const result = await lockAction(CALLER, {
			section_tipo: SECTION_TIPO,
			section_id: null,
			component_tipo: null,
			action: 'delete_user_section_locks',
		});
		expect(result.status).toBe(200);
		expect((result.body as { ok?: unknown }).ok).toBe(true);
		expect(await lockCount(CALLER_ID)).toBe(0);
		// Another user's LIVE lock in the same section is untouched.
		expect(await lockCount(OTHER_ID)).toBe(1);
	});

	test('delete_user_section_locks for dd15 (the inspector Latest changes pagination): ok', async () => {
		const result = await lockAction(CALLER, {
			section_tipo: TM_SECTION,
			section_id: null,
			component_tipo: null,
			action: 'delete_user_section_locks',
		});
		expect(result.status).toBe(200);
		expect((result.body as { ok?: unknown }).ok).toBe(true);
		expect(await lockCount(OTHER_ID)).toBe(1);
	});

	test('focus on an unreadable section: perm.denied, nothing acquired', async () => {
		const before = await lockCount(CALLER_ID);
		const error = await refused(CALLER, {
			section_tipo: SECTION_TIPO,
			section_id: 990102,
			component_tipo: COMPONENT_TIPO,
			action: 'focus',
		});
		expect(error.code).toBe('perm.denied');
		expect(await lockCount(CALLER_ID)).toBe(before);
	});

	test("blur on an unreadable section: perm.denied, the other user's lock survives", async () => {
		const error = await refused(CALLER, {
			section_tipo: SECTION_TIPO,
			section_id: 990103,
			component_tipo: COMPONENT_TIPO,
			action: 'blur',
		});
		expect(error.code).toBe('perm.denied');
		expect(await lockCount(OTHER_ID)).toBe(1);
	});

	test('an unknown action on an unreadable section: still gated (fail-closed)', async () => {
		const error = await refused(CALLER, { section_tipo: SECTION_TIPO, action: 'steal_all' });
		expect(error.code).toBe('perm.denied');
	});

	test('section_tipo is still required for delete_user_section_locks', async () => {
		const error = await refused(CALLER, { action: 'delete_user_section_locks' });
		expect(error.code).toBe('request.invalid_options');
	});
});
