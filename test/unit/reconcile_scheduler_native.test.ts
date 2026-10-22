/**
 * D5 (owner decision 2026-10-21) — A SCHEDULED RECONCILE THAT WAS DEFERRED IS
 * RE-ARMED UNTIL ONE COMPLETES; one run in flight per name; a stop cancels.
 *
 * THE FINDING (closure review, DIFF-2 residual). The boot `media_index` apply
 * holds every marker database's publication-target fence within ONE bounded
 * wait (MEDIA_INDEX_FENCE_BOUND_MS, 120 s). A runner batch holding a target
 * past it DEFERS the apply — nothing written, the drift reported — and the
 * scheduler fired the boot run exactly once: the crash drift the boot run
 * exists to heal stayed until the next restart.
 *
 * THE SITUATION IS BUILT on a scratch marker store (the module's temp-dir
 * seam): a truth marker `dbs/<db>/<table>/K` with no `pub/K`, and a stray
 * `pub/S` no truth owns — real work for every apply. A publication writer is
 * modelled by taking `sql:<db>` from ANOTHER Postgres session. The fence budget
 * of the registry's run is shortened through the media_index seam, the
 * scheduler's delays through its own (named test seams, DEC-12); everything
 * else is the real registry, the real definition and the real fence.
 *
 * OUTCOMES ASSERTED (the store and the run log, never the scheduler's state):
 *  1. RE-ARMED: the first scheduled run defers (nothing applied, the gauge says
 *     why); once the writer releases, a LATER run heals pub/ — without a
 *     restart. Then the scheduler returns to the definition's period.
 *  2. ONE IN FLIGHT: re-arms and periods far shorter than a run never start a
 *     second run of the same name beside the first — not even across a
 *     stop → start while a run still waits on its fence.
 *  3. STOP CANCELS: after stopReconcileScheduler (the SIGTERM drain) no run
 *     starts — a pending re-arm is cleared, and a run in flight when it was
 *     called does not re-arm when it ends deferred; the shutdown WAITS for that
 *     run (drainReconcileScheduler), bounded by its deadline, and names a run
 *     still in flight at it.
 *  3c. A THROWN RUN IS NOT RE-ARMED EARLY: an interval definition's next run
 *     comes at its period, never at the deferral re-arm; a `boot` one never
 *     runs again — and the gauge records the failure.
 *  4. IDENTITY: a run executes in the scheduler's own scope (request id
 *     `reconcile:<name>`, no principal, the install's default langs) even when
 *     the scheduler was armed inside a request's scope; arming inside a
 *     transaction is refused.
 *  5. THE OPERATOR DOOR SAYS SO: an APPLY through the Reconcile widget that
 *     defers answers DEFERRED with the reason, never a bare "applied 0".
 *
 * WRITES: a temp directory only; advisory locks on the lane database, released.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { widget as reconcileStatusWidget } from '../../src/core/area_maintenance/widgets/reconcile_status.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DIFFUSION_TARGET_LOCK_CLASS } from '../../src/core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	lastReconcileRun,
	type ReconcileReport,
	type ReconcileSchedule,
	reconcileGauge,
	registerReconcile,
	resetReconcileRunsForTests,
	validateDefinition,
} from '../../src/core/reconcile/registry.ts';
import {
	drainReconcileScheduler,
	startReconcileScheduler,
	stopReconcileScheduler,
} from '../../src/core/reconcile/scheduler.ts';
import {
	currentApplicationLang,
	currentDataLang,
	runWithRequestLangs,
} from '../../src/core/resolve/request_lang.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	currentRequestContext,
	runWithRequestContext,
} from '../../src/core/security/request_context.ts';
import {
	MEDIA_INDEX_RECONCILE,
	MEDIA_INDEX_RECONCILE_EVERY_MS,
} from '../../src/diffusion/api/reconcile.ts';
import {
	overrideMediaIndexBaseForTests,
	overrideMediaIndexFenceBoundForTests,
} from '../../src/diffusion/targets/mediastore/media_index.ts';

const DB = 'zzrsch_db';
const TABLE = 'zzrsch_t';
const TRUTH_KEY = 'zzrsch1_1';
const STRAY_KEY = 'zzrsch1_9';
/** The fence budget of ONE scheduled run, through the media_index seam. */
const FENCE_MS = 300;
/** The scheduler's deferral re-arm delay, through its seam. */
const RETRY_MS = 100;
/** Per-leg budget (the waits below are bounded well inside it). */
const LEG_MS = 20_000;

let base: string;

/** Every scheduled run of media_index, as the definition saw it. */
interface RunLog {
	started: number;
	ended: number;
	/** performance.now() of each start. */
	startedAt: number[];
	maxConcurrent: number;
	scopes: {
		requestId: string | undefined;
		principal: unknown;
		appLang: string;
		dataLang: string;
	}[];
	reports: ReconcileReport[];
}

let log: RunLog;
/** When true the spied run THROWS (a scheduled run that fails). */
let failNextRuns = false;
let runSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'dedalo_reconcile_scheduler_'));
	overrideMediaIndexBaseForTests(base);
	overrideMediaIndexFenceBoundForTests(FENCE_MS);
	registerReconcile(MEDIA_INDEX_RECONCILE);
	resetReconcileRunsForTests();
	touch(join(base, 'dbs', DB, TABLE, TRUTH_KEY));
	touch(join(base, 'pub', STRAY_KEY));
	log = { started: 0, ended: 0, startedAt: [], maxConcurrent: 0, scopes: [], reports: [] };
	const realRun = MEDIA_INDEX_RECONCILE.run;
	runSpy = spyOn(MEDIA_INDEX_RECONCILE, 'run').mockImplementation(async (options) => {
		// THIS test's log, captured at entry: a run a previous test left in flight
		// writes into its own, never into the next test's.
		const mine = log;
		mine.started++;
		mine.startedAt.push(performance.now());
		mine.maxConcurrent = Math.max(mine.maxConcurrent, mine.started - mine.ended);
		const context = currentRequestContext();
		mine.scopes.push({
			requestId: context?.requestId,
			principal: context?.principal,
			appLang: currentApplicationLang(),
			dataLang: currentDataLang(),
		});
		try {
			if (failNextRuns) {
				throw new DedaloError('internal.invariant', { message: 'zzrsch scheduled run fails' });
			}
			const report = await realRun(options);
			mine.reports.push(report);
			return report;
		} finally {
			mine.ended++;
		}
	});
});

afterEach(async () => {
	stopReconcileScheduler();
	// A run still in flight settles before its store and seams are taken away.
	const left = await drainReconcileScheduler(Date.now() + LEG_MS);
	if (left.length > 0) throw new Error(`scheduled run(s) still in flight: ${left.join(', ')}`);
	failNextRuns = false;
	runSpy?.mockRestore();
	runSpy = null;
	overrideMediaIndexFenceBoundForTests(null);
	overrideMediaIndexBaseForTests(null);
	rmSync(base, { recursive: true, force: true });
});

function touch(path: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, '');
}

/** pub/ healed: the truth's marker exists, the stray is gone. */
function healed(): boolean {
	return existsSync(join(base, 'pub', TRUTH_KEY)) && !existsSync(join(base, 'pub', STRAY_KEY));
}

/** pub/ untouched by any apply: the truth's marker missing, the stray still there. */
function untouched(): boolean {
	return !existsSync(join(base, 'pub', TRUTH_KEY)) && existsSync(join(base, 'pub', STRAY_KEY));
}

async function until(predicate: () => boolean, label: string, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
		await Bun.sleep(10);
	}
}

/** Take `sql:<db>` from ANOTHER session — a runner batch writing into that target. */
async function holdTarget(database: string): Promise<{ release: () => Promise<void> }> {
	const connection = await sql.reserve();
	await connection.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
		DIFFUSION_TARGET_LOCK_CLASS,
		`sql:${database}`,
	]);
	let released = false;
	return {
		release: async () => {
			if (released) return;
			released = true;
			try {
				await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
					DIFFUSION_TARGET_LOCK_CLASS,
					`sql:${database}`,
				]);
			} finally {
				connection.release();
			}
		},
	};
}

/** The schedule under test: media_index only, short re-arm, a period far away unless given. */
function startMediaIndexOnly(everyMs = 60_000): void {
	startReconcileScheduler({
		names: ['media_index'],
		deferredRetryMs: RETRY_MS,
		everyMsFor: { media_index: everyMs },
	});
}

describe('reconcile scheduler — a deferred media_index run is re-armed until one completes (D5)', () => {
	test('the schedule facet is closed: an interval needs everyMs > 0 and atBoot, when given, is a boolean', () => {
		const withSchedule = (schedule: unknown) => () =>
			validateDefinition({ ...MEDIA_INDEX_RECONCILE, schedule: schedule as ReconcileSchedule });
		for (const valid of ['boot', 'operator', { everyMs: 1 }, { everyMs: 1, atBoot: true }]) {
			expect(withSchedule(valid)).not.toThrow();
		}
		for (const invalid of [
			{ everyMs: 0 },
			{ everyMs: 1, atBoot: 'yes' },
			{ atBoot: true },
			'hourly',
		]) {
			expect(withSchedule(invalid)).toThrow(/schedule must be/);
		}
	});

	test(
		'5. the operator door names a deferred apply: DEFERRED + the held target, the record carries it',
		async () => {
			const writer = await holdTarget(DB);
			try {
				const outcome = (await reconcileStatusWidget.apiActions?.run_reconcile?.(
					{ name: 'media_index', apply: true },
					{ isGlobalAdmin: true } as unknown as Principal,
				)) as { data: boolean; msg: string; extend?: { record: { deferred: string | null } } };
				expect(outcome.data).toBe(true);
				expect(outcome.msg).toContain('DEFERRED');
				expect(outcome.msg).toContain(`sql:${DB}`);
				expect(outcome.extend?.record.deferred).toContain(`sql:${DB}`);
				expect(untouched()).toBe(true);
			} finally {
				await writer.release();
			}
		},
		LEG_MS,
	);

	test(
		'media_index runs at boot AND on a period (pub/ drift a runner leaves mid-batch is healed while the server lives)',
		() => {
			expect(MEDIA_INDEX_RECONCILE.schedule).toEqual({
				everyMs: MEDIA_INDEX_RECONCILE_EVERY_MS,
				atBoot: true,
			});
			expect(MEDIA_INDEX_RECONCILE_EVERY_MS).toBeGreaterThan(0);
		},
		LEG_MS,
	);

	test(
		'1. the boot run defers while a writer holds the target; a LATER run heals pub/ once it releases — no restart',
		async () => {
			const writer = await holdTarget(DB);
			try {
				startMediaIndexOnly();
				await until(() => log.ended >= 1, 'the boot run ended');
				// Deferred: nothing applied, and the gauge says the apply did not happen.
				expect(untouched()).toBe(true);
				expect(log.reports[0]?.applied).toBe(0);
				expect(log.reports[0]?.deferred?.reason).toContain(`sql:${DB}`);
				const gauge = reconcileGauge().media_index as Record<string, unknown>;
				expect(gauge.last_deferred).toContain(`sql:${DB}`);
				expect(lastReconcileRun('media_index')?.deferred).toContain(`sql:${DB}`);
			} finally {
				await writer.release();
			}
			// Wait on the run that FINISHED (its report and record), not on its
			// filesystem side effect: pub/ is healed inside the fence unit, before the
			// unit commits and the registry records the run.
			await until(
				() => log.reports.at(-1)?.deferred === undefined && log.started === log.ended,
				'a re-armed run completed',
			);
			expect(healed()).toBe(true);
			const done = log.reports.at(-1);
			expect(done?.deferred).toBeUndefined();
			expect(done?.applied).toBe(2);
			expect(lastReconcileRun('media_index')?.deferred).toBeNull();
			expect(log.started).toBeGreaterThanOrEqual(2);
			// Completed: back to the period (60 s here) — no further run within many re-arm delays.
			const runs = log.started;
			await Bun.sleep(RETRY_MS * 6);
			expect(log.started).toBe(runs);
		},
		LEG_MS,
	);

	test(
		'1b. after a completed run the period re-arms it: drift that appears later is healed without a restart',
		async () => {
			startMediaIndexOnly(150);
			await until(healed, 'the boot run healed pub/');
			// New drift while the server lives: a runner died between dbs/ and pub/.
			touch(join(base, 'dbs', DB, TABLE, 'zzrsch1_2'));
			await until(() => existsSync(join(base, 'pub', 'zzrsch1_2')), 'a periodic run healed it');
			expect(log.maxConcurrent).toBe(1);
		},
		LEG_MS,
	);

	test(
		'2. one run in flight per name: re-arms and a period far shorter than a run never overlap it — nor does a stop → start',
		async () => {
			const writer = await holdTarget(DB);
			try {
				// Period 20 ms, re-arm 100 ms, each run ~300 ms (the fence budget): a
				// setInterval would start ~15 runs per run.
				startMediaIndexOnly(20);
				await until(() => log.ended >= 2, 'two deferred runs ended');
				// A stop → start while a run waits on its fence: the new schedule's boot
				// run must not start beside the one still in flight.
				await until(() => log.started > log.ended, 'a run in flight');
				stopReconcileScheduler();
				startMediaIndexOnly(20);
				// The new schedule's runs are put back while the old run is in flight…
				const beforeRestart = log.started;
				await Bun.sleep(FENCE_MS * 2);
				// …and they DO start once it ended (the re-arm ran, not merely waited).
				await until(() => log.started > beforeRestart, 'the restarted schedule ran');
			} finally {
				await writer.release();
			}
			await until(healed, 'a run healed pub/ once the writer released');
			expect(log.maxConcurrent).toBe(1);
		},
		LEG_MS,
	);

	test(
		'3a. a stop clears the pending re-arm: no run starts after it, the drift stays for the next boot',
		async () => {
			const writer = await holdTarget(DB);
			try {
				startMediaIndexOnly();
				await until(() => log.ended >= 1, 'the boot run deferred');
				expect(log.started).toBe(log.ended);
				stopReconcileScheduler();
			} finally {
				await writer.release();
			}
			const runs = log.started;
			await Bun.sleep(RETRY_MS * 8);
			expect(log.started).toBe(runs);
			expect(untouched()).toBe(true);
		},
		LEG_MS,
	);

	test(
		'3b. a run in flight at the stop is waited for by the shutdown drain (bounded), and does not re-arm when it ends deferred',
		async () => {
			const writer = await holdTarget(DB);
			try {
				startMediaIndexOnly();
				await until(() => log.started >= 1, 'the boot run started');
				expect(log.ended).toBe(0);
				stopReconcileScheduler();
				// The shutdown's wait is bounded: a run past the deadline is NAMED, not waited out.
				expect(await drainReconcileScheduler(Date.now() + 20)).toEqual(['media_index']);
				expect(log.ended).toBe(0);
				// Within the deadline it is waited for: the drain returns once it ended.
				expect(await drainReconcileScheduler(Date.now() + LEG_MS)).toEqual([]);
				expect(log.ended).toBe(1);
				expect(log.reports[0]?.deferred).toBeDefined();
			} finally {
				await writer.release();
			}
			await Bun.sleep(RETRY_MS * 8);
			expect(log.started).toBe(1);
			expect(untouched()).toBe(true);
		},
		LEG_MS,
	);

	test(
		'3c. a THROWN interval run is re-armed at its period, never at the deferral re-arm; the gauge records it',
		async () => {
			const PERIOD_MS = 900;
			failNextRuns = true;
			startReconcileScheduler({
				names: ['media_index'],
				deferredRetryMs: 30,
				everyMsFor: { media_index: PERIOD_MS },
			});
			await until(() => log.ended >= 1, 'the boot run failed');
			expect(reconcileGauge().media_index).toMatchObject({ last_error: 'internal.invariant' });
			// Many re-arm delays later: still one run.
			await Bun.sleep(30 * 12);
			expect(log.started).toBe(1);
			// The period re-arms it.
			await until(() => log.started >= 2, 'the period re-ran it', PERIOD_MS * 4);
			const gap = (log.startedAt[1] as number) - (log.startedAt[0] as number);
			expect(gap).toBeGreaterThanOrEqual(PERIOD_MS - 50);
		},
		LEG_MS,
	);

	test(
		'3d. a THROWN boot run is done: it never runs again in this process',
		async () => {
			const schedule = MEDIA_INDEX_RECONCILE.schedule;
			MEDIA_INDEX_RECONCILE.schedule = 'boot';
			try {
				failNextRuns = true;
				startReconcileScheduler({ names: ['media_index'], deferredRetryMs: 30 });
				await until(() => log.ended >= 1, 'the boot run failed');
				await Bun.sleep(30 * 15);
				expect(log.started).toBe(1);
				expect(lastReconcileRun('media_index')?.error).toBe('internal.invariant');
			} finally {
				stopReconcileScheduler();
				MEDIA_INDEX_RECONCILE.schedule = schedule;
			}
		},
		LEG_MS,
	);

	test(
		"4. a run executes in the scheduler's own scope, whatever scope armed it",
		async () => {
			const requestPrincipal = { userId: 424_242 } as unknown as Principal;
			runWithRequestContext(
				{
					principal: requestPrincipal,
					session: null,
					requestId: 'req-bleed',
					clientIp: '10.9.9.9',
				},
				() =>
					runWithRequestLangs({ applicationLang: 'lg-zzz', dataLang: 'lg-zzy' }, () =>
						startMediaIndexOnly(),
					),
			);
			await until(healed, 'the boot run healed pub/');
			expect(log.scopes[0]).toEqual({
				requestId: 'reconcile:media_index',
				principal: undefined,
				appLang: config.menu.applicationLang,
				dataLang: config.lang.dataLangDefault,
			});
		},
		LEG_MS,
	);

	test(
		'4b. arming inside a transaction is refused (a timer would carry its expiring handle)',
		async () => {
			let refusal: unknown = null;
			await withTransaction(async () => {
				try {
					startMediaIndexOnly();
				} catch (error) {
					refusal = error;
				}
			});
			expect((refusal as { code?: string } | null)?.code).toBe('internal.invariant');
			await Bun.sleep(RETRY_MS * 3);
			expect(log.started).toBe(0);
		},
		LEG_MS,
	);
});
