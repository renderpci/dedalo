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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve_final_frame } from '../../client/dedalo/core/area_maintenance/widgets/update_code/js/update_code_phases.js';
import { ok } from '../../src/core/errors/convert.ts';
import { DedaloError, errorBodySchema, isDedaloError } from '../../src/core/errors/index.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { LoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionSpec, ToolServerModule } from '../../src/core/tools/module.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const scratchDir = mkdtempSync(join(tmpdir(), 'dedalo_bgjobs_'));
const previousProcessesDir = process.env.DEDALO_MEDIA_PROCESSES_DIR;
process.env.DEDALO_MEDIA_PROCESSES_DIR = markProcessesDir(scratchDir);

// Import AFTER the env override so every processesDir() call lands in scratch.
const { getBackgroundJob, getBackgroundJobStats, listBackgroundJobs, scheduleBackground } =
	await import('../../src/core/tools/background.ts');
const { mediaJobs } = await import('../../src/core/media/jobs.ts');
const { runWithRequestLangs } = await import('../../src/core/resolve/request_lang.ts');

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
		gatedInHandler: 'test fixture — the background executor is under test, not any gate',
		handler: async () => {
			ran.value = true;
			return ok(true, { requestId: 'tools-background-test' });
		},
	};
	const module: ToolServerModule = {
		name: 'tool_demo',
		apiActions: { long_job: spec },
		...(backgroundRunnable !== undefined ? { backgroundRunnable } : {}),
		// Every backgroundRunnable action declares its lane (PERF-11); the
		// undeclared case has its own test below.
		backgroundLanes: { long_job: 'maintenance' as const },
	};
	return { loaded: { module, dir: '/x', rootIndex: 0 }, spec, ran };
}

/** The DedaloError a call threw, or null when it returned. */
function refusalOf(run: () => unknown): { code: string } | null {
	try {
		run();
		return null;
	} catch (error) {
		return isDedaloError(error) ? { code: error.code } : null;
	}
}

describe('background executor', () => {
	test('refuses an action not in backgroundRunnable', () => {
		const { loaded, spec, ran } = makeLoaded([]); // empty allowlist
		// P1 sweep: the second allowlist REFUSES BY THROWING the registered code.
		const refusal = refusalOf(() =>
			scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1),
		);
		expect(refusal?.code).toBe('tool.background_not_allowed');
		expect(ran.value).toBe(false); // never scheduled
	});

	test('refuses an allowed action that declares NO job lane (PERF-11)', () => {
		const { loaded, spec, ran } = makeLoaded(['long_job']);
		// The lane declaration is removed: the action IS backgroundable, but the
		// module never said which budget it spends. Filing it into a fallback lane
		// is how one class of work starts starving another, so it is a refusal —
		// and with its OWN code, because `background_not_allowed` would name the
		// wrong cause.
		const unlaned = { ...loaded, module: { ...loaded.module, backgroundLanes: {} } };
		const refusal = refusalOf(() =>
			scheduleBackground(unlaned, 'long_job', spec, {}, PRINCIPAL, -1),
		);
		expect(refusal?.code).toBe('tool.background_lane_undeclared');
		expect(ran.value).toBe(false); // never scheduled
	});

	test('refuses when backgroundRunnable is absent entirely', () => {
		const { loaded, spec } = makeLoaded(undefined);
		const refusal = refusalOf(() =>
			scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1),
		);
		expect(refusal?.code).toBe('tool.background_not_allowed');
	});

	test('admission runs in the registering step: a sync refusal queues nothing; a promise-returning hook is refused', async () => {
		const { getBackgroundJobStats } = await import('../../src/core/tools/background.ts');
		const { loaded, spec, ran } = makeLoaded(['long_job']);
		const before = getBackgroundJobStats().total;
		// A synchronous refusal: thrown out of scheduleBackground, nothing registered.
		const refusing = {
			...spec,
			admit: () => {
				throw new DedaloError('export.too_many_jobs', { details: { limit: 0 } });
			},
		} as ToolActionSpec;
		expect(
			refusalOf(() => scheduleBackground(loaded, 'long_job', refusing, {}, PRINCIPAL, -1))?.code,
		).toBe('export.too_many_jobs');
		// An async hook would refuse AFTER the job is queued: a contract violation.
		const asyncHook = {
			...spec,
			admit: async () => undefined,
		} as unknown as ToolActionSpec;
		expect(
			refusalOf(() => scheduleBackground(loaded, 'long_job', asyncHook, {}, PRINCIPAL, -1))?.code,
		).toBe('internal.invariant');
		expect(getBackgroundJobStats().total).toBe(before);
		expect(ran.value).toBe(false);
	});

	test('schedules an allowed action and runs it to completion', async () => {
		const { loaded, spec, ran } = makeLoaded(['long_job']);
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		expect(response.ok).toBe(true);
		expect(response.data).toBe(true);
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
		// reads its report from (render_final_report: `response_data(batch_report)`,
		// i.e. frame.data.data).
		const { mediaJobs } = await import('../../src/core/media/jobs.ts');
		const frame = mediaJobs.frame(response.background_job_id as string);
		expect(frame?.is_running).toBe(false);
		// the terminal frame's data IS the handler's envelope (ok:true + data)
		expect((frame?.data as { ok?: unknown })?.ok).toBe(true);
		expect((frame?.data as { data?: unknown })?.data).toBe(true);
	});

	test('a job STOPPED WHILE QUEUED ends at once: its handler never runs, its record is terminal and journaled, it no longer counts as live', async () => {
		// A lane of its own for this leg: the scratch module files its jobs into
		// 'export' and FILLS it (every slot held by a blocker of another user),
		// so the victim below is genuinely QUEUED, not running.
		const lane = 'export' as const;
		const OWNER = 4242;
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const victimRan = { value: false };
		const blockerSpec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				await held;
				return ok(true, { requestId: 'tools-background-test' });
			},
		};
		const victimSpec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				victimRan.value = true;
				return ok(true, { requestId: 'tools-background-test' });
			},
		};
		const module: ToolServerModule = {
			name: 'tool_demo_queue',
			apiActions: { hold: blockerSpec, victim: victimSpec },
			backgroundRunnable: ['hold', 'victim'],
			backgroundLanes: { hold: lane, victim: lane },
		};
		const loaded: LoadedTool = { module, dir: '/x', rootIndex: 0 };
		const blockers: string[] = [];
		const lines: string[] = [];
		const originalLog = console.log;
		const originalError = console.error;
		const capture =
			(sink: (...args: unknown[]) => void) =>
			(...args: unknown[]): void => {
				lines.push(args.map(String).join(' '));
				sink(...args);
			};
		console.log = capture(originalLog);
		console.error = capture(originalError);
		try {
			const free = mediaJobs.laneDepths()[lane].max - mediaJobs.laneDepths()[lane].active;
			for (let i = 0; i < free; i++) {
				const response = scheduleBackground(loaded, 'hold', blockerSpec, {}, PRINCIPAL, -7);
				blockers.push(response.background_job_id as string);
			}
			await new Promise((r) => setTimeout(r, 10));
			expect(mediaJobs.laneDepths()[lane].active).toBe(mediaJobs.laneDepths()[lane].max);

			const response = scheduleBackground(loaded, 'victim', victimSpec, {}, PRINCIPAL, OWNER);
			const victimId = response.background_job_id as string;
			await new Promise((r) => setTimeout(r, 10));
			// non-vacuous: it IS queued behind the blockers, and live for its owner
			expect(mediaJobs.status(victimId)?.status).toBe('queued');
			expect(listBackgroundJobs('tool_demo_queue', OWNER).map((job) => job.status)).toEqual([
				'running',
			]);

			expect(mediaJobs.stop(victimId)).toBe(true);
			await new Promise((r) => setTimeout(r, 10));

			// ENDED NOW — while the lane is still full (the blockers hold it).
			expect(mediaJobs.laneDepths()[lane].active).toBe(mediaJobs.laneDepths()[lane].max);
			const frame = mediaJobs.frame(victimId);
			expect(frame?.is_running).toBe(false);
			expect(mediaJobs.status(victimId)?.status).toBe('stopped');
			expect(mediaJobs.laneDepths()[lane].queued).toBe(0);
			// THE TERMINAL FRAME of a job stopped while queued (get_job_events /
			// get_process_status): nothing went wrong, so nothing is said — no
			// errors[] line, no `error`. A line here reads as a FAILURE to every
			// frame consumer (update_code_phases resolve_final_frame: any
			// non-'interrupted: ' line → 'failed'); the stop is the user's choice.
			expect(frame?.errors).toEqual([]);
			expect(frame != null && 'error' in frame).toBe(false);
			expect(resolve_final_frame({}, frame)).toBeNull();
			// The executor's own record is terminal: no longer listed as live, so no
			// admission hook counting this registry holds a slot for it.
			expect(getBackgroundJob(victimId)?.status).toBe('stopped');
			expect(
				listBackgroundJobs('tool_demo_queue', OWNER).filter((job) => job.status === 'running'),
			).toEqual([]);
			// ...and the terminal transition is JOURNALED (audit S2-16).
			expect(
				lines.some((line) => line.includes(`job ${victimId}`) && line.includes('stopped')),
			).toBe(true);
		} finally {
			console.log = originalLog;
			console.error = originalError;
			release();
			await new Promise((r) => setTimeout(r, 20));
		}
		// The lane freed: the stopped job still never ran, and stays terminal.
		expect(victimRan.value).toBe(false);
		for (const id of blockers) expect(getBackgroundJob(id)?.status).toBe('done');
		expect(mediaJobs.laneDepths()[lane].active).toBe(0);
	});

	test('a QUEUED job receives the interface lang captured at SUBMIT (ToolActionContext.applicationLang)', async () => {
		const lane = 'export' as const;
		const SUBMIT_LANG = 'lg-zzsubmit';
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const blockerSpec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				await held;
				return ok(true, { requestId: 'tools-background-test' });
			},
		};
		const seen: { lang?: string; ran: boolean } = { ran: false };
		const victimSpec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async (context) => {
				seen.ran = true;
				seen.lang = context.applicationLang;
				return ok(true, { requestId: 'tools-background-test' });
			},
		};
		const module: ToolServerModule = {
			name: 'tool_demo_lang',
			apiActions: { hold: blockerSpec, victim: victimSpec },
			backgroundRunnable: ['hold', 'victim'],
			backgroundLanes: { hold: lane, victim: lane },
		};
		const loaded: LoadedTool = { module, dir: '/x', rootIndex: 0 };
		const blockers: string[] = [];
		try {
			const free = mediaJobs.laneDepths()[lane].max - mediaJobs.laneDepths()[lane].active;
			for (let i = 0; i < free; i++) {
				const response = scheduleBackground(loaded, 'hold', blockerSpec, {}, PRINCIPAL, -7);
				blockers.push(response.background_job_id as string);
			}
			const response = runWithRequestLangs(
				{ applicationLang: SUBMIT_LANG, dataLang: 'lg-spa' },
				() => scheduleBackground(loaded, 'victim', victimSpec, {}, PRINCIPAL, 4243),
			);
			const victimId = response.background_job_id as string;
			await new Promise((r) => setTimeout(r, 10));
			// non-vacuous: it IS queued — its handler will start from a blocker's release
			expect(mediaJobs.status(victimId)?.status).toBe('queued');
		} finally {
			release();
		}
		for (let i = 0; i < 100 && !seen.ran; i++) await new Promise((r) => setTimeout(r, 10));
		expect(seen.ran).toBe(true);
		expect(seen.lang).toBe(SUBMIT_LANG);
		for (const id of blockers) expect(getBackgroundJob(id)?.status).toBe('done');
	});

	test('the handler receives its lane job id (ToolActionContext.backgroundJobId)', async () => {
		const seen: { id?: string } = {};
		const spec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async (context) => {
				seen.id = context.backgroundJobId;
				return ok(true, { requestId: 'tools-background-test' });
			},
		};
		const { loaded } = makeLoaded(['long_job']);
		const response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
		await new Promise((r) => setTimeout(r, 20));
		expect(typeof seen.id).toBe('string');
		expect(seen.id).toBe(response.background_job_id as string);
	});

	test('a TYPED failure rides the terminal frame as the converter body; errors[] carries its wire sentence, never the log-only message', async () => {
		const spec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				throw new DedaloError('export.format_limit', {
					message: 'LOG-ONLY /secret/path/grid.ndjson',
					details: { format: 'xlsx', limit: 16384, not_declared: 'x' },
					coordinates: { job: 'j1' },
				});
			},
		};
		const { loaded } = makeLoaded(['long_job']);
		// The debug flag ON, so the converter WOULD add a debug block: the record
		// must still not keep one (it outlives the flag in the pfile).
		const previousDebug = process.env.DEDALO_DEBUG_API_ERRORS;
		process.env.DEDALO_DEBUG_API_ERRORS = 'true';
		let response: ReturnType<typeof scheduleBackground>;
		try {
			response = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1);
			await new Promise((r) => setTimeout(r, 20));
		} finally {
			if (previousDebug === undefined)
				Reflect.deleteProperty(process.env, 'DEDALO_DEBUG_API_ERRORS');
			else process.env.DEDALO_DEBUG_API_ERRORS = previousDebug;
		}
		const frame = mediaJobs.frame(response.background_job_id as string);
		expect(frame?.is_running).toBe(false);
		expect(frame?.error?.code).toBe('export.format_limit');
		expect(frame?.error?.label_key).toBe('error_export_format_limit');
		expect(frame?.error?.details).toEqual({ format: 'xlsx', limit: 16384 });
		expect(JSON.stringify(frame)).not.toContain('/secret/path');
		expect(JSON.stringify(frame)).not.toContain('not_declared');
		// the SAME body the converter builds, minus the flag-gated debug block
		// (the flag was on while it failed, so this is non-vacuous)
		expect(errorBodySchema.safeParse(frame?.error).success).toBe(true);
		expect(Object.keys(frame?.error ?? {}).sort()).toEqual(
			['category', 'code', 'details', 'label_key', 'message', 'retryable'].sort(),
		);
		expect(JSON.stringify(frame)).not.toContain('LOG-ONLY');
	});

	test('the executor record (served by get_background_job_status / get_background_jobs) carries the WIRE sentence of a typed throw; only the log keeps the log-only message', async () => {
		const spec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				throw new DedaloError('export.store_unavailable', {
					message: "cannot create the export artifacts root '/secret/private/export_artifacts'",
				});
			},
		};
		const { loaded } = makeLoaded(['long_job']);
		const logged: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			logged.push(args.map(String).join(' '));
		};
		let jobId: string;
		try {
			jobId = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1)
				.background_job_id as string;
			await new Promise((r) => setTimeout(r, 20));
		} finally {
			console.error = originalError;
		}
		const job = getBackgroundJob(jobId);
		expect(job?.status).toBe('error');
		// The SERVED record: the registry's wire sentence, no path.
		const { wireMessage } = await import('../../src/core/errors/convert.ts');
		expect(job?.error).toBe(
			wireMessage(new DedaloError('export.store_unavailable', { message: 'x' })),
		);
		expect(job?.error ?? '').not.toContain('/secret/');
		const listed = listBackgroundJobs('tool_demo', -1, true).find((row) => row.id === jobId);
		expect(listed?.error ?? '').not.toContain('/secret/');
		// The operator's journal line still names the full log-only message.
		expect(
			logged.some(
				(line) =>
					line.startsWith('[background jobs]') &&
					line.includes(jobId) &&
					line.includes('/secret/private'),
			),
		).toBe(true);
	});

	test('an UNTYPED throw (a raw fs error naming an absolute path) serves only the converter sentence: job.error, listed rows, frame errors[] and error body — the path stays in the log', async () => {
		const RAW =
			"ENOENT: no such file or directory, open '/srv/secret_media/image/original/0/test99_test3_12.jpg'";
		const spec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async () => {
				throw new Error(RAW);
			},
		};
		const { loaded } = makeLoaded(['long_job']);
		const logged: string[] = [];
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			logged.push(args.map(String).join(' '));
		};
		let jobId: string;
		try {
			jobId = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1)
				.background_job_id as string;
			for (let i = 0; i < 50 && mediaJobs.frame(jobId)?.is_running; i++) {
				await new Promise((r) => setTimeout(r, 10));
			}
		} finally {
			console.error = originalError;
		}
		const { toDedaloError, wireMessage } = await import('../../src/core/errors/convert.ts');
		const sentence = wireMessage(toDedaloError(new Error('x')));
		const job = getBackgroundJob(jobId);
		expect(job?.status).toBe('error');
		expect(job?.error).toBe(sentence);
		const listed = listBackgroundJobs('tool_demo', -1, true).find((row) => row.id === jobId);
		expect(listed?.error).toBe(sentence);
		const frame = mediaJobs.frame(jobId);
		expect(frame?.is_running).toBe(false);
		expect(frame?.errors).toEqual([sentence]);
		expect(frame?.error?.code).toBe('internal.unexpected');
		// nothing served, nothing persisted in the pfile, names the path
		expect(JSON.stringify(frame)).not.toContain('/srv/secret_media');
		expect(JSON.stringify(job)).not.toContain('/srv/secret_media');
		expect(readFileSync(join(scratchDir, `${jobId}.json`), 'utf8')).not.toContain(
			'/srv/secret_media',
		);
		// the operator still reads it: both terminal log lines keep the raw text
		expect(logged.some((line) => line.startsWith('[background jobs]') && line.includes(RAW))).toBe(
			true,
		);
		expect(logged.some((line) => line.startsWith('[media jobs]') && line.includes(RAW))).toBe(true);
	});

	test('a user STOP that surfaces as a typed abort (export.cancelled) puts NO `error` on the frame — a stop is not a failure', async () => {
		const spec: ToolActionSpec = {
			permission: null,
			gatedInHandler: 'test fixture — the background executor is under test, not any gate',
			handler: async (context) => {
				await new Promise<void>((resolve) => {
					if (context.signal?.aborted) resolve();
					context.signal?.addEventListener('abort', () => resolve(), { once: true });
				});
				throw new DedaloError('export.cancelled', { message: 'stopped mid-spool' });
			},
		};
		const { loaded } = makeLoaded(['long_job']);
		const quiet = console.error;
		const errorLines: string[] = [];
		console.error = (...args: unknown[]) => {
			errorLines.push(args.map((arg) => String(arg)).join(' '));
		};
		const errorsBefore = getBackgroundJobStats().error;
		let jobId: string;
		try {
			jobId = scheduleBackground(loaded, 'long_job', spec, {}, PRINCIPAL, -1)
				.background_job_id as string;
			await new Promise((r) => setTimeout(r, 20));
			expect(mediaJobs.stop(jobId)).toBe(true);
			for (let i = 0; i < 50 && mediaJobs.frame(jobId)?.is_running; i++) {
				await new Promise((r) => setTimeout(r, 10));
			}
		} finally {
			console.error = quiet;
		}
		const frame = mediaJobs.frame(jobId);
		expect(frame?.is_running).toBe(false);
		expect(mediaJobs.status(jobId)?.status).toBe('stopped');
		expect(frame !== null && Object.hasOwn(frame, 'error')).toBe(false);
		// the stop is still SAID, in the human lines
		expect(frame?.errors.length).toBeGreaterThan(0);
		// ... and the BackgroundJob record agrees: 'stopped', never an 'error'
		// counted in the operator's failure gauge, never an error-level journal line
		expect(getBackgroundJob(jobId)?.status).toBe('stopped');
		expect(getBackgroundJobStats().error).toBe(errorsBefore);
		expect(
			errorLines.some((line) => line.startsWith('[background jobs]') && line.includes(jobId)),
		).toBe(false);
	});
});
