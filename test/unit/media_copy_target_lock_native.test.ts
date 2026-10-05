/**
 * The media-copy target lock key (PUBLICATION_HOST_SPEC §5.2, decision M4): one
 * key per copy-mode publication host, in the SAME advisory class as every other
 * publication target, so a copy unit in one process excludes a copy unit for
 * the same host in another — and never a different host or an sql/files target.
 *
 * WRITES: none. Advisory locks on the lane database, released.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	fileTargetLockKey,
	mediaCopyTargetLockKey,
	sqlTargetLockKey,
	withTargetLock,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../src/core/errors/index.ts';

async function holdLock(key: string): Promise<{ release: () => Promise<void> }> {
	const connection = await sql.reserve();
	await connection.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
		DIFFUSION_TARGET_LOCK_CLASS,
		key,
	]);
	return {
		async release() {
			await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				key,
			]);
			connection.release();
		},
	};
}

describe('mediaCopyTargetLockKey', () => {
	test('names the host in its own key space', () => {
		expect(mediaCopyTargetLockKey('pub1')).toBe('media:pub1');
		expect(mediaCopyTargetLockKey('pub1')).not.toBe(sqlTargetLockKey('pub1'));
		expect(mediaCopyTargetLockKey('pub1')).not.toBe(fileTargetLockKey('media', 'pub1'));
	});

	test.each([[''], ['p'], ['Pub1'], ['1pub'], ['pub-1'], ['pub/../x'], ['a'.repeat(40)]])(
		'refuses a name the registry could never hold: %p',
		(name) => {
			let caught: unknown = null;
			try {
				mediaCopyTargetLockKey(name);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(DedaloError);
			expect((caught as DedaloError).code).toBe('internal.invariant');
		},
	);

	test('a held key keeps out a unit for the same host, never one for another host', async () => {
		const holder = await holdLock(mediaCopyTargetLockKey('pubtest_a'));
		try {
			const same = await withTargetLock(mediaCopyTargetLockKey('pubtest_a'), async () => 'ran', {
				mode: 'try',
			});
			expect(same).toEqual({ acquired: false, reason: 'busy', busyKey: 'media:pubtest_a' });
			const other = await withTargetLock(mediaCopyTargetLockKey('pubtest_b'), async () => 'ran', {
				mode: 'try',
			});
			expect(other).toEqual({ acquired: true, value: 'ran' });
		} finally {
			await holder.release();
		}
	});
});
