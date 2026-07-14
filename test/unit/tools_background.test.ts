/**
 * Background executor: the second allowlist (BACKGROUND_RUNNABLE). An action not
 * listed is refused a background fork; a listed one returns immediately with a
 * job id, a pid + pfile (the copied client's progress wire), and the handler runs
 * to completion inside the process-job registry.
 *
 * HERMETIC: the executor now persists a pfile per job, so DEDALO_MEDIA_PROCESSES_DIR
 * points at a temp dir — the live ../private/processes tree is never written.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { LoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionSpec, ToolServerModule } from '../../src/core/tools/module.ts';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_bgjobs_'));
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = scratchDir;

// Import AFTER the env override so every processesDir() call lands in scratch.
const { getBackgroundJob, scheduleBackground } = await import('../../src/core/tools/background.ts');

afterAll(() => {
	if (previousProcessesDir === undefined) {
		Reflect.deleteProperty(process.env, 'DEDALO_MEDIA_PROCESSES_DIR');
	} else {
		process.env.DEDALO_MEDIA_PROCESSES_DIR = previousProcessesDir;
	}
	rmSync(scratchDir, { recursive: true, force: true });
});

const PRINCIPAL: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

function makeLoaded(backgroundRunnable: readonly string[] | undefined): {
	loaded: LoadedTool;
	spec: ToolActionSpec;
	ran: { value: boolean };
} {
	const ran = { value: false };
	const spec: ToolActionSpec = {
		permission: null,
		handler: async () => {
			ran.value = true;
			return { result: true, msg: 'done' };
		},
	};
	const module: ToolServerModule = {
		name: 'tool_demo',
		apiActions: { long_job: spec },
		...(backgroundRunnable !== undefined ? { backgroundRunnable } : {}),
	};
	return { loaded: { module, dir: '/x', rootIndex: 0 }, spec, ran };
}

describe('background executor', () => {
	test('refuses an action not in backgroundRunnable', () => {
		const { loaded, spec, ran } = makeLoaded([]); // empty allowlist
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('background_not_allowed');
		expect(ran.value).toBe(false); // never scheduled
	});

	test('refuses when backgroundRunnable is absent entirely', () => {
		const { loaded, spec } = makeLoaded(undefined);
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		expect(response.result).toBe(false);
	});

	test('schedules an allowed action and runs it to completion', async () => {
		const { loaded, spec, ran } = makeLoaded(['long_job']);
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		expect(response.result).toBe(true);
		const jobId = response.background_job_id as string;
		expect(typeof jobId).toBe('string');
		// The handler runs on the next microtasks; let it settle.
		await new Promise((r) => setTimeout(r, 20));
		expect(ran.value).toBe(true);
		expect(getBackgroundJob(jobId)?.status).toBe('done');
	});

	test('answers the progress wire the copied client speaks (pid + pfile → SSE frames)', async () => {
		const { loaded, spec } = makeLoaded(['long_job']);
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		// update_process_status feeds these straight into dd_utils_api::get_process_status;
		// it console.errors out (and polls nothing) unless BOTH are present and typed.
		expect(typeof response.pid).toBe('number');
		expect(typeof response.pfile).toBe('string');
		// A BASENAME: the status endpoint refuses any pfile carrying a separator.
		expect(response.pfile).toBe(`${response.background_job_id}.json`);
		expect(String(response.pfile)).not.toContain('/');

		await new Promise((r) => setTimeout(r, 20));
		// The job's final payload IS the tool's response — this is where the client
		// reads its report from (render_final_report reads frame.data.result).
		const { mediaJobs } = await import('../../src/core/media/jobs.ts');
		const frame = mediaJobs.frame(response.background_job_id as string);
		expect(frame?.is_running).toBe(false);
		expect((frame?.data as { result?: unknown })?.result).toBe(true);
		expect((frame?.data as { msg?: string })?.msg).toBe('done');
	});
});
