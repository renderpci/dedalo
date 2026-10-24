/**
 * A COALESCED SCHEDULER RE-RUN NEVER CLAIMS PAST A PAUSE (closure review cross-diffusion:r5, S3).
 *
 * schedulerTick checks `paused` once at entry, then hands off to the single-flight claimPass
 * (coalescingKick): a kick that lands DURING a pass buys one more pass after it — and that re-run
 * does NOT come back through schedulerTick. An admin who pauses (or starts a drain) mid-pass would
 * see the re-run claim and spawn anyway, unless claimPass re-checks the flag itself
 * (scheduler.ts claimPass's first line). That re-check had no gate.
 *
 * WHAT IS ASSERTED — the REAL schedulerTick → claimPass path, with the one claim primitive
 * (queue.ts claimNextQueuedJob) observed: a pass blocks inside its claim; a second kick lands
 * (coalesced); pauseScheduler(); the pass is released (queue empty). The re-run then claims
 * NOTHING: claimNextQueuedJob was called exactly once. Non-vacuity: the same choreography WITHOUT
 * the pause makes the re-run claim (two calls) — so the coalesced re-run really ran.
 *
 * HERMETIC: the claim primitive is spied (returns null: nothing is spawned), no database.
 */

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as queue from '../../src/diffusion/jobs/queue.ts';
import {
	pauseScheduler,
	resumeScheduler,
	schedulerTick,
} from '../../src/diffusion/jobs/scheduler.ts';

afterEach(() => resumeScheduler()); // never leak a paused scheduler to sibling suites

/** Runs the choreography; returns how many times the claim primitive was called. */
async function coalescedPass(pauseMidPass: boolean): Promise<number> {
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	let entered!: () => void;
	const inClaim = new Promise<void>((resolve) => {
		entered = resolve;
	});
	let calls = 0;
	const spy = spyOn(queue, 'claimNextQueuedJob').mockImplementation(async () => {
		calls += 1;
		if (calls === 1) {
			entered();
			await blocked;
		}
		return null;
	});
	try {
		const first = schedulerTick();
		await inClaim;
		await schedulerTick(); // lands mid-pass: coalesced into one re-run, returns at once
		if (pauseMidPass) pauseScheduler();
		release();
		await first; // the pass AND its coalesced re-run
	} finally {
		spy.mockRestore();
	}
	return calls;
}

describe('scheduler: the coalesced re-run re-checks the pause', () => {
	test('control: without a pause the coalesced re-run claims', async () => {
		expect(await coalescedPass(false)).toBe(2);
	});

	test('a pause that lands mid-pass stops the re-run from claiming', async () => {
		expect(await coalescedPass(true)).toBe(1);
	});
});
