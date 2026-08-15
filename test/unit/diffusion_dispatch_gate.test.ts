/**
 * Tripwire: job CLAIMING has one gate, and it is inside schedulerTick.
 *
 * DEDALO_DIFFUSION_SCHEDULER_ENABLED=false promises, in its catalog entry, that
 * this process will not touch the live queue — that is the whole point of the
 * key ("a second instance of the same installation sharing the database", the
 * ops smoke tests). The gate used to live at the BOOT CADENCE only
 * (server.ts startServer), while claiming has THREE entry points: that cadence,
 * the enqueue kick (diffusion/api/actions.ts) and the widget's requeue kick
 * (core/area_maintenance/widgets/diffusion_server_control.ts). Both kicks
 * checked `paused` and nothing else, so a disabled instance still claimed and
 * spawned runners for anything enqueued ON it — with the recovery sweeper off,
 * because THAT cadence really was gated. The fix is to gate the one function
 * every path funnels through; this test is what keeps it there.
 *
 * Scope, honestly. The GATE half is a source scan plus a default-value check,
 * not a behavioural proof: it catches the regression that actually happened (the
 * guard removed, or a new claim path added around it), but the runtime read is
 * module-scope, so proving the false case behaviourally would need a subprocess
 * with its own env and DB — covered by the ops smoke tests, which set the key.
 * The VERB half below is behavioural and real.
 *
 * Both halves are DB-FREE by design, which is the point: this file runs on the
 * hermetic CI tier, where the DB-backed diffusion_server_control.test.ts cannot.
 */

import { describe, expect, test } from 'bun:test';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	isDispatchEnabled,
	isSchedulerPaused,
	resumeScheduler,
} from '../../src/diffusion/jobs/scheduler.ts';

const SCHEDULER_PATH = new URL('../../src/diffusion/jobs/scheduler.ts', import.meta.url);

async function schedulerSource(): Promise<string> {
	return await Bun.file(SCHEDULER_PATH).text();
}

describe('diffusion dispatch gate', () => {
	test('schedulerTick refuses to claim before anything else, when dispatch is off', async () => {
		const source = await schedulerSource();
		const body = source.slice(source.indexOf('export async function schedulerTick'));
		expect(body).not.toBe('');

		// The guard must be the FIRST statement: a claim reached before it is a
		// claim the key did not prevent.
		const firstStatement = body.slice(body.indexOf('{') + 1).trimStart();
		expect(firstStatement.startsWith('if (!DISPATCH_ENABLED) return;')).toBe(true);
	});

	test('the gate reads the documented config key', async () => {
		const source = await schedulerSource();
		expect(source).toMatch(
			/const DISPATCH_ENABLED = readString\('DEDALO_DIFFUSION_SCHEDULER_ENABLED'\) !== 'false';/,
		);
	});

	test('claiming has no entry point that bypasses schedulerTick', async () => {
		// claimNextQueuedJob is the ONE claim primitive. If it is ever called from
		// outside the gated tick, the key stops meaning "this process does not
		// touch the live queue" — so that call must come back through here.
		const source = await schedulerSource();
		const callSites = source.match(/claimNextQueuedJob\(/g) ?? [];
		// One import binding + exactly one call, inside schedulerTick.
		expect(callSites.length).toBe(1);

		const tick = source.slice(source.indexOf('export async function schedulerTick'));
		expect(tick).toContain('claimNextQueuedJob(');
	});

	test('dispatch is ENABLED by default (a standard install must publish)', () => {
		// The suite does not set the key; the default must be the on position, or a
		// normal single-server installation would queue publications forever.
		expect(isDispatchEnabled()).toBe(true);
	});

	test('the runner is spawned with this process own bun, not a PATH lookup', async () => {
		// deploy/dedalo-ts.service pins an absolute interpreter that need not be on
		// systemd's PATH. A bare 'bun' throws inside the tick, AFTER the row is
		// claimed — leaving a job nobody owns until the stale-heartbeat sweep.
		const source = await schedulerSource();
		expect(source).toContain('Bun.spawn([process.execPath,');
		expect(source).not.toMatch(/Bun\.spawn\(\['bun',/);
	});

	test('a runner that never spawns releases its claim', async () => {
		// The claim already happened, so no runner and no heartbeat will ever heal
		// this row: the spawn failure path itself has to finish the job.
		const source = await schedulerSource();
		const spawnFn = source.slice(
			source.indexOf('function spawnRunner'),
			source.indexOf('export async function schedulerTick'),
		);
		expect(spawnFn).toContain('catch');
		expect(spawnFn).toMatch(/finishJob\(jobId, 'failed'/);
	});
});

/**
 * The widget's lifecycle verbs, on the HERMETIC tier.
 *
 * diffusion_server_control.test.ts owns the full action surface but is DB-backed,
 * so it does not run in scripts/ci/hermetic.sh — CI would not have caught a verb
 * rename or a reintroduced daemon action. Verb validation and pause/resume touch
 * NO database (validation precedes the module load; the flags are in-memory), so
 * the contract that matters most is checkable on a bare runner. `drain_resume`
 * is deliberately absent here: it counts running jobs, which needs Postgres.
 */
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

function setScheduler(action: unknown) {
	return dispatchWidgetRequest(
		ADMIN,
		{ model: 'diffusion_server_control', action: 'set_scheduler' },
		{ action },
	);
}

/** The DedaloError a set_scheduler call rejected with. */
async function schedulerRefusal(action: unknown): Promise<DedaloError> {
	try {
		await setScheduler(action);
	} catch (error) {
		expect(error).toBeInstanceOf(DedaloError);
		return error as DedaloError;
	}
	throw new Error(`expected set_scheduler '${String(action)}' to refuse, it answered`);
}

describe('diffusion dispatch verbs', () => {
	test('pause and resume flip the shared flag', async () => {
		try {
			expect((await setScheduler('pause')).data).toBe(true);
			expect(isSchedulerPaused()).toBe(true);
			expect((await setScheduler('resume')).data).toBe(true);
			expect(isSchedulerPaused()).toBe(false);
		} finally {
			resumeScheduler(); // never leak a paused scheduler to sibling suites
		}
	});

	test('an unknown verb is refused, and refusal costs no database', async () => {
		expect((await schedulerRefusal('bogus')).code).toBe('diffusion.invalid_action');
	});

	test('the retired daemon verbs are not smuggled back in as scheduler actions', async () => {
		// The PHP engine's start/stop/restart_server are denied as widget METHODS
		// (diffusion_server_control.test.ts). They must not reappear here either:
		// there is still no process to start or stop.
		for (const action of ['start', 'stop', 'restart', 'start_server', 'restart_server']) {
			expect((await schedulerRefusal(action)).code).toBe('diffusion.invalid_action');
		}
	});

	// WC-076. buildEngineAdvisory is pure (no DB), so the retirement is checkable
	// on this tier. These three keys described a supervised external daemon:
	// whether its service command was configured, whether an auto-recover had
	// restarted it, and the tail of its log. Emitting them as a permanent
	// false/false/null is worse than omitting them — a constant that LOOKS like a
	// signal is one a client eventually branches on.
	test('the engine advisory carries no daemon-era keys', async () => {
		const { buildEngineAdvisory } = await import('../../src/diffusion/api/info.ts');
		const advisory = buildEngineAdvisory(true);
		for (const key of ['service_cmd_configured', 'log_tail', 'recovered']) {
			expect(Object.hasOwn(advisory, key)).toBe(false);
		}
		// Still the live shape the maintenance widget reads.
		expect(advisory.state).toBe('ok');
		expect(advisory.title).toBe('Diffusion ready (native engine)');
		expect((advisory.checks as { engine: string }).engine).toBe('native');
	});

	test('the tool offers no restart_engine / show_log action', async () => {
		// Both are unreachable by construction (actions is always []), but the
		// CLIENT used to branch on them — leaving that branch in place is how a
		// dead daemon control comes back the first time actions is non-empty.
		// Matches CODE, not prose: the comments explaining the retirement name
		// these actions on purpose, and a gate that forbids the words would force
		// the next reader to delete the explanation to stay green.
		const render = await Bun.file(
			new URL('../../tools/tool_diffusion/js/render_tool_diffusion.js', import.meta.url),
		).text();
		expect(render).not.toMatch(/actions\.includes\(\s*['"]restart_engine['"]\s*\)/);
		expect(render).not.toMatch(/actions\.includes\(\s*['"]show_log['"]\s*\)/);
		expect(render).not.toMatch(/advisory\.log_tail/);
		expect(render).not.toMatch(/auto_recover\s*[:,)]/);

		const tool = await Bun.file(
			new URL('../../tools/tool_diffusion/js/tool_diffusion.js', import.meta.url),
		).text();
		expect(tool).not.toMatch(/auto_recover\s*[:,)]/);
	});

	test('the allowed verb list is exactly pause | resume | drain_resume', async () => {
		const widget = await Bun.file(
			new URL(
				'../../src/core/area_maintenance/widgets/diffusion_server_control.ts',
				import.meta.url,
			),
		).text();
		expect(widget).toContain(
			"if (action !== 'pause' && action !== 'resume' && action !== 'drain_resume')",
		);
	});
});
