/**
 * dd_utils_api:get_process_status gate (audit S2-15/DEC-22a + S2-35; WS-E
 * item 8) — the background-process SSE wire the copied client's
 * update_process_status speaks (common.js → data_manager.request_stream).
 *
 * THE GUARANTEES under test (hermetic: DEDALO_MEDIA_PROCESSES_DIR points at a
 * temp dir — the live ../private/processes tree is never touched):
 * - missing pid/pfile → ONE terminal SSE frame (PHP msg parity), stream closes;
 * - a path-traversal pfile is refused with a terminal frame (the stream can
 *   only ever read job records inside the processes dir);
 * - an unknown pfile → terminal not-found frame, is_running:false;
 * - a LIVE job streams running frames and ends with a terminal frame when the
 *   worker finishes — the make_backup/AV poll loop's happy path;
 * - frames use the old-engine SSE framing ("data:\n{json}" … "\n\n") that
 *   data_manager.read_stream parses.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_pstatus_'));
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;

// Import AFTER the env override so every processesDir() call lands in scratch.
const { getUtilsProcessStatus } = await import('../../src/core/api/process_status.ts');
const { mediaJobs } = await import('../../src/core/media/jobs.ts');
import type { Rqo } from '../../src/core/concepts/rqo.ts';

afterAll(() => {
	if (previousProcessesDir === undefined) {
		Reflect.deleteProperty(process.env, 'DEDALO_MEDIA_PROCESSES_DIR');
	} else {
		process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	}
	rmSync(scratchDir, { recursive: true, force: true });
});

function rqoFor(options: Record<string, unknown>, updateRate = 250): Rqo {
	return {
		dd_api: 'dd_utils_api',
		action: 'get_process_status',
		update_rate: updateRate,
		options,
	} as unknown as Rqo;
}

/** Drain the SSE stream fully and parse every "data:\n{json}" frame. */
async function drainFrames(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
	const text = await new Response(stream).text();
	return text
		.split('data:\n')
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.map((part) => JSON.parse(part) as Record<string, unknown>);
}

describe('dd_utils_api:get_process_status (S2-15/DEC-22a)', () => {
	test('missing pid/pfile → one terminal frame, PHP message parity', async () => {
		const outcome = getUtilsProcessStatus(rqoFor({}));
		expect(outcome.status).toBe(200);
		expect(outcome.streamHeaders?.['Content-Type']).toBe('text/event-stream');
		const frames = await drainFrames(outcome.stream as ReadableStream<Uint8Array>);
		expect(frames.length).toBe(1);
		expect(frames[0]?.is_running).toBe(false);
		expect(frames[0]?.errors).toContain('Error: pfile and pid are mandatory');
	});

	test('path-traversal pfile is refused (no read outside the processes dir)', async () => {
		for (const evil of ['../../../etc/passwd', 'a/b.json', 'a\\b.json', '..', '.hidden..json']) {
			const outcome = getUtilsProcessStatus(rqoFor({ pid: 1, pfile: evil }));
			const frames = await drainFrames(outcome.stream as ReadableStream<Uint8Array>);
			expect(frames.length).toBe(1);
			expect(frames[0]?.is_running).toBe(false);
			expect(frames[0]?.errors).toContain('invalid pfile');
		}
	});

	test('unknown pfile → terminal not-found frame', async () => {
		const outcome = getUtilsProcessStatus(rqoFor({ pid: 1, pfile: 'backup_no_such.json' }));
		const frames = await drainFrames(outcome.stream as ReadableStream<Uint8Array>);
		expect(frames.length).toBe(1);
		expect(frames[0]?.is_running).toBe(false);
		expect(frames[0]?.errors).toContain('process file not found');
	});

	test('live job streams running frames then a terminal frame', async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const record = mediaJobs.submit('gate_test', async () => {
			await gate;
			return { built: true };
		});
		const outcome = getUtilsProcessStatus(rqoFor({ pid: process.pid, pfile: `${record.id}.json` }));
		const framesPromise = drainFrames(outcome.stream as ReadableStream<Uint8Array>);
		// Let at least one running frame go out, then finish the job.
		await Bun.sleep(300);
		release?.();
		const frames = await framesPromise;
		expect(frames.length).toBeGreaterThanOrEqual(2);
		expect(frames[0]?.is_running).toBe(true);
		const last = frames[frames.length - 1];
		expect(last?.is_running).toBe(false);
		expect((last?.data as { built?: boolean })?.built).toBe(true);
		expect(last?.errors).toEqual([]);
	}, 15000);
});
