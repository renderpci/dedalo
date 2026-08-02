/**
 * COMMIT-ONLY LANE gates (W12, 2026-08-02 — observer-cascade prerequisite,
 * DEC-12 twin of registerCommitAction in src/core/db/postgres.ts).
 *
 * WHY A SEPARATE LANE EXISTS: deferPostTransaction is the CACHE-CLEAR lane —
 * it replays on ROLLBACK too (over-invalidation is harmless), its actions are
 * sync `() => void`, and it cannot carry a write. The observer cascade needs
 * the opposite contract: a hop scheduled inside a transaction must fire ONLY
 * if that transaction COMMITS (a hop for rolled-back state would propagate a
 * state that never existed), must support async actions with rejections
 * contained, and must run OUTSIDE the transaction context (so hops can open
 * their own transactions and the S2-14 expiry can never bite them).
 *
 * Gates here:
 *   1. ROLLBACK discards the queue — the action NEVER fires (the core W12
 *      requirement; reusing deferPostTransaction would fail this).
 *   2. COMMIT drains: async actions awaited, run strictly AFTER the commit,
 *      with NO ambient transaction visible inside the action.
 *   3. A rejecting action is contained; later actions still drain.
 *   4. Outside any transaction registerCommitAction returns false (caller
 *      owns the action).
 *   5. A nested (joined) withTransaction registers on the OUTER queue: the
 *      action does not fire when the inner callback returns, only at the
 *      outer commit.
 *   6. runDetachedFromTransaction exits the commit lane too: a detached job's
 *      registerCommitAction returns false and never rides the submitter's
 *      transaction outcome.
 *   7. Contrast pin: deferPostTransaction still replays on rollback (the two
 *      lanes must never converge silently).
 */

import { expect, test } from 'bun:test';
import {
	isInTransaction,
	registerCommitAction,
	sql,
	withTransaction,
} from '../../src/core/db/postgres.ts';

test('ROLLBACK discards the commit-only queue — the action never fires', async () => {
	let fired = 0;
	await expect(
		withTransaction(async () => {
			expect(
				registerCommitAction(() => {
					fired++;
				}),
			).toBe(true);
			throw new Error('forced rollback');
		}),
	).rejects.toThrow('forced rollback');
	// give any stray microtask a chance to run before asserting
	await Bun.sleep(5);
	expect(fired).toBe(0);
});

test('COMMIT drains async actions, after the commit, with no ambient transaction', async () => {
	const order: string[] = [];
	// starts true so the assertion below can only pass when the action RAN and
	// observed no ambient transaction (TS: keep the type a plain boolean).
	let sawAmbientTx = true;
	const result = await withTransaction(async () => {
		registerCommitAction(async () => {
			sawAmbientTx = isInTransaction();
			// async work is awaited: prove with a real query + a sleep
			await Bun.sleep(5);
			const rows = (await sql.unsafe('SELECT 41 + 1 AS n', [])) as { n: number }[];
			order.push(`action:${rows[0]?.n}`);
		});
		order.push('work');
		return 'done';
	});
	// withTransaction resolves only after the lane drained (awaited in finally)
	expect(result).toBe('done');
	expect(order).toEqual(['work', 'action:42']);
	expect(sawAmbientTx).toBe(false);
});

test('a rejecting action is contained; later actions still drain', async () => {
	const ran: string[] = [];
	await withTransaction(async () => {
		registerCommitAction(async () => {
			ran.push('first');
			throw new Error('action failure (contained)');
		});
		registerCommitAction(() => {
			ran.push('second');
		});
	});
	expect(ran).toEqual(['first', 'second']);
});

test('outside any transaction registerCommitAction returns false (caller owns the action)', () => {
	expect(registerCommitAction(() => {})).toBe(false);
});

test('a joined nested transaction registers on the OUTER queue', async () => {
	let fired = 0;
	await withTransaction(async () => {
		await withTransaction(async () => {
			expect(
				registerCommitAction(() => {
					fired++;
				}),
			).toBe(true);
		});
		// inner callback returned but the OUTER transaction is still open:
		// the action must not have fired yet.
		expect(fired).toBe(0);
	});
	expect(fired).toBe(1);
});

test('runDetachedFromTransaction exits the commit lane: registration refused, action never fires', async () => {
	// A detached background job inherits its submitter's ALS stores; if the
	// commit lane leaked through, the job's registerCommitAction would append
	// to a queue whose fate belongs to the submitter's transaction — firing
	// under the wrong outcome. The detach must exit ALL THREE stores
	// (review 2026-08-02: this half of runDetachedFromTransaction had no gate).
	const { runDetachedFromTransaction } = await import('../../src/core/db/postgres.ts');
	let fired = 0;
	await withTransaction(async () => {
		const accepted = runDetachedFromTransaction(() =>
			registerCommitAction(() => {
				fired++;
			}),
		);
		expect(accepted).toBe(false); // caller owns the action — no queue visible
	});
	await Bun.sleep(5);
	expect(fired).toBe(0); // and it never rode the submitter's commit
});

test('contrast pin: deferPostTransaction still replays on ROLLBACK (the lanes must not converge)', async () => {
	const { deferPostTransaction } = await import('../../src/core/db/postgres.ts');
	let cleared = 0;
	await expect(
		withTransaction(async () => {
			expect(
				deferPostTransaction(() => {
					cleared++;
				}),
			).toBe(true);
			throw new Error('forced rollback');
		}),
	).rejects.toThrow('forced rollback');
	expect(cleared).toBe(1);
});
