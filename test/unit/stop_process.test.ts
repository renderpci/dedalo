/**
 * dd_utils_api::stop_process — the generic Stop button's wire (WC-043).
 *
 * The copied client has ALWAYS posted this action; until WC-043 no handler was
 * registered and every Stop click surfaced "Not retry-able HTTP error 400".
 * The handler derives the job id from the pfile basename, gates on ownership
 * (same rule as the status stream — no existence oracle for foreign job ids),
 * and aborts the job's controller so the tool handler winds down cooperatively.
 */

import { describe, expect, test } from 'bun:test';
import { stopUtilsProcess } from '../../src/core/api/process_status.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { mediaJobs } from '../../src/core/media/jobs.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';

const rqoWith = (options: Record<string, unknown>): Rqo =>
	({ dd_api: 'dd_utils_api', action: 'stop_process', options }) as unknown as Rqo;

describe('dd_utils_api stop_process', () => {
	test('registered in the utils action registry', async () => {
		const { utilsApiActions } = await import('../../src/core/api/handlers/dd_utils_api.ts');
		expect(typeof utilsApiActions.stop_process).toBe('function');
	});

	test('invalid or traversal pfile fails closed', async () => {
		const principal = await resolvePrincipal(-1);
		for (const pfile of ['', '../../etc/passwd', 'a/b.json', 'UPPER!bad.json']) {
			const res = stopUtilsProcess(rqoWith({ pid: 1, pfile }), principal);
			expect(res.status).toBe(200);
			expect((res.body as { result: boolean }).result).toBe(false);
		}
	});

	test('unknown job answers "not running" (no existence oracle)', async () => {
		const principal = await resolvePrincipal(-1);
		const res = stopUtilsProcess(rqoWith({ pid: 1, pfile: 'tool_x_run_99999_1.json' }), principal);
		expect((res.body as { result: boolean }).result).toBe(false);
		expect(String((res.body as { msg: string }).msg)).toContain('not running');
	});

	test('stops a LIVE job: the worker signal aborts and the job ends stopped', async () => {
		const principal = await resolvePrincipal(-1);
		let sawAbort = false;
		const record = mediaJobs.submit(
			'test_stop_process',
			async ({ signal }) => {
				// Cooperative loop: run until the stop arrives (or a safety timeout).
				const deadline = Date.now() + 10_000;
				while (!signal.aborted && Date.now() < deadline) {
					await Bun.sleep(20);
				}
				sawAbort = signal.aborted;
				return { done: signal.aborted ? 'aborted' : 'timeout' };
			},
			{ userId: -1 },
		);

		// Give the worker a tick to start, then stop it through the API handler.
		await Bun.sleep(50);
		const res = stopUtilsProcess(
			rqoWith({ pid: process.pid, pfile: `${record.id}.json` }),
			principal,
		);
		expect((res.body as { result: boolean }).result).toBe(true);

		// The job must reach a terminal state with the signal observed.
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			const status = mediaJobs.status(record.id)?.status;
			if (status !== 'running' && status !== 'queued') break;
			await Bun.sleep(20);
		}
		expect(sawAbort).toBe(true);
		expect(mediaJobs.status(record.id)?.status).toBe('stopped');
	});
});
