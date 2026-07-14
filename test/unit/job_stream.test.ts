/**
 * JOB EVENT STREAM gate (src/core/api/job_stream.ts) — the native PUSH status wire.
 *
 * The thing under test is that a consumer is woken BY THE STATE CHANGE, not by a
 * timer: the job runs in this process, so `subscribe` must see every commit, and
 * the SSE handler must end the stream on the terminal frame (the frame that
 * carries the job's return value — for an import, the whole report).
 *
 * Also gated: the ownership refusal. Job ids are derived (kind_pid_counter), so a
 * logged-in user can guess another user's id, and a tool job's frames carry that
 * user's records.
 */

import { describe, expect, test } from 'bun:test';
import { getJobEvents } from '../../src/core/api/job_stream.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { type JobStatusFrame, mediaJobs } from '../../src/core/media/jobs.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const OWNER = 4242;
const OTHER = 9999;

function principal(userId: number, isGlobalAdmin = false): Principal {
	return { userId, isGlobalAdmin } as unknown as Principal;
}

function rqo(jobId: string): Rqo {
	return { options: { job_id: jobId } } as unknown as Rqo;
}

/** Drain an SSE stream into the frames it carried. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
	const frames: Record<string, unknown>[] = [];
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
		buffer += decoder.decode(chunk, { stream: true });
		// Framing is "data:\n{json}<padding>\n\n".
		let boundary = buffer.indexOf('\n\n');
		while (boundary !== -1) {
			const raw = buffer
				.slice(0, boundary)
				.replace(/^data:\n/, '')
				.trim();
			if (raw !== '') frames.push(JSON.parse(raw) as Record<string, unknown>);
			buffer = buffer.slice(boundary + 2);
			boundary = buffer.indexOf('\n\n');
		}
	}
	return frames;
}

describe('mediaJobs.subscribe — every state change wakes the consumer', () => {
	test('a subscriber sees the intermediate publishes AND the terminal frame', async () => {
		const seen: JobStatusFrame[] = [];
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const record = mediaJobs.submit(
			'test_subscribe',
			async ({ onData }) => {
				await gate;
				onData({ step: 1 });
				onData({ step: 2 });
				return { done: true };
			},
			{ userId: OWNER },
		);
		const unsubscribe = mediaJobs.subscribe(record.id, (frame) => seen.push(frame));
		release();

		// Let the worker run to completion.
		await Bun.sleep(30);
		unsubscribe();

		const payloads = seen.map((frame) => frame.data);
		expect(payloads).toContainEqual({ step: 1 });
		expect(payloads).toContainEqual({ step: 2 });
		// The LAST frame is terminal and carries the worker's return value — this is
		// where the import's report reaches the client.
		const last = seen[seen.length - 1] as JobStatusFrame;
		expect(last.is_running).toBe(false);
		expect(last.data).toEqual({ done: true });
	});
});

describe('get_job_events', () => {
	test('an ALREADY-FINISHED job answers one terminal frame with its result', async () => {
		const record = mediaJobs.submit('test_finished', async () => ({ report: 'ok' }), {
			userId: OWNER,
		});
		await Bun.sleep(20);

		const result = getJobEvents(rqo(record.id), principal(OWNER));
		const frames = await drain(result.stream as ReadableStream<Uint8Array>);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.is_running).toBe(false);
		expect(frames[0]?.data).toEqual({ report: 'ok' });
		expect(frames[0]?.job_id).toBe(record.id);
	});

	test('a LIVE job streams its pushes and CLOSES on the terminal frame', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const record = mediaJobs.submit(
			'test_live',
			async ({ onData }) => {
				onData({ msg: 'working' });
				await gate;
				return { report: 'done' };
			},
			{ userId: OWNER },
		);

		const result = getJobEvents(rqo(record.id), principal(OWNER));
		// The stream must not hang: releasing the worker ends it.
		setTimeout(() => release(), 10);
		const frames = await drain(result.stream as ReadableStream<Uint8Array>);

		expect(frames.length).toBeGreaterThan(0);
		const last = frames[frames.length - 1] as Record<string, unknown>;
		expect(last.is_running).toBe(false);
		expect(last.data).toEqual({ report: 'done' });
	});

	test("another user's job is refused — and looks exactly like a job that does not exist", async () => {
		const record = mediaJobs.submit('test_owned', async () => ({ secret: 'records' }), {
			userId: OWNER,
		});
		await Bun.sleep(20);

		const denied = await drain(
			getJobEvents(rqo(record.id), principal(OTHER)).stream as ReadableStream<Uint8Array>,
		);
		const absent = await drain(
			getJobEvents(rqo('test_owned_0_999'), principal(OTHER)).stream as ReadableStream<Uint8Array>,
		);

		expect(denied[0]?.data).toEqual({ msg: `Error: job '${record.id}' not found` });
		expect(denied[0]?.is_running).toBe(false);
		// No existence oracle: the two answers differ only in the id they echo.
		expect(absent[0]?.errors).toEqual(denied[0]?.errors);
		// The payload never leaked.
		expect(JSON.stringify(denied)).not.toContain('secret');
	});

	test('a global admin may stream any job', async () => {
		const record = mediaJobs.submit('test_admin', async () => ({ report: 'ok' }), {
			userId: OWNER,
		});
		await Bun.sleep(20);
		const frames = await drain(
			getJobEvents(rqo(record.id), principal(OTHER, true)).stream as ReadableStream<Uint8Array>,
		);
		expect(frames[0]?.data).toEqual({ report: 'ok' });
	});

	test('a malformed job_id is refused without touching the registry', async () => {
		const frames = await drain(
			getJobEvents(rqo('../../etc/passwd'), principal(OWNER)).stream as ReadableStream<Uint8Array>,
		);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.errors).toEqual(['invalid job_id']);
	});
});
