/**
 * JOB LANES, DEADLINES AND PUBLISHED DEPTH (PERF-11) — behavioural gate.
 *
 * Background work used to share ONE semaphore: `av_transcode`, `update_code`,
 * `update_data`, the dev long-process probe and every backgroundable tool action
 * competed for the same three slots, so a transcode queue starved the code
 * update an operator was waiting on. Three things had to become true, and this
 * gate asserts each of them by OBSERVING the manager, never by reading its
 * source:
 *
 *  1. PER-CLASS BUDGETS HOLD UNDER LOAD — a saturated lane queues its own class
 *     only, and another class starts immediately. That second half is the
 *     starvation clause: a budget that merely counts correctly but still makes
 *     maintenance wait behind media has fixed nothing.
 *
 *  2. A JOB PAST ITS DEADLINE IS CANCELLED — the `AbortController` that already
 *     existed is actually FIRED on time, the record goes terminal `stopped` with
 *     a reason, and — measured, because it is the design decision — the clock
 *     runs from RUN START, so a job starved behind a full lane is not killed for
 *     having waited. The lane slot is NOT released by the abort: it is released
 *     when the worker settles, because freeing it while the work still runs
 *     over-subscribes the box.
 *
 *  3. THE ABORT REACHES AN AWAITED OUTBOUND CALL — the clause worth naming on
 *     its own. Before this, a job's signal stopped at the worker's first await:
 *     `fetchBoundedText` built its own controller and knew nothing of the job,
 *     so a stopped or deadlined job went on holding a socket to its own
 *     15-second timeout. The test drives a REAL loopback server that never
 *     answers and asserts the fetch is aborted by the JOB, far inside that
 *     timeout.
 *
 * And 4: `/api/v1/counters` publishes per-lane `{active, queued, max}` — the
 * in-process twin of the diffusion queue depth, since a boolean cannot say WHICH
 * class is backed up.
 *
 * SITUATION-BUILDING: every case constructs its own `MediaJobManager` with the
 * budgets and deadlines it needs. No ambient state, no database, no install TLD.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { collectOpsCounters } from '../../src/core/api/counters.ts';
import { JOB_LANES, type JobLane, MediaJobManager } from '../../src/core/media/jobs.ts';
import { fetchBoundedText } from '../../src/core/security/ssrf_guard.ts';
import { mustGet } from '../helpers/assert.ts';

/**
 * A worker held open until `release()`. After the release the gate stays OPEN, so
 * a queued backlog drains instead of wedging on the next job's fresh promise —
 * the first version of this helper closed again and made the drain assertion
 * measure the helper rather than the manager.
 */
function gatedWorker(): {
	worker: () => Promise<unknown>;
	release: () => void;
	entered: () => number;
} {
	let entered = 0;
	let open = false;
	const waiting: (() => void)[] = [];
	return {
		worker: () => {
			entered += 1;
			if (open) return Promise.resolve(null);
			return new Promise((resolve) => waiting.push(() => resolve(null)));
		},
		release: () => {
			open = true;
			for (const done of waiting.splice(0)) done();
		},
		entered: () => entered,
	};
}

/** Poll until `predicate` holds or the budget runs out (no fixed sleeps). */
async function until(predicate: () => boolean, budgetMs = 2000): Promise<void> {
	const deadline = Date.now() + budgetMs;
	while (!predicate() && Date.now() < deadline) await Bun.sleep(5);
}

describe('per-lane budgets hold under load (PERF-11)', () => {
	test('a saturated lane queues its OWN class and lets another class straight through', async () => {
		const manager = new MediaJobManager({
			budgets: { media: 1, maintenance: 1 },
			deadlinesMs: { media: 0, maintenance: 0 },
		});
		const media = gatedWorker();
		const maintenance = gatedWorker();

		// Four media jobs against a one-slot media lane.
		for (let i = 0; i < 4; i++) manager.submit(`transcode_${i}`, media.worker, { lane: 'media' });
		await until(() => media.entered() > 0);
		expect(media.entered()).toBe(1); // the budget, observed

		// THE STARVATION CLAUSE: with the media lane full and three jobs queued
		// behind it, an operator's maintenance job must start NOW.
		const operatorJob = manager.submit('update_code', maintenance.worker, {
			lane: 'maintenance',
		});
		await until(() => maintenance.entered() > 0);
		expect(maintenance.entered()).toBe(1);
		expect(manager.status(operatorJob.id)?.status).toBe('running');

		// And the depth says exactly that: media saturated with a backlog,
		// maintenance busy with none.
		const depths = manager.laneDepths();
		expect(mustGet(depths.media, 'media depth')).toEqual({ active: 1, queued: 3, max: 1 });
		expect(mustGet(depths.maintenance, 'maintenance depth')).toEqual({
			active: 1,
			queued: 0,
			max: 1,
		});

		media.release();
		maintenance.release();
		await until(() => media.entered() === 4);
		expect(media.entered()).toBe(4); // the backlog drained, one at a time
	});

	test('one lane draining does not lend its slots to another', async () => {
		const manager = new MediaJobManager({
			budgets: { media: 2, rag: 1 },
			deadlinesMs: { media: 0, rag: 0 },
		});
		const rag = gatedWorker();
		for (let i = 0; i < 3; i++) manager.submit(`embed_${i}`, rag.worker, { lane: 'rag' });
		await until(() => rag.entered() > 0);
		// The media lane is completely idle; the rag lane must still hold at 1.
		expect(rag.entered()).toBe(1);
		expect(mustGet(manager.laneDepths().rag, 'rag depth')).toEqual({
			active: 1,
			queued: 2,
			max: 1,
		});
		expect(mustGet(manager.laneDepths().media, 'media depth')).toEqual({
			active: 0,
			queued: 0,
			max: 2,
		});
		rag.release();
		await until(() => rag.entered() === 3);
		rag.release();
	});
});

describe('per-job deadlines actually fire (PERF-11)', () => {
	test('a job past its deadline is aborted and marked stopped with a reason', async () => {
		const manager = new MediaJobManager({ budgets: { rag: 1 }, deadlinesMs: { rag: 40 } });
		let sawAbort = false;
		const record = manager.submit(
			'embed_forever',
			({ signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => {
						sawAbort = true;
						reject(new Error('aborted'));
					});
				}),
			{ lane: 'rag' },
		);
		await until(() => manager.status(record.id)?.status === 'stopped');
		expect(sawAbort).toBe(true);
		expect(manager.status(record.id)?.status).toBe('stopped');
		expect((manager.status(record.id)?.errors ?? []).join(' ')).toContain('deadline');
	});

	test('the per-submit override wins over the lane default', async () => {
		const manager = new MediaJobManager({ budgets: { media: 1 }, deadlinesMs: { media: 0 } });
		const record = manager.submit(
			'transcode_forever',
			({ signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new Error('aborted')));
				}),
			{ lane: 'media', deadlineMs: 40 },
		);
		// The media lane default is NO deadline; only the override can end this.
		await until(() => manager.status(record.id)?.status === 'stopped');
		expect(manager.status(record.id)?.status).toBe('stopped');
	});

	test('the clock starts at RUN START: a job starved behind a full lane is not killed for waiting', async () => {
		const manager = new MediaJobManager({
			budgets: { maintenance: 1 },
			deadlinesMs: { maintenance: 120 },
		});
		const blocker = gatedWorker();
		manager.submit('long_import', blocker.worker, { lane: 'maintenance' });
		await until(() => blocker.entered() > 0);

		// Queued behind it for longer than the whole deadline.
		let ran = false;
		const waiter = manager.submit(
			'update_code',
			async () => {
				ran = true;
				return 'ok';
			},
			{ lane: 'maintenance' },
		);
		await Bun.sleep(200); // > the 120 ms deadline, all of it spent QUEUED
		expect(manager.status(waiter.id)?.status).toBe('queued');

		blocker.release();
		await until(() => manager.status(waiter.id)?.status === 'done');
		// If the deadline had been armed at SUBMIT, this job would be 'stopped'
		// having never run — punished for another job's length.
		expect(ran).toBe(true);
		expect(manager.status(waiter.id)?.status).toBe('done');
	});

	test('a deadline does NOT hand the lane slot back while the worker still runs', async () => {
		const manager = new MediaJobManager({ budgets: { rag: 1 }, deadlinesMs: { rag: 40 } });
		let secondStarted = false;
		let releaseWedged: () => void = () => {};
		const wedged = manager.submit(
			'wedged',
			() => new Promise((resolve) => (releaseWedged = () => resolve(null))),
			{ lane: 'rag' },
		);
		await until(() => manager.status(wedged.id)?.status === 'stopped');
		manager.submit(
			'next',
			async () => {
				secondStarted = true;
				return null;
			},
			{ lane: 'rag' },
		);
		await Bun.sleep(80);
		// The record is terminal, but the WORK is still running: releasing the slot
		// here would over-subscribe the machine with a second heavy job.
		expect(secondStarted).toBe(false);
		expect(mustGet(manager.laneDepths().rag, 'rag depth')).toEqual({
			active: 1,
			queued: 1,
			max: 1,
		});

		releaseWedged();
		await until(() => secondStarted);
		expect(secondStarted).toBe(true);
	});
});

describe('the abort REACHES an awaited outbound call (PERF-11)', () => {
	// A loopback peer that accepts the connection and then never answers — the
	// shape of a wedged sidecar. `fetchBoundedText`'s own timeout is set far out,
	// so anything that ends this fetch quickly can only be the JOB's signal.
	// The hang is RELEASABLE: `afterAll` answers every parked request before it
	// stops the server. A handler that could only ever hang made teardown wait on
	// its own fixture — a test that fails on cleanup teaches nothing about lanes.
	const parked: ((response: Response) => void)[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch: () => new Promise<Response>((resolve) => parked.push(resolve)),
	});
	afterAll(async () => {
		for (const answer of parked.splice(0)) answer(new Response('late', { status: 200 }));
		await server.stop(true);
	});

	test('a deadlined job cancels the fetch its worker is awaiting', async () => {
		const manager = new MediaJobManager({
			budgets: { transcription: 1 },
			deadlinesMs: { transcription: 60 },
		});
		let outcome = '';
		let elapsed = 0;
		const record = manager.submit(
			'asr_batch',
			async () => {
				const startedAt = Date.now();
				try {
					// NOTE: no signal is threaded in. The point of the scope is that this
					// call — three frames from the worker, in another module — is
					// cancelled anyway.
					await fetchBoundedText(`http://127.0.0.1:${server.port}/transcribe`, {
						timeoutMs: 30_000,
					});
					outcome = 'returned';
				} catch (error) {
					outcome = (error as Error).name;
				} finally {
					elapsed = Date.now() - startedAt;
				}
				return null;
			},
			{ lane: 'transcription' },
		);

		await until(() => outcome !== '', 5000);
		// The fetch ended, and it ended because of the ABORT, not the 30 s timeout.
		expect(outcome).toBe('AbortError');
		expect(elapsed).toBeLessThan(5000);
		await until(() => manager.status(record.id)?.status === 'stopped');
		expect(manager.status(record.id)?.status).toBe('stopped');
	});

	test('an explicit stop() cancels the fetch too', async () => {
		const manager = new MediaJobManager({
			budgets: { transcription: 1 },
			deadlinesMs: { transcription: 0 },
		});
		let outcome = '';
		let started = false;
		const record = manager.submit(
			'asr_batch_stopped',
			async () => {
				started = true;
				try {
					await fetchBoundedText(`http://127.0.0.1:${server.port}/transcribe`, {
						timeoutMs: 30_000,
					});
					outcome = 'returned';
				} catch (error) {
					outcome = (error as Error).name;
				}
				return null;
			},
			{ lane: 'transcription' },
		);
		await until(() => started);
		expect(manager.stop(record.id)).toBe(true);
		await until(() => outcome !== '', 5000);
		expect(outcome).toBe('AbortError');
	});

	test('outside a job the transport keeps its OWN timeout and nothing else', async () => {
		// The control: no ambient job signal, so the only thing that can end this
		// fetch is the transport's own timeout — proving the composition ADDED the
		// job's cancellation rather than replacing the guarantee that was there.
		const startedAt = Date.now();
		let name = '';
		try {
			await fetchBoundedText(`http://127.0.0.1:${server.port}/transcribe`, { timeoutMs: 120 });
		} catch (error) {
			name = (error as Error).name;
		}
		expect(name).toBe('AbortError');
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
	});
});

describe('per-lane depth is PUBLISHED on /api/v1/counters (PERF-11)', () => {
	test('media_jobs carries {active, queued, max} for every lane', async () => {
		const payload = await collectOpsCounters();
		const mediaJobsGauge = payload.media_jobs as {
			has_headroom: boolean;
			lanes: Record<string, { active: number; queued: number; max: number }>;
		};
		// The legacy boolean stays (its consumers are unchanged)…
		expect(typeof mediaJobsGauge.has_headroom).toBe('boolean');
		// …and the depth is now there for EVERY lane, which is what a boolean
		// could never say.
		expect(Object.keys(mediaJobsGauge.lanes).sort()).toEqual([...JOB_LANES].sort());
		for (const lane of JOB_LANES satisfies readonly JobLane[]) {
			const depth = mustGet(mediaJobsGauge.lanes[lane], `${lane} depth`);
			expect(typeof depth.active).toBe('number');
			expect(typeof depth.queued).toBe('number');
			expect(depth.max).toBeGreaterThanOrEqual(1);
		}
	});
});
