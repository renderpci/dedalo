/**
 * follow_queue — the admin queue stream's BEHAVIOUR (WC-067).
 *
 * DB-free by construction: buildQueueFollowStream takes its snapshot resolver
 * as an argument, so every case here drives the real stream machinery with a
 * scripted resolver. What that buys is the ability to assert the properties
 * that only show up over time and are otherwise untestable — quiet on an idle
 * queue, the membership marker, the deadline, the error path — deterministically
 * and in milliseconds.
 *
 * The projection (queueJobView) and the framing (encodeQueueSseChunk) are pure,
 * so they are asserted directly.
 *
 * NOT covered here, deliberately: that a dropped socket fires cancel(). Bun's
 * behaviour there is not something this codebase can assert in-process, which
 * is exactly why the stream carries an unconditional heartbeat and a hard
 * deadline instead of trusting it — and both of those ARE covered below.
 */

import { describe, expect, test } from 'bun:test';
// the client progress model is pure and DOM-free, so it tests directly here
import { aggregate_view } from '../../client/dedalo/core/area_maintenance/widgets/diffusion_server_control/js/progress_model.js';
import { buildQueueFollowStream, queueRefusalStream } from '../../src/diffusion/api/actions.ts';
import type { QueueSnapshot } from '../../src/diffusion/api/actions.ts';
import type { ActiveJobRow } from '../../src/diffusion/jobs/queue.ts';
import { encodeQueueSseChunk, queueJobView } from '../../src/diffusion/jobs/sse.ts';
import type { QueueFrame } from '../../src/diffusion/jobs/sse.ts';

const SCHEDULER: QueueSnapshot['scheduler'] = {
	running: 1,
	queued: 0,
	max_runners: 2,
	paused: false,
	draining: false,
	stale_after_seconds: 20,
};

function activeRow(over: Partial<ActiveJobRow> = {}): ActiveJobRow {
	return {
		job_id: 'job-1',
		client_process_id: 'process_diffusion_-1_mdcat353_rsc170',
		state: 'running',
		counter_text: '1284300',
		total_text: '4000000',
		msg: 'Processing records...',
		cancel_requested: false,
		attempt: 1,
		max_attempts: 3,
		n_running: 1,
		n_queued: 0,
		...over,
	};
}

/** Read frames for a fixed window, then cancel — the stream never ends by itself. */
async function readFramesFor(
	stream: ReadableStream<Uint8Array>,
	windowMs: number,
): Promise<{ frames: QueueFrame[]; comments: number }> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const frames: QueueFrame[] = [];
	let comments = 0;
	let buffer = '';
	const deadline = Date.now() + windowMs;
	try {
		for (;;) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) break;
			const next = await Promise.race([
				reader.read(),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
			]);
			if (next === null) break;
			if (next.done) break;
			buffer += decoder.decode(next.value, { stream: true });
			let boundary = buffer.indexOf('\n\n');
			while (boundary !== -1) {
				const frame = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				if (frame.startsWith('data:\n')) {
					frames.push(JSON.parse(frame.slice('data:\n'.length).trimEnd()) as QueueFrame);
				}
				boundary = buffer.indexOf('\n\n');
			}
			comments += (buffer.match(/^:\n/gm) ?? []).length;
			buffer = buffer.replace(/^:\n/gm, '');
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return { frames, comments };
}

describe('queueJobView projection', () => {
	test('projects an active row onto the narrow wire shape', () => {
		expect(queueJobView(activeRow())).toEqual({
			job_id: 'job-1',
			process_id: 'process_diffusion_-1_mdcat353_rsc170',
			state: 'running',
			counter: 1284300,
			total: 4000000,
			msg: 'Processing records...',
			cancel_requested: false,
			attempt: 1,
			max_attempts: 3,
		});
	});

	test('a malformed totals value degrades ONE job to 0, it does not throw', () => {
		// This is the whole reason counter/total travel as text out of SQL: a
		// ::int cast would make one bad legacy row abort the stream for every
		// admin watching.
		const view = queueJobView(activeRow({ counter_text: 'not-a-number', total_text: null }));
		expect(view.counter).toBe(0);
		expect(view.total).toBe(0);
	});

	test('carries the CLIENT process label, never the job uuid', () => {
		const view = queueJobView(activeRow());
		expect(view.process_id).toBe('process_diffusion_-1_mdcat353_rsc170');
		expect(view.process_id).not.toBe(view.job_id);
	});
});

describe('queue frame framing', () => {
	test('uses the same padded framing the client reassembler expects', () => {
		const bytes = encodeQueueSseChunk({
			kind: 'diffusion_queue',
			at: 1,
			scheduler: SCHEDULER,
			jobs: [],
			membership: '',
			refresh: false,
			errors: [],
		});
		const text = new TextDecoder().decode(bytes);
		expect(text.startsWith('data:\n')).toBe(true);
		expect(text.endsWith('\n\n')).toBe(true);
		// pinned pad boundary — proxies flush short chunks only past it
		expect(text.length).toBe(16384 + 2);
	});
});

describe('buildQueueFollowStream', () => {
	test('emits an opening frame immediately', async () => {
		const stream = buildQueueFollowStream(
			async () => ({ scheduler: SCHEDULER, jobs: [queueJobView(activeRow())] }),
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 200);
		expect(frames.length).toBeGreaterThanOrEqual(1);
		expect(frames[0]?.kind).toBe('diffusion_queue');
		expect(frames[0]?.jobs).toHaveLength(1);
		expect(frames[0]?.scheduler.max_runners).toBe(2);
	});

	test('an UNCHANGING queue produces exactly one frame, not one per poll', async () => {
		// The whole point of the change signature. Without the `at` strip this
		// would emit ~10 identical frames in the window below.
		let polls = 0;
		const stream = buildQueueFollowStream(
			async () => {
				polls++;
				return { scheduler: SCHEDULER, jobs: [queueJobView(activeRow())] };
			},
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 300);
		expect(polls).toBeGreaterThan(3); // it really did keep polling
		expect(frames).toHaveLength(1); // ...and stayed quiet
	});

	test('emits a new frame when a counter moves', async () => {
		let counter = 100;
		const stream = buildQueueFollowStream(
			async () => {
				counter += 500;
				return {
					scheduler: SCHEDULER,
					jobs: [queueJobView(activeRow({ counter_text: String(counter) }))],
				};
			},
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 200);
		expect(frames.length).toBeGreaterThan(1);
		expect(frames[1]?.jobs[0]?.counter).toBeGreaterThan(frames[0]?.jobs[0]?.counter ?? 0);
	});

	test('membership change sets refresh — and the FIRST frame never does', async () => {
		// refresh:true costs the client a full history refetch, so an opening
		// frame must not claim one: there is no previous membership to differ from.
		let jobs = [queueJobView(activeRow())];
		const stream = buildQueueFollowStream(async () => ({ scheduler: SCHEDULER, jobs }), {
			pollMs: 20,
			maxMs: 60000,
		});
		setTimeout(() => {
			jobs = [queueJobView(activeRow({ job_id: 'job-2' }))];
		}, 60);
		const { frames } = await readFramesFor(stream, 300);
		expect(frames[0]?.refresh).toBe(false);
		expect(frames.some((f) => f.refresh === true)).toBe(true);
		const changed = frames.find((f) => f.refresh === true);
		expect(changed?.membership).toBe('job-2');
	});

	test('a counter move alone does NOT set refresh', async () => {
		let counter = 100;
		const stream = buildQueueFollowStream(
			async () => {
				counter += 500;
				return {
					scheduler: SCHEDULER,
					jobs: [queueJobView(activeRow({ counter_text: String(counter) }))],
				};
			},
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 200);
		expect(frames.every((f) => f.refresh === false)).toBe(true);
	});

	test('an empty queue is a valid quiet frame, not an error', async () => {
		const stream = buildQueueFollowStream(
			async () => ({
				scheduler: { ...SCHEDULER, running: 0, queued: 0 },
				jobs: [],
			}),
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 150);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.jobs).toEqual([]);
		expect(frames[0]?.errors).toEqual([]);
	});

	test('keeps writing comment heartbeats on a queue that never changes', async () => {
		// THE load-bearing one. The only in-process signal that the peer is gone
		// is the enqueue throw inside push(). On an idle queue the change
		// signature suppresses every frame, so without an unconditional
		// heartbeat nothing is ever written, the throw never happens, and this
		// poll loop outlives the browser tab that opened it.
		const stream = buildQueueFollowStream(async () => ({ scheduler: SCHEDULER, jobs: [] }), {
			pollMs: 10000, // never polls again inside the window
			maxMs: 60000,
			heartbeatMs: 30,
		});
		const { frames, comments } = await readFramesFor(stream, 250);
		expect(frames).toHaveLength(1); // still quiet...
		expect(comments).toBeGreaterThan(2); // ...but still writing
	});

	test('the deadline closes the stream with reconnect:true', async () => {
		const stream = buildQueueFollowStream(async () => ({ scheduler: SCHEDULER, jobs: [] }), {
			pollMs: 20,
			maxMs: 80,
		});
		const { frames } = await readFramesFor(stream, 500);
		const last = frames.at(-1);
		expect(last?.reconnect).toBe(true);
		// routine rotation, NOT a failure — the client must not show an error
		expect(last?.errors).toEqual([]);
	});

	test('a resolver failure emits a terminal error frame and closes', async () => {
		// Never a silent dead poll loop, and never a floating rejection: Bun
		// kills the process on the first one.
		const stream = buildQueueFollowStream(
			async () => {
				throw new Error('db is gone');
			},
			{ pollMs: 20, maxMs: 60000 },
		);
		const { frames } = await readFramesFor(stream, 300);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.errors).toEqual(['queue status read failed']);
		// the message is NOT leaked to the client
		expect(JSON.stringify(frames[0])).not.toContain('db is gone');
	});
});

describe('rollup aggregate — the honesty rules', () => {
	// The band's percentage is the most easily abused number in the widget: it
	// is the one an admin would act on, and it is built entirely from estimates
	// the server never re-counts. These pin the three decisions that keep it
	// honest. The model is pure and DOM-free, so it tests directly.

	test('is RECORD-weighted, not a mean of percentages', () => {
		// a tiny finished job must not drag the headline up
		const view = aggregate_view([
			{ state: 'running', counter: 200, total: 200 }, // 100%
			{ state: 'running', counter: 40000, total: 4000000 }, // 1%
		]);
		// mean-of-percentages would say ~50%; record-weighted says ~1%
		expect(view.percent).toBe(1);
		expect(view.caption).toContain('(estimated)');
	});

	test('excludes jobs WITHOUT an estimate from both sides, and discloses them', () => {
		// counting their records in the numerator while contributing nothing to
		// the denominator could push the aggregate past 100% with most of the
		// work outstanding
		const view = aggregate_view([
			{ state: 'running', counter: 50, total: 100 },
			{ state: 'running', counter: 999999, total: 0 },
		]);
		expect(view.percent).toBe(50);
		expect(view.caption).toContain('50 / 100');
		expect(view.caption).not.toContain('999999');
		expect(view.note).toContain('1 without an estimate');
	});

	test('reports throughput instead of a percentage when NOTHING has an estimate', () => {
		const view = aggregate_view([
			{ state: 'running', counter: 1200, total: 0 },
			{ state: 'running', counter: 800, total: 0 },
		]);
		expect(view.show).toBe(false); // no bar: there is nothing to measure against
		expect(view.caption).toContain('2,000 records processed');
		expect(view.caption).not.toContain('%');
	});

	test('an overrun is reported, never a >100% bar', () => {
		const view = aggregate_view([{ state: 'running', counter: 4102003, total: 4000000 }]);
		expect(view.percent).toBe(100);
		expect(view.severity).toBe('state_warning');
		expect(view.caption).toContain('estimate exceeded');
	});

	test('only RUNNING jobs count, and no running jobs means no band content', () => {
		expect(aggregate_view([{ state: 'queued', counter: 0, total: 500 }]).show).toBe(false);
		expect(aggregate_view([{ state: 'completed', counter: 500, total: 500 }]).caption).toBe('');
		expect(aggregate_view([]).show).toBe(false);
	});
});

describe('queueRefusalStream', () => {
	test('refuses IN THE STREAM WIRE, carrying no queue data', async () => {
		// A JSON envelope here would hang the client forever: request_stream
		// discards the Response, so read_stream would find no framing, never
		// fire on_read, and never complete.
		const result = queueRefusalStream('insufficient permissions');
		expect(result.stream).toBeDefined();
		expect(result.streamHeaders?.['Content-Type']).toBe('text/event-stream');

		const { frames } = await readFramesFor(result.stream as ReadableStream<Uint8Array>, 500);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.errors).toEqual(['insufficient permissions']);
		expect(frames[0]?.jobs).toEqual([]);
		expect(frames[0]?.membership).toBe('');
	});
});
