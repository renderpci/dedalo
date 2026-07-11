/**
 * Component edit-locks — the TS-native relational model (see
 * src/core/section/locks.ts for the redesign rationale).
 *
 * THE GUARANTEE under test: while a user holds a component of a record, no
 * other user can acquire it; blur/navigation release; expired locks are
 * takeable; locks held by PHP users (legacy registry) still block TS users.
 * Uses a disposable triple; cleans the lock table and restores the legacy
 * registry afterwards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	forceUnlockAllComponents,
	getLockStatus,
	updateLockComponentsState,
} from '../../src/core/section/locks.ts';

const TRIPLE = { section_id: '999901', section_tipo: 'test2', component_tipo: 'numisdata16' };
// SCRATCH user ids, deliberately NOT root (-1): forceUnlockAllComponents
// releases every lock its user holds ACROSS records, and root legitimately
// holds live locks on a dev box (the :3500 client session, concurrent suite
// files) — an exact freed-count pin on root races that shared state
// (observed under full-suite load: freed 4 ≠ 2, 2026-07-11).
const USER_A = { user_id: 424241, full_username: 'Debug user' };
const USER_B = { user_id: 424242, full_username: 'Other user' };

let savedLegacy: string | null = null;

beforeAll(async () => {
	const rows = (await sql`SELECT data::text AS raw FROM matrix_notifications WHERE id = 1`) as {
		raw: string;
	}[];
	savedLegacy = rows[0]?.raw ?? null;
});

afterAll(async () => {
	await sql`DELETE FROM dedalo_ts_component_locks WHERE section_tipo = ${TRIPLE.section_tipo}`;
	if (savedLegacy !== null) {
		await sql.unsafe('UPDATE matrix_notifications SET data = $1::text::jsonb WHERE id = 1', [
			savedLegacy,
		]);
	}
});

describe('component edit-locks (TS-native model)', () => {
	test('focus acquires; the SAME user re-focusing renews without conflict', async () => {
		const first = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_A });
		expect(first.result).toBe(true);
		expect(first.in_use).toBe(false);

		const again = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_A });
		expect(again.result).toBe(true);
		expect(again.in_use).toBe(false);
	});

	test('ANOTHER user focusing the same triple gets in_use with the holder name', async () => {
		const conflict = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_B });
		expect(conflict.result).toBe(false);
		expect(conflict.in_use).toBe(true);
		expect(conflict.full_username).toBe('Debug user');

		const status = await getLockStatus({ ...TRIPLE, user_id: USER_B.user_id });
		expect(status.in_use).toBe(true);
		expect(status.full_username).toBe('Debug user');
	});

	test("switching fields drops the user's OTHER lock on the record", async () => {
		// USER_A moves to a second component of the same record…
		const second = await updateLockComponentsState({
			...TRIPLE,
			component_tipo: 'numisdata17',
			action: 'focus',
			...USER_A,
		});
		expect(second.result).toBe(true);
		// …so the first component is free for USER_B now.
		const acquire = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_B });
		expect(acquire.result).toBe(true);
		expect(acquire.in_use).toBe(false);
	});

	test('blur releases only the holder; delete_user_section_locks clears the user', async () => {
		// USER_A blurring USER_B's lock must NOT release it.
		await updateLockComponentsState({ ...TRIPLE, action: 'blur', ...USER_A });
		const stillHeld = await getLockStatus({ ...TRIPLE, user_id: USER_A.user_id });
		expect(stillHeld.in_use).toBe(true);

		// Section navigation cleanup clears everything USER_B holds in the section.
		const cleared = await updateLockComponentsState({
			section_id: null,
			section_tipo: TRIPLE.section_tipo,
			component_tipo: null,
			action: 'delete_user_section_locks',
			...USER_B,
		});
		expect(cleared.result).toBe(true);
		const free = await getLockStatus({ ...TRIPLE, user_id: USER_A.user_id });
		expect(free.in_use).toBe(false);
	});

	test('an EXPIRED lock is silently taken over (crash recovery)', async () => {
		await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_A });
		// Backdate the lock beyond the TTL (a crashed tab never blurs).
		await sql.unsafe(
			`UPDATE dedalo_ts_component_locks SET locked_at = now() - interval '10 minutes'
			 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3`,
			[TRIPLE.section_tipo, TRIPLE.section_id, TRIPLE.component_tipo],
		);
		const takeover = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_B });
		expect(takeover.result).toBe(true);
		expect(takeover.in_use).toBe(false);
		// cleanup for the next test
		await updateLockComponentsState({ ...TRIPLE, action: 'blur', ...USER_B });
	});

	test('a LIVE lock held by a PHP user (legacy registry) blocks TS users', async () => {
		const phpEvent = {
			...TRIPLE,
			action: 'focus',
			user_id: 777,
			full_username: 'PHP user',
			date: new Date().toISOString().slice(0, 19).replace('T', ' '),
		};
		await sql.unsafe('UPDATE matrix_notifications SET data = $1::text::jsonb WHERE id = 1', [
			JSON.stringify([phpEvent]),
		]);
		const blocked = await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_A });
		expect(blocked.in_use).toBe(true);
		expect(blocked.full_username).toBe('PHP user');
	});

	test('an unknown action is refused', async () => {
		const refused = await updateLockComponentsState({ ...TRIPLE, action: 'hijack', ...USER_A });
		expect(refused.result).toBe(false);
		expect(refused.msg).toContain('not valid');
	});

	test('forceUnlockAllComponents releases only the reader; other users untouched (§10)', async () => {
		// Hermetic start: clear residual TS locks AND the legacy registry a prior
		// test populated (it would block USER_A's focus on record 999901).
		await sql`DELETE FROM dedalo_ts_component_locks WHERE section_tipo = ${TRIPLE.section_tipo}`;
		await sql.unsafe(`UPDATE matrix_notifications SET data = '[]'::jsonb WHERE id = 1`);
		// USER_A holds one lock on EACH of two records (a user holds at most one
		// lock per record); USER_B holds a lock on the first record.
		await updateLockComponentsState({ ...TRIPLE, action: 'focus', ...USER_A });
		await updateLockComponentsState({
			...TRIPLE,
			section_id: '999902',
			action: 'focus',
			...USER_A,
		});
		await updateLockComponentsState({
			...TRIPLE,
			component_tipo: 'numisdata18',
			action: 'focus',
			...USER_B,
		});
		// The read-path hook releases every lock USER_A holds across records…
		const freed = await forceUnlockAllComponents(USER_A.user_id);
		expect(freed).toBe(2);
		// …USER_A's first-record lock is now free…
		const aFree = await getLockStatus({ ...TRIPLE, user_id: USER_B.user_id });
		expect(aFree.in_use).toBe(false);
		// …but USER_B's lock survives.
		const bStatus = await getLockStatus({
			...TRIPLE,
			component_tipo: 'numisdata18',
			user_id: USER_A.user_id,
		});
		expect(bStatus.in_use).toBe(true);
		expect(bStatus.full_username).toBe('Other user');
	});
});
