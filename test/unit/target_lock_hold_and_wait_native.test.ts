/**
 * NO HOLD-AND-WAIT ON PUBLICATION TARGETS (owner decision 6, 2026-10-21; DIFF-2
 * residual "generic hold-and-wait refusal in target_lock.ts").
 *
 * THE FINDING. withTargetLocks is all-or-none for the keys of ONE call, but
 * nothing stopped a door from asking for a target while its transaction
 * already HELD another: a runner's unit holding `sql:A` that waited on
 * `sql:B`, while B's holder waited on A, is a cycle — each side keeps what it
 * has through every backoff ('wait' mode: forever; a bound: both stall to the
 * end of it). The lock is xact-scoped, so "held" means held by the current
 * TRANSACTION: a door nested in another unit, and a door called after another
 * one inside the same ambient transaction (whose key the ambient keeps until
 * it ends), both hold while they ask.
 *
 * THE RULE (target_lock.ts "NO HOLD-AND-WAIT"): a call whose transaction
 * already holds a target lock may only re-take what it holds — the same keys,
 * in a mode the held one covers (exclusive covers both; shared covers shared).
 * Anything else — another target, or an upgrade shared → exclusive — throws the
 * typed internal.invariant BEFORE the first try: it takes nothing and waits for
 * nothing, whatever the mode and whether the target is free or busy.
 *
 * WHAT IS ASSERTED (outcomes, from ANOTHER Postgres session where it matters):
 *   R1 nested other target, BUSY elsewhere, bounded mode → refused at once (no
 *      wait spent), its work never ran;
 *   R2 nested other target, FREE → refused anyway, and nothing taken (the
 *      target stays free seen from another session); 'try' mode refused too;
 *   R3 sequential doors in ONE ambient transaction → the second refused (the
 *      first key is still the ambient's);
 *   R4 upgrade shared → exclusive on the same key → refused;
 *   S1 same key re-entered (exclusive/exclusive, exclusive→shared,
 *      shared/shared) → acquired, work ran;
 *   S2 a multi-key holder re-entering a SUBSET → acquired; a superset → refused;
 *   C1 sequential units each in its own transaction → both acquired (control);
 *   C2 a door detached from the holder's transaction (runDetachedFromTransaction —
 *      the media-copy worker's lane) is another session holding nothing →
 *      acquired (the rule is the transaction's holdings, not the async context's);
 *   C3 the refusal does not poison the holder: its unit commits, its key frees.
 *
 * WRITES: none. Advisory locks on the lane database (unique zz keys), released.
 */

import { describe, expect, test } from 'bun:test';
import { runDetachedFromTransaction, sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	withTargetLock,
	withTargetLocks,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../src/core/errors/index.ts';

const KEY_A = `sql:zz_hold_wait_a_${process.pid}`;
const KEY_B = `sql:zz_hold_wait_b_${process.pid}`;
const KEY_C = `files:zz_hold_wait/c_${process.pid}`;

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

/** The refusal, captured: the typed error (or null when the call did not throw) + how long it took. */
async function refusalOf(
	call: () => Promise<unknown>,
): Promise<{ error: DedaloError | null; other: unknown; ms: number; value: unknown }> {
	const startedAt = Date.now();
	try {
		const value = await call();
		return { error: null, other: null, ms: Date.now() - startedAt, value };
	} catch (error) {
		const ms = Date.now() - startedAt;
		if (error instanceof DedaloError) return { error, other: null, ms, value: undefined };
		return { error: null, other: error, ms, value: undefined };
	}
}

function expectHoldAndWaitRefusal(
	refusal: Awaited<ReturnType<typeof refusalOf>>,
	requested: string,
): void {
	expect(refusal.other, 'the refusal must be the typed DedaloError, not a raw throw').toBeNull();
	expect(
		refusal.error,
		`acquiring ${requested} while the transaction holds a target lock was NOT refused (answered ${JSON.stringify(refusal.value)})`,
	).not.toBeNull();
	expect(refusal.error?.code).toBe('internal.invariant');
	expect(refusal.error?.coordinates?.operation).toBe('target_lock.hold_and_wait');
	expect(String(refusal.error?.coordinates?.requested)).toContain(requested);
}

describe('target lock — a transaction that holds a target never waits for another', () => {
	test('R1 nested other target, busy elsewhere, bounded mode → refused at once, work never ran', async () => {
		const holder = await sql.reserve();
		try {
			await holder.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				KEY_B,
			]);
			const ran: string[] = [];
			// The holder's own work records too: `ran` is live, so its contents say
			// which work ran — the holder's, never the refused door's.
			const outer = await withTargetLock(
				KEY_A,
				async () => {
					ran.push('holder');
					return refusalOf(() =>
						withTargetLock(
							KEY_B,
							async () => {
								ran.push('inner');
							},
							{ mode: { boundMs: 3_000 } },
						),
					);
				},
				{ mode: 'try' },
			);
			expect(outer.acquired).toBe(true);
			if (!outer.acquired) return;
			expectHoldAndWaitRefusal(outer.value, KEY_B);
			expect(ran).toEqual(['holder']);
			// "Before waiting": not one backoff step (250 ms) was spent.
			expect(outer.value.ms).toBeLessThan(250);
		} finally {
			await holder.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				KEY_B,
			]);
			holder.release();
		}
	}, 20_000);

	test('R2 nested other target, FREE → refused anyway and nothing taken; try mode refused too', async () => {
		const observer = await sql.reserve();
		try {
			const ran: string[] = [];
			const outer = await withTargetLock(KEY_A, async () => {
				ran.push('holder');
				const waiting = await refusalOf(() =>
					withTargetLock(KEY_B, async () => {
						ran.push('wait');
					}),
				);
				const freeAfter = await freeFrom(observer, KEY_B);
				const trying = await refusalOf(() =>
					withTargetLocks(
						[KEY_C],
						async () => {
							ran.push('try');
						},
						{ mode: 'try' },
					),
				);
				return { waiting, trying, freeAfter };
			});
			expect(outer.acquired).toBe(true);
			if (!outer.acquired) return;
			expectHoldAndWaitRefusal(outer.value.waiting, KEY_B);
			expectHoldAndWaitRefusal(outer.value.trying, KEY_C);
			expect(outer.value.freeAfter, 'the refused call took the target it asked for').toBe(true);
			expect(ran).toEqual(['holder']);
		} finally {
			observer.release();
		}
	});

	test('R3 two doors in ONE ambient transaction → the second refused (the first key is the ambient’s)', async () => {
		const ran: string[] = [];
		const { first, second } = await withTransaction(async () => {
			const first = await withTargetLock(
				KEY_A,
				async () => {
					ran.push('first');
				},
				{ mode: 'try' },
			);
			const second = await refusalOf(() =>
				withTargetLock(
					KEY_B,
					async () => {
						ran.push('second');
					},
					{ mode: 'try' },
				),
			);
			return { first, second };
		});
		expect(first.acquired).toBe(true);
		expectHoldAndWaitRefusal(second, KEY_B);
		expect(ran).toEqual(['first']);
	});

	test('R4 upgrade shared → exclusive on the same key → refused', async () => {
		const outer = await withTargetLock(
			KEY_A,
			async () => refusalOf(() => withTargetLock(KEY_A, async () => 'upgraded', { mode: 'try' })),
			{ mode: 'try', shared: true },
		);
		expect(outer.acquired).toBe(true);
		if (!outer.acquired) return;
		expectHoldAndWaitRefusal(outer.value, KEY_A);
	});

	test('S1 the same key re-entered in a covered mode → acquired, work ran', async () => {
		const cases: { outerShared: boolean; innerShared: boolean }[] = [
			{ outerShared: false, innerShared: false },
			{ outerShared: false, innerShared: true },
			{ outerShared: true, innerShared: true },
		];
		for (const { outerShared, innerShared } of cases) {
			const outer = await withTargetLock(
				KEY_A,
				() => withTargetLock(KEY_A, async () => 'inner ran', { mode: 'try', shared: innerShared }),
				{ mode: 'try', shared: outerShared },
			);
			expect(outer, `outer shared=${outerShared}, inner shared=${innerShared}`).toEqual({
				acquired: true,
				value: { acquired: true, value: 'inner ran' },
			});
		}
		// A shared re-entry never WEAKENS an exclusive holding: exclusive → shared
		// → exclusive again is still a re-entry, not an upgrade.
		const chain = await withTargetLock(
			KEY_A,
			() =>
				withTargetLock(
					KEY_A,
					() => withTargetLock(KEY_A, async () => 'innermost ran', { mode: 'try' }),
					{ mode: 'try', shared: true },
				),
			{ mode: 'try' },
		);
		expect(chain).toEqual({
			acquired: true,
			value: { acquired: true, value: { acquired: true, value: 'innermost ran' } },
		});
	});

	test('S2 a multi-key holder re-enters a SUBSET; a superset is refused', async () => {
		const outer = await withTargetLocks(
			[KEY_A, KEY_B],
			async () => ({
				subset: await withTargetLocks([KEY_B], async () => 'subset ran', { mode: 'try' }),
				superset: await refusalOf(() =>
					withTargetLocks([KEY_A, KEY_C], async () => 'superset ran', { mode: 'try' }),
				),
			}),
			{ mode: 'try' },
		);
		expect(outer.acquired).toBe(true);
		if (!outer.acquired) return;
		expect(outer.value.subset).toEqual({ acquired: true, value: 'subset ran' });
		expectHoldAndWaitRefusal(outer.value.superset, KEY_C);
	});

	test('C1 control: sequential units, each its own transaction → both acquired', async () => {
		const first = await withTargetLock(KEY_A, async () => 'a', { mode: 'try' });
		const second = await withTargetLock(KEY_B, async () => 'b', { mode: 'try' });
		expect(first).toEqual({ acquired: true, value: 'a' });
		expect(second).toEqual({ acquired: true, value: 'b' });
	});

	test('C2 control: a door detached from the holder’s transaction holds nothing → acquired', async () => {
		const outer = await withTargetLock(
			KEY_A,
			() =>
				runDetachedFromTransaction(() =>
					withTargetLock(KEY_B, async () => 'detached ran', { mode: 'try' }),
				),
			{ mode: 'try' },
		);
		expect(outer).toEqual({ acquired: true, value: { acquired: true, value: 'detached ran' } });
	});

	test('C3 control: the refusal does not poison the holder — its unit commits, its key frees', async () => {
		const observer = await sql.reserve();
		try {
			const outer = await withTargetLock(
				KEY_A,
				async () => {
					await refusalOf(() => withTargetLock(KEY_B, async () => undefined, { mode: 'try' }));
					const rows = (await sql.unsafe('SELECT 1 AS alive')) as { alive: number }[];
					return Number(rows[0]?.alive);
				},
				{ mode: 'try' },
			);
			expect(outer).toEqual({ acquired: true, value: 1 });
			expect(await freeFrom(observer, KEY_A)).toBe(true);
		} finally {
			observer.release();
		}
	});
});
