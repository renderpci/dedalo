/**
 * Diffusion scheduler — the control plane's job dispatcher (DIFFUSION_SPEC §4.2).
 *
 * Claims queued jobs (bounded by DEDALO_DIFFUSION_MAX_RUNNERS, default 2) and
 * spawns one RUNNER PROCESS per claim: `bun run src/diffusion/runner.ts --job
 * <uuid>` — same codebase, separate process, own memory ceiling, killable.
 * The runner talks only to Postgres (and later the publication targets), so a
 * runner daemon on another machine claiming from the same queue needs no code
 * change — this local spawner is just the default deployment.
 *
 * Also hosts the SWEEPER cadence: at boot and on an interval, stale-heartbeat
 * running jobs are re-queued (attempt budget) or failed — the crash-recovery
 * path a durable queue exists for.
 */

import { hostname } from 'node:os';
import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { claimNextQueuedJob, purgeTerminalJobs, recordRunnerPid, sweepStaleJobs } from './queue.ts';

const MAX_RUNNERS = Math.max(1, Number(readString('DEDALO_DIFFUSION_MAX_RUNNERS')) || 2);

/** The configured runner concurrency limit — read-only surface for the admin widget. */
export function getMaxRunners(): number {
	return MAX_RUNNERS;
}

/** Runner heartbeats every 5s; 3 missed beats + margin marks it stale. */
export const RUNNER_HEARTBEAT_MS = 5000;
export const STALE_AFTER_SECONDS = 20;

/**
 * Job-dispatch pause switch (admin flow control, in-memory). While paused the
 * scheduler claims NO new jobs — in-flight runners finish, queued jobs simply
 * wait. The SWEEPER is deliberately NOT gated by this (crash recovery must keep
 * healing lost runs). This is runtime-only state: a server restart resets it to
 * running, which is the safe default for a short operational hold.
 */
let paused = false;
export function pauseScheduler(): void {
	paused = true;
}
export function resumeScheduler(): void {
	paused = false;
}
export function isSchedulerPaused(): boolean {
	return paused;
}

const SCHEDULER_TICK_MS = 2000;
const SWEEPER_TICK_MS = 30000;

const runnerModulePath = new URL('../runner.ts', import.meta.url).pathname;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let sweeperTimer: ReturnType<typeof setInterval> | null = null;
/** Re-entrancy latch: one tick at a time (spawn + count are async). */
let ticking = false;

/** Spawn the runner process for a claimed job and record its pid. */
function spawnRunner(jobId: string): void {
	const child = Bun.spawn(['bun', 'run', runnerModulePath, '--job', jobId], {
		cwd: new URL('../../../', import.meta.url).pathname,
		stdout: 'ignore',
		stderr: 'inherit',
		env: { ...process.env },
	});
	// The pid is informational (sweeper cross-check / cancel SIGTERM on this
	// host); liveness truth is the HEARTBEAT, which also covers remote runners.
	// Caught, not void'd: this runs OUTSIDE the tick's try/catch, and a floating
	// rejection kills the whole Bun process (S1-15).
	recordRunnerPid(jobId, child.pid).catch((error) =>
		console.error('[diffusion scheduler] recordRunnerPid failed:', error),
	);
	// Reap on exit so a finished runner never lingers as a zombie. The exit
	// STATE is owned by the runner itself (finishJob) or the sweeper — not here.
	void child.exited;
}

/**
 * One scheduler pass: claim + spawn until the runner budget is spent or the
 * queue is empty. Exported for the enqueue path (immediate kick — no 2s wait)
 * and for tests.
 */
export async function schedulerTick(): Promise<void> {
	if (paused) return;
	if (ticking) return;
	ticking = true;
	try {
		// Budget INSIDE the claim (audit S3-64): the old read-count-then-claim
		// two-step let two scheduler instances both observe count<max and both
		// claim past the budget. claimNextQueuedJob returns null when the queue
		// is empty OR the running count has reached MAX_RUNNERS.
		while (true) {
			const claimed = await claimNextQueuedJob(hostname(), MAX_RUNNERS);
			if (claimed === null) break;
			spawnRunner(claimed.job_id);
		}
	} catch (error) {
		console.error('[diffusion scheduler] tick failed:', error);
	} finally {
		ticking = false;
	}
}

/** Terminal jobs older than this are purged by the sweeper cadence (S3-46/62). */
const TERMINAL_PURGE_AFTER_HOURS = 7 * 24;
/** Purge at most once per day (the sweeper ticks every 30 s). */
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
let lastPurgeAt = 0;

/** Boot + periodic sweep (crash recovery) + residue purge. Exported for tests. */
export async function sweeperTick(): Promise<void> {
	try {
		const { requeued, failed } = await sweepStaleJobs(STALE_AFTER_SECONDS);
		if (requeued.length > 0 || failed.length > 0) {
			console.warn(`[diffusion sweeper] requeued=${requeued.length} failed=${failed.length}`);
		}
	} catch (error) {
		console.error('[diffusion sweeper] sweep failed:', error);
	}
	// Residue GC (audit S3-46/62): terminal rows accumulated forever — the old
	// engine's 24 h progress store auto-purged; a week of history is plenty for
	// the admin widget, and the dd1758 ledger keeps the durable audit trail.
	if (Date.now() - lastPurgeAt >= PURGE_INTERVAL_MS) {
		lastPurgeAt = Date.now();
		try {
			const { purged } = await purgeTerminalJobs(TERMINAL_PURGE_AFTER_HOURS);
			if (purged > 0) console.log(`[diffusion sweeper] purged ${purged} terminal job row(s)`);
		} catch (error) {
			console.error('[diffusion sweeper] terminal purge failed:', error);
		}
	}
}

/**
 * Start the scheduler + sweeper cadences. Called once from startServer; safe
 * to call twice (idempotent). Boot order: sweep first (heal interrupted runs
 * from the previous process life), then schedule.
 */
export function startDiffusionScheduler(): void {
	if (schedulerTimer !== null) return;
	void sweeperTick().then(() => schedulerTick());
	schedulerTimer = setInterval(() => void schedulerTick(), SCHEDULER_TICK_MS);
	sweeperTimer = setInterval(() => void sweeperTick(), SWEEPER_TICK_MS);
}

/** Stop cadences (tests / graceful shutdown). Running runners keep running. */
export function stopDiffusionScheduler(): void {
	if (schedulerTimer !== null) clearInterval(schedulerTimer);
	if (sweeperTimer !== null) clearInterval(sweeperTimer);
	schedulerTimer = null;
	sweeperTimer = null;
}
