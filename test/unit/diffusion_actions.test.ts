/**
 * dd_diffusion_api actions — end-to-end P0 gate (DIFFUSION_PLAN D4.5).
 *
 * Drives the REAL loop the copied client will drive: diffuse → durable job →
 * spawned runner process (stub batches) → SSE chunks in the pinned wire →
 * terminal chunk with result; then reconnect via list_processes +
 * get_process_status; cancel mid-run; and the crash path (SIGKILL the runner,
 * sweep, job re-queued). Uses the superuser principal (permission shortcut)
 * — the permission DENIAL is asserted separately with a plain principal, and
 * the unauthenticated path is asserted through the real dispatch gate.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	cancelProcessAction,
	diffuseAction,
	getProcessStatusAction,
	listProcessesAction,
} from '../../src/diffusion/api/actions.ts';
import {
	deleteJobsForTests,
	getJobByClientProcessId,
	requestCancel,
	sweepStaleJobs,
} from '../../src/diffusion/jobs/queue.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';
import type { ProgressData } from '../../src/diffusion/jobs/sse.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const createdJobIds: string[] = [];

// Fast stub batches for the spawned runners (inherited via process.env).
process.env.DIFFUSION_RUNNER_STUB_DELAY_MS = '40';

/** Read a diffusion SSE stream to completion, returning the parsed chunks. */
async function readSseChunks(
	stream: ReadableStream<Uint8Array>,
	timeoutMs = 30000,
): Promise<ProgressData[]> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const chunks: ProgressData[] = [];
	let buffer = '';
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (Date.now() > deadline) {
			await reader.cancel();
			throw new Error(`SSE stream did not finish within ${timeoutMs}ms`);
		}
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let boundary = buffer.indexOf('\n\n');
		while (boundary !== -1) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			if (frame.startsWith('data:\n')) {
				chunks.push(JSON.parse(frame.slice('data:\n'.length).trimEnd()) as ProgressData);
			}
			boundary = buffer.indexOf('\n\n');
		}
	}
	return chunks;
}

function diffuseRqo(element: string, section: string, total: number, label: string) {
	return {
		action: 'diffuse',
		dd_api: 'dd_diffusion_api',
		source: { section_tipo: section },
		sqo: { section_tipo: [section] },
		options: {
			type: 'sql',
			diffusion_element_tipo: element,
			total,
			process_id: label,
			// P0 lifecycle harness: fake elements have no compilable plan — the
			// runner's stub mode drives the queue/SSE machinery without writes.
			stub_run: true,
		},
	};
}

/** Rerun hygiene: purge every row from this suite's fake element tipos. */
async function purgeSuiteRows(): Promise<void> {
	// By element AND by label (a corrupted-spec row escapes only the former).
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE spec->>'diffusion_element_tipo' LIKE 'acttest%'
		    OR client_process_id LIKE 'process_diffusion_%_acttest%'`,
	);
}

beforeAll(purgeSuiteRows);
afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
	await purgeSuiteRows();
});

describe('dd_diffusion_api end-to-end (stub runner)', () => {
	test('diffuse streams pinned chunks from spawn to completion', async () => {
		const label = 'process_diffusion_-1_acttest1_actsec1';
		const result = await diffuseAction(
			diffuseRqo('acttest1', 'actsec1', 4, label) as never,
			SUPERUSER,
		);
		expect(result.stream).toBeDefined();
		expect(result.streamHeaders?.['Content-Type']).toBe('text/event-stream');
		expect(result.streamHeaders?.['X-Accel-Buffering']).toBe('no');

		const chunks = await readSseChunks(result.stream as ReadableStream<Uint8Array>);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		// Every chunk speaks the client wire: label as process_id, data core keys.
		for (const chunk of chunks) {
			expect(chunk.process_id).toBe(label);
			expect(typeof chunk.data.msg).toBe('string');
			expect(typeof chunk.data.counter).toBe('number');
			expect(typeof chunk.data.total).toBe('number');
			expect(Array.isArray(chunk.errors)).toBe(true);
		}
		const final = chunks[chunks.length - 1];
		expect(final?.is_running).toBe(false);
		expect(final?.result?.result).toBe(true);
		expect(final?.data.counter).toBe(4);
		expect(final?.data.total).toBe(4);

		const job = await getJobByClientProcessId(label, null);
		expect(job?.state).toBe('completed');
		if (job !== null) createdJobIds.push(job.job_id);
	});

	test('reconnect: list_processes finds the run by label; get_process_status replays it', async () => {
		const label = 'process_diffusion_-1_acttest1_actsec1';
		const list = await listProcessesAction({ action: 'list_processes' } as never, SUPERUSER);
		const processes = list.body.processes as ProgressData[];
		const mine = [...processes]
			.sort((a, b) => b.started_at - a.started_at)
			.find((entry) => entry.process_id === label);
		// The exact client reconnect predicate (render_tool_diffusion.js:806-812).
		expect(mine).toBeDefined();
		expect(mine?.is_running).toBe(false);

		const status = await getProcessStatusAction(
			{ action: 'get_process_status', process_id: label, update_rate: 250 } as never,
			SUPERUSER,
		);
		const chunks = await readSseChunks(status.stream as ReadableStream<Uint8Array>, 10000);
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		expect(chunks[chunks.length - 1]?.is_running).toBe(false);
		expect(chunks[chunks.length - 1]?.process_id).toBe(label);
	});

	test('get_process_status for an unknown id emits the pinned not-found terminal chunk', async () => {
		const status = await getProcessStatusAction(
			{ action: 'get_process_status', process_id: 'process_diffusion_-1_nope_nope' } as never,
			SUPERUSER,
		);
		const chunks = await readSseChunks(status.stream as ReadableStream<Uint8Array>, 10000);
		expect(chunks.length).toBe(1);
		expect(chunks[0]?.data.msg).toBe('Process not found');
		expect(chunks[0]?.errors).toEqual(['Process not found or already completed']);
	});

	test('cancel_process mid-run stops the runner and streams the cancellation', async () => {
		const label = 'process_diffusion_-1_acttest2_actsec1';
		// Long run: 400 batches x 40ms — cancelled long before completion.
		const result = await diffuseAction(
			diffuseRqo('acttest2', 'actsec1', 400, label) as never,
			SUPERUSER,
		);
		const chunksPromise = readSseChunks(result.stream as ReadableStream<Uint8Array>);

		// Wait until the runner is demonstrably progressing, then cancel.
		const started = Date.now();
		for (;;) {
			const job = await getJobByClientProcessId(label, null);
			if (job !== null && (job.totals.counter ?? 0) > 0) {
				createdJobIds.push(job.job_id);
				break;
			}
			if (Date.now() - started > 15000) throw new Error('runner never progressed');
			await Bun.sleep(100);
		}
		const cancel = await cancelProcessAction(
			{ action: 'cancel_process', process_id: label } as never,
			SUPERUSER,
		);
		expect(cancel.body).toEqual({
			result: true,
			msg: `Process ${label} cancelled`,
		});

		const chunks = await chunksPromise;
		const final = chunks[chunks.length - 1];
		expect(final?.is_running).toBe(false);
		expect(final?.errors).toContain('Process cancelled by user');

		// Second cancel: pinned miss shape (no active run anymore).
		const again = await cancelProcessAction(
			{ action: 'cancel_process', process_id: label } as never,
			SUPERUSER,
		);
		expect(again.body).toEqual({
			result: false,
			msg: `Process ${label} not found or not running`,
		});
	});

	test('section comes from the SQO, not source.section_tipo (tool tipo)', async () => {
		// Regression: create_source sets source.section_tipo to the TOOL's own
		// ontology tipo (e.g. dd1324), never the open record's section. The
		// section to publish must be read from the record-selection SQO — else
		// the resolver looks up a SectionPlan that isn't in the element's plan
		// ("section 'dd1324' has no SectionPlan in element ...").
		const label = 'process_diffusion_-1_acttest_src_actsec1';
		const rqo = diffuseRqo('acttest_src', 'actsec1', 1, label) as unknown as {
			source: { section_tipo: string };
		};
		rqo.source.section_tipo = 'dd1324'; // the tool's tipo — must be ignored
		const result = await diffuseAction(rqo as never, SUPERUSER);
		void (result.stream as ReadableStream<Uint8Array>).cancel();

		const job = await getJobByClientProcessId(label, null);
		if (job !== null) createdJobIds.push(job.job_id);
		expect((job?.spec as { section_tipo?: string })?.section_tipo).toBe('actsec1');
	});

	test('permission gate: a plain user without section read is refused', async () => {
		const nobody: Principal = { userId: 999999999, isGlobalAdmin: false, isDeveloper: false };
		const refused = await diffuseAction(
			diffuseRqo('acttest3', 'actsec1', 2, 'process_diffusion_9_acttest3_actsec1') as never,
			nobody,
		);
		expect(refused.stream).toBeUndefined();
		expect(refused.body.result).toBe(false);
		expect(refused.body.errors).toEqual(['insufficient permissions']);
	});

	test('dispatch gate: unauthenticated diffuse is denied 401 before any handler runs', async () => {
		const denied = await dispatchRqo(
			diffuseRqo('acttest4', 'actsec1', 2, 'process_diffusion_0_acttest4_actsec1') as never,
			{ requestId: 'test', clientIp: '127.0.0.1', session: null, csrfCandidate: null },
		);
		expect(denied.status).toBe(401);
		expect(denied.body.result).toBe(false);
	});

	test('crash recovery: SIGKILLed runner is swept back to queued with its checkpoint', async () => {
		const label = 'process_diffusion_-1_acttest5_actsec1';
		const result = await diffuseAction(
			diffuseRqo('acttest5', 'actsec1', 400, label) as never,
			SUPERUSER,
		);
		// Detach from the stream — this test observes the DB, not the wire.
		void (result.stream as ReadableStream<Uint8Array>).cancel();

		// Wait for a live runner pid + some progress.
		let jobId = '';
		let pid = 0;
		const started = Date.now();
		for (;;) {
			const job = await getJobByClientProcessId(label, null);
			if (job !== null && job.runner.pid !== undefined && (job.totals.counter ?? 0) > 0) {
				jobId = job.job_id;
				pid = job.runner.pid;
				break;
			}
			if (Date.now() - started > 15000) throw new Error('runner never registered a pid');
			await Bun.sleep(100);
		}
		createdJobIds.push(jobId);
		const checkpointBefore = (await getJobByClientProcessId(label, null))?.checkpoint;

		process.kill(pid, 'SIGKILL');
		await Bun.sleep(200);

		// Sweep with a zero-tolerance staleness window: the dead runner's last
		// heartbeat is now "stale", the job re-queues (attempt 1 < 3).
		const sweep = await sweepStaleJobs(0);
		expect(sweep.requeued).toContain(jobId);
		const requeued = await getJobByClientProcessId(label, null);
		expect(requeued?.state).toBe('queued');
		// The committed checkpoint survives the crash — that is what P4's
		// byte-equivalent resume builds on.
		expect(requeued?.checkpoint).toEqual(checkpointBefore ?? {});

		// Settle: cancel the queued job so no later scheduler tick respawns it.
		const settled = await requestCancel(label, null);
		expect(settled.cancelled).toBe(true);
	});
});
