/**
 * Job-status surface gate (audit DEC-22a / S2-15 + S2-16).
 *
 * Drives BOTH status wires END-TO-END through dispatchToolRequest (all the
 * real gates: tool-name shape, dd1324 active + authorized, action resolution):
 *  - tool_upload.get_job_status serves the media JobStatusFrame for a scratch
 *    job submitted to the process-wide MediaJobManager;
 *  - the RESERVED framework action get_background_job_status serves a scratch
 *    background job's terminal record, scoped to the addressed tool and the
 *    requesting user (global admins exempt).
 *
 * Hermetic: DEDALO_MEDIA_PROCESSES_DIR points at a temp dir (set BEFORE the
 * module graph loads) so pfile mirrors never litter ../private/processes.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_job_status_'));
process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;

// Import AFTER the env override so the mediaJobs singleton persists to scratch.
const { mediaJobs } = await import('../../src/core/media/jobs.ts');
const { dispatchToolRequest } = await import('../../src/core/tools/dispatch.ts');
const { scheduleBackground, resetBackgroundJobs } = await import(
	'../../src/core/tools/background.ts'
);
const { backgroundJobStatusResponse, BACKGROUND_JOB_STATUS_ACTION } = await import(
	'../../src/core/tools/job_status.ts'
);

import type { Principal } from '../../src/core/security/permissions.ts';
import type { LoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolServerModule } from '../../src/core/tools/module.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

beforeAll(() => {
	resetBackgroundJobs();
});
afterAll(() => {
	resetBackgroundJobs();
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING "undefined"
	delete process.env.DEDALO_MEDIA_PROCESSES_DIR;
	rmSync(scratchDir, { recursive: true, force: true });
});

describe('media job status through the tool dispatch (DEC-22a)', () => {
	test('serves the frame of a completed scratch job, end-to-end', async () => {
		const record = mediaJobs.submit('test_probe', async () => ({ built: ['a.mp4'] }));
		// Let the trivial worker finish.
		await new Promise((resolve) => setTimeout(resolve, 20));

		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_upload', action: 'get_job_status' },
			{ job_id: record.id },
		);
		expect(response.result).toBe(true);
		expect(response.is_running).toBe(false);
		expect(response.data).toEqual({ built: ['a.mp4'] });
		expect(response.errors).toEqual([]);
		expect(String(response.pfile)).toStartWith(scratchDir);
		expect(typeof response.total_time).toBe('number');
	});

	test('a running job reports is_running true', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const record = mediaJobs.submit('test_probe', async () => {
			await gate;
			return null;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_upload', action: 'get_job_status' },
			{ job_id: record.id },
		);
		expect(response.result).toBe(true);
		expect(response.is_running).toBe(true);
		release();
		await new Promise((resolve) => setTimeout(resolve, 10));
	});

	test('unknown job id and missing job_id fail loud (no silent ok)', async () => {
		const unknown = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_upload', action: 'get_job_status' },
			{ job_id: 'no_such_job_1' },
		);
		expect(unknown.result).toBe(false);
		expect(unknown.errors).toContain('job_not_found');

		const missing = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_upload', action: 'get_job_status' },
			{},
		);
		expect(missing.result).toBe(false);
		expect(missing.errors).toContain('invalid_request');
	});
});

/** Fabricate a loaded tool whose name matches a REAL active dd1324 tool. */
function makeLoaded(name: string, result: unknown): LoadedTool {
	const module: ToolServerModule = {
		name,
		apiActions: {
			long_job: {
				permission: null,
				handler: async () => ({ result, msg: 'done', errors: [] }),
			},
		},
		backgroundRunnable: ['long_job'],
	};
	return { module, dir: '/x', rootIndex: 0 };
}

describe('background tool-job status through the tool dispatch (S2-16)', () => {
	test('a finished background job is pollable end-to-end on its own tool', async () => {
		const loaded = makeLoaded('tool_time_machine', { imported: 42 });
		const spec = loaded.module.apiActions.long_job;
		if (spec === undefined) throw new Error('spec missing');
		const started = scheduleBackground(loaded, 'long_job', spec, {}, SUPERUSER, -1);
		expect(started.result).toBe(true);
		const jobId = started.background_job_id as string;
		await new Promise((resolve) => setTimeout(resolve, 20));

		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_time_machine', action: BACKGROUND_JOB_STATUS_ACTION },
			{ background_job_id: jobId },
		);
		expect(response.result).toBe(true);
		const job = response.job as Record<string, unknown>;
		expect(job.status).toBe('done');
		expect(job.tool).toBe('tool_time_machine');
		expect((job.response as Record<string, unknown>).result).toEqual({ imported: 42 });
	});

	test('a job is NOT visible through a different tool name (scope, no oracle)', async () => {
		const loaded = makeLoaded('tool_time_machine', true);
		const spec = loaded.module.apiActions.long_job;
		if (spec === undefined) throw new Error('spec missing');
		const started = scheduleBackground(loaded, 'long_job', spec, {}, SUPERUSER, -1);
		const jobId = started.background_job_id as string;
		await new Promise((resolve) => setTimeout(resolve, 20));

		// Same admin caller, DIFFERENT (also active) tool: same job_not_found as a
		// truly absent id — the wire is not an existence oracle across tools.
		const crossTool = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_export', action: BACKGROUND_JOB_STATUS_ACTION },
			{ background_job_id: jobId },
		);
		expect(crossTool.result).toBe(false);
		expect(crossTool.errors).toContain('job_not_found');
	});

	test("ownership scoping: a non-admin cannot read another user's job", async () => {
		const loaded = makeLoaded('tool_time_machine', true);
		const spec = loaded.module.apiActions.long_job;
		if (spec === undefined) throw new Error('spec missing');
		const started = scheduleBackground(loaded, 'long_job', spec, {}, SUPERUSER, 7);
		const jobId = started.background_job_id as string;
		await new Promise((resolve) => setTimeout(resolve, 20));

		const stranger: Principal = { userId: 8, isGlobalAdmin: false, isDeveloper: false };
		const denied = backgroundJobStatusResponse('tool_time_machine', stranger, 8, {
			background_job_id: jobId,
		});
		expect(denied.result).toBe(false);
		expect(denied.errors).toContain('job_not_found');

		// The owner reads it fine; a global admin reads any user's job.
		const owner: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: false };
		expect(
			backgroundJobStatusResponse('tool_time_machine', owner, 7, { background_job_id: jobId })
				.result,
		).toBe(true);
		expect(
			backgroundJobStatusResponse('tool_time_machine', SUPERUSER, -1, {
				background_job_id: jobId,
			}).result,
		).toBe(true);
	});

	test('missing background_job_id is an invalid_request, unknown id a job_not_found', async () => {
		const missing = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_time_machine', action: BACKGROUND_JOB_STATUS_ACTION },
			{},
		);
		expect(missing.result).toBe(false);
		expect(missing.errors).toContain('invalid_request');

		const unknown = await dispatchToolRequest(
			SUPERUSER,
			-1,
			{ model: 'tool_time_machine', action: BACKGROUND_JOB_STATUS_ACTION },
			{ background_job_id: crypto.randomUUID() },
		);
		expect(unknown.result).toBe(false);
		expect(unknown.errors).toContain('job_not_found');
	});
});
