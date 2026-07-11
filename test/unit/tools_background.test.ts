/**
 * Background executor: the second allowlist (BACKGROUND_RUNNABLE). An action not
 * listed is refused a background fork; a listed one returns immediately with a
 * job id and the handler runs to completion on the event loop.
 */

import { describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getBackgroundJob, scheduleBackground } from '../../src/core/tools/background.ts';
import type { LoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionSpec, ToolServerModule } from '../../src/core/tools/module.ts';

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
});
