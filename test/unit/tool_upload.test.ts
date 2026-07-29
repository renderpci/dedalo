/**
 * R2 gate: tool_upload. The ingest itself (add_file / regenerate) is covered by
 * media_upload*.test.ts; this file gates the TOOL surface — the two actions and
 * the OWNERSHIP rule on the job-status wire it mounts.
 *
 * The ownership test pins an audit finding: `get_job_status` reads
 * `mediaJobs.frame(job_id)`, and that registry is SHARED with the background
 * TOOL executor, whose frames carry the handler's full report as `data` (a CSV
 * import's per-record result). Job ids are derived — `kind_pid_counter`, so
 * guessable — and the action carries `permission: null`, so before the fix any
 * caller authorized for tool_upload could read another user's report.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mediaJobs } from '../../src/core/media/jobs.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolResponse } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';

const OWNER_ID = 987661;
const OTHER_ID = 987662;

/** A finished job carrying a report payload, stamped with `userId` (or unowned). */
async function seedJob(userId?: number): Promise<string> {
	const record = mediaJobs.submit(
		'test_report_job',
		async () => ({ secret_report: 'another users import report' }),
		userId === undefined ? {} : { userId },
	);
	// The worker resolves on the next tick; poll until terminal so `data` is set.
	for (let i = 0; i < 50 && mediaJobs.status(record.id)?.status === 'queued'; i++) {
		await Bun.sleep(5);
	}
	for (let i = 0; i < 50 && mediaJobs.status(record.id)?.status === 'running'; i++) {
		await Bun.sleep(5);
	}
	return record.id;
}

const seededIds: string[] = [];
afterAll(() => {
	// The registry is process-wide; drop the pfile mirrors this test minted.
	for (const id of seededIds) mediaJobs.stop(id);
});

async function callJobStatus(
	jobId: string,
	principal: Principal,
	userId: number,
): Promise<ToolResponse> {
	const loaded = await getLoadedTool('tool_upload');
	return mustGet(loaded!.module.apiActions.get_job_status, 'get_job_status').handler({
		principal,
		userId,
		background: false,
		options: { job_id: jobId },
	});
}

describe('tool_upload module', () => {
	test('loads with process_uploaded_file (record/WRITE) + get_job_status', async () => {
		const loaded = await getLoadedTool('tool_upload');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(['get_job_status', 'process_uploaded_file']);
		const upload = mustGet(actions.process_uploaded_file, 'process_uploaded_file');
		expect(upload.permission).toBe('record');
		expect(upload.minLevel).toBe(2);
		// The poll wire has no section/record target in its payload for a
		// declarative gate to read — it authorizes on the job record instead.
		expect(mustGet(actions.get_job_status, 'get_job_status').permission).toBeNull();
		// Nothing here forks: the transcode job is started by the ingest itself.
		expect(loaded!.module.backgroundRunnable).toBeUndefined();
	});

	test('process_uploaded_file fails cleanly (never throws) on an unusable payload', async () => {
		const loaded = await getLoadedTool('tool_upload');
		const res = await mustGet(
			loaded!.module.apiActions.process_uploaded_file,
			'process_uploaded_file',
		).handler({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: {},
		});
		expect(res.result).toBe(false);
		expect(Array.isArray(res.errors)).toBe(true);
		expect((res.errors as string[]).length).toBeGreaterThan(0);
	});
});

describe('get_job_status ownership (guessable ids are not the boundary)', () => {
	test('missing / unknown job ids answer without an existence oracle', async () => {
		const principal = await resolvePrincipal(-1);
		const missing = await callJobStatus('', principal, OWNER_ID);
		expect(missing.result).toBe(false);
		expect(missing.errors).toEqual(['invalid_request']);

		const unknown = await callJobStatus('test_report_job_1_999999', principal, OWNER_ID);
		expect(unknown.result).toBe(false);
		expect(unknown.errors).toEqual(['job_not_found']);
	});

	test('the OWNER reads the frame; another user gets the not-found answer', async () => {
		const jobId = await seedJob(OWNER_ID);
		seededIds.push(jobId);
		const principal = await resolvePrincipal(-1);
		// resolvePrincipal(-1) is root (a global admin), so drive the two non-admin
		// identities explicitly — the rule is per job record, not per session.
		const owner: Principal = { ...principal, userId: OWNER_ID, isGlobalAdmin: false };
		const other: Principal = { ...principal, userId: OTHER_ID, isGlobalAdmin: false };

		const mine = await callJobStatus(jobId, owner, OWNER_ID);
		expect(mine.result).toBe(true);
		expect(mine.data).toEqual({ secret_report: 'another users import report' });

		const theirs = await callJobStatus(jobId, other, OTHER_ID);
		expect(theirs.result).toBe(false);
		expect(theirs.errors).toEqual(['job_not_found']);
		// The refusal must be indistinguishable from a non-existent job — and it
		// must carry NO fragment of the payload.
		expect(theirs.data).toBeUndefined();

		// A global admin may read any job (the documented carve-out).
		const admin = await callJobStatus(jobId, { ...principal, isGlobalAdmin: true }, OTHER_ID);
		expect(admin.result).toBe(true);
	});

	test('an UNOWNED job (the AV transcodes) stays readable — the path this action exists for', async () => {
		const jobId = await seedJob();
		seededIds.push(jobId);
		const principal = await resolvePrincipal(-1);
		const res = await callJobStatus(
			jobId,
			{ ...principal, userId: OTHER_ID, isGlobalAdmin: false },
			OTHER_ID,
		);
		expect(res.result).toBe(true);
		expect(res.is_running).toBe(false);
	});
});
