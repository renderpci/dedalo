/**
 * A NESTED TARGET-LOCK TRY RELEASES WHAT IT TOOK (closure review
 * cross-diffusion:r3, S3 "tryUnit/withTargetLocks claim a nested try is a
 * savepoint … but withTransaction just joins the ambient transaction").
 *
 * THE FINDING. withTargetLocks promises ALL OR NONE: a try that finds one key
 * busy rolls back, releasing the keys it took, and waits holding nothing of its
 * own. Nested on an ambient transaction, withTransaction only JOINS it — there
 * was no savepoint — so the xact-scoped lock of the first key stayed with the
 * ambient transaction while the door reported busy (and, in a waiting mode,
 * kept it through every backoff): a free target locked by a door that did not
 * get in.
 *
 * WHAT IS ASSERTED, from ANOTHER Postgres session (the one a runner would use):
 *   - inside an ambient transaction, withTargetLocks([A, B]) with B held
 *     elsewhere answers busy on B AND leaves A free — measured while the ambient
 *     transaction is still open;
 *   - the positive control: a nested try that gets in holds its key until the
 *     AMBIENT transaction ends (the lock is the ambient unit's), then frees it.
 *
 * WRITES: none. Advisory locks on the lane database (unique zz keys), released.
 */

import { describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	withTargetLocks,
} from '../../src/core/diffusion_bridge/target_lock.ts';

const KEY_A = `sql:zz_nested_try_a_${process.pid}`;
const KEY_B = `sql:zz_nested_try_b_${process.pid}`;

type Reserved = Awaited<ReturnType<typeof sql.reserve>>;

/** Is `key` free right now, seen from `other` (a try that releases at once when it gets in)? */
async function freeFrom(other: Reserved, key: string): Promise<boolean> {
	const rows = (await other.unsafe('SELECT pg_try_advisory_lock($1::int, hashtext($2)) AS got', [
		DIFFUSION_TARGET_LOCK_CLASS,
		key,
	])) as { got: boolean }[];
	const got = rows[0]?.got === true;
	if (got) {
		await other.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
			DIFFUSION_TARGET_LOCK_CLASS,
			key,
		]);
	}
	return got;
}

describe('a nested withTargetLocks try is all or none', () => {
	test('busy on B leaves A FREE, while the ambient transaction is still open', async () => {
		const holder = await sql.reserve();
		const observer = await sql.reserve();
		try {
			await holder.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				KEY_B,
			]);
			const ran: string[] = [];
			const { outcome, freeWhileAmbient } = await withTransaction(async () => {
				const tried = await withTargetLocks(
					[KEY_A, KEY_B],
					async () => {
						ran.push('work');
					},
					{ mode: 'try' },
				);
				return { outcome: tried, freeWhileAmbient: await freeFrom(observer, KEY_A) };
			});
			expect(outcome).toEqual({ acquired: false, reason: 'busy', busyKey: KEY_B });
			expect(ran).toEqual([]);
			expect(
				freeWhileAmbient,
				'the nested try kept the FREE target A locked after B was found busy — all-or-none broken',
			).toBe(true);
		} finally {
			await holder.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				KEY_B,
			]);
			holder.release();
			observer.release();
		}
	});

	test('control: a nested try that gets in holds its key until the ambient transaction ends', async () => {
		const observer = await sql.reserve();
		try {
			// The same `ran` observation the busy leg reads empty — live here, so an
			// empty `ran` there is the door refusing, never a callback that cannot run.
			const ran: string[] = [];
			const { tried, heldWhileAmbient } = await withTransaction(async () => ({
				tried: await withTargetLocks(
					[KEY_A],
					async () => {
						ran.push('work');
						return 'in';
					},
					{ mode: 'try' },
				),
				heldWhileAmbient: !(await freeFrom(observer, KEY_A)),
			}));
			expect(tried).toEqual({ acquired: true, value: 'in' });
			expect(ran).toHaveLength(1);
			expect(heldWhileAmbient).toBe(true);
			expect(await freeFrom(observer, KEY_A)).toBe(true);
		} finally {
			observer.release();
		}
	});
});
