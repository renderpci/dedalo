/**
 * THE ONE STEP LOOP (terminal installer phase 4, 2026-10-12) — the resumable
 * loop both executors drive: the ENGINE executor (executor.ts — the engine
 * steps, its database claim) and the HOST executor (host/host_executor.ts —
 * the production/docker host steps, in the root or operator process). One
 * implementation of the rules, so a host step resumes exactly as an engine
 * step does:
 *
 *  - recorded `done`: a step with a verify must still verify (else DRIFT — the
 *    install was changed outside the installer — refused); one without a verify
 *    is skipped;
 *  - recorded `running`/`failed`: a verify that passes means the work landed
 *    before the checkpoint — ADOPTED (marked done, skipped), unless the step is
 *    `neverAdopt`; otherwise it runs again;
 *  - pending: intent → run → created → verify → done, checkpointed around it.
 *
 * The loop knows nothing of WHAT a step does: the driver's `perform` runs it
 * (the engine's step table with its accept/details; a host step's commands)
 * and answers its message and warnings, or throws the refusal.
 *
 * CONFIG-FREE: imports the run-file core, the plan's step ids and the event
 * types only — the host executor's root process loads it (the privilege gate).
 * Also here, shared by both executors: the fault seam (DEDALO_INSTALL_FAULT),
 * the event emitter, the console redaction and the children stop.
 */

import type { Subprocess } from 'bun';
import { processEnvValue } from '../../config/env.ts';
import { hostRefuse } from './host/refuse.ts';
import { ALL_STEP_IDS, type StepId } from './install_plan.ts';
import type { RunIo, StepPhase } from './run_events.ts';
import {
	type InstallState,
	type PlanFile,
	pendingStep,
	redactSecrets,
	type StepRecord,
} from './run_files_core.ts';

/** A step's verdict on whether its work landed. */
export interface VerifyResult {
	ok: boolean;
	detail: string;
	/** The outcome is present but CONTRADICTS the plan (e.g. another root password): refuse, never re-run. */
	conflict?: boolean;
}

/** What the loop needs of a step definition (both tables' rows satisfy it). */
export interface LoopStep {
	label(plan: PlanFile): string;
	/** The step whose verified outcome proves this one (staged files consumed by an import). */
	readonly consumedBy?: string;
	readonly neverAdopt?: true;
}

/** What a step's work answered. */
export interface Performed {
	message: unknown;
	warnings: string[];
}

/**
 * One run of a loop: the state the loop checkpoints and the driver's hooks.
 * Both executors' contexts extend it (one per call — never module state).
 */
export interface LoopContext {
	readonly io: RunIo;
	readonly children: Set<Subprocess>;
	plan: PlanFile | null;
	state: InstallState | null;
	fault: InstallFault | null;
	redactions: string[];
	currentStep: StepId | null;
	ranAny: boolean;
	/** True only while the ONE unredacted line (the salt) is printed. */
	unredacted: boolean;
	stepOf(step: StepId): LoopStep;
	/** The step's own verify (null = it has none). */
	verifyOwn(step: StepId): Promise<VerifyResult | null>;
	/** Run the step's work; throws the refusal. */
	perform(step: StepId): Promise<Performed>;
	/** The intent a step records BEFORE its work (what --abort must clean even without a checkpoint). */
	intent(step: StepId): void;
	/** What the step created, recorded with its checkpoint. */
	created(step: StepId): void;
	save(): void;
}

// ── the crash seam ───────────────────────────────────────────────────────────

/** DEDALO_INSTALL_FAULT=<step>:<before|after> — the resume drills' SIGKILL point. */
export interface InstallFault {
	step: StepId;
	when: 'before' | 'after';
}

/** Is `value` a `<step id>:before|after` seam value (any step: engine or host)? */
function faultShape(step: string | undefined, when: string | undefined): boolean {
	const knownStep = (ALL_STEP_IDS as readonly string[]).includes(step ?? '');
	return knownStep && (when === 'before' || when === 'after');
}

/**
 * The fault seam, from the PROCESS environment only (never ../private/.env — a
 * stray line there must never kill a real install). Any malformed value refuses.
 */
export function readInstallFault(): InstallFault | null {
	const raw = processEnvValue('DEDALO_INSTALL_FAULT') ?? '';
	if (raw === '') return null;
	const [step, when] = raw.split(':');
	if (!faultShape(step, when)) {
		hostRefuse(
			'install.invalid_input',
			`DEDALO_INSTALL_FAULT must be <step id>:before|after (got '${raw}')`,
		);
	}
	return { step: step as StepId, when: when as 'before' | 'after' };
}

/** SIGKILL this process at the seam point (the resume drills). */
function maybeFault(ctx: LoopContext, step: StepId, when: 'before' | 'after'): void {
	if (ctx.fault?.step === step && ctx.fault.when === when) process.kill(process.pid, 'SIGKILL');
}

// ── output ───────────────────────────────────────────────────────────────────

export function redact(ctx: LoopContext, text: string): string {
	return redactSecrets(text, ctx.redactions);
}

export function say(ctx: LoopContext, line: string): void {
	ctx.io.log(redact(ctx, line));
}

export function warnLine(ctx: LoopContext, line: string): void {
	ctx.io.warn(redact(ctx, line));
}

/** The phases whose event carries the step's recorded duration. */
const TIMED_PHASES: ReadonlySet<StepPhase> = new Set(['done', 'adopted', 'skipped', 'failed']);

/** finished_at − started_at of a step's record (ms), or null. */
function elapsedOf(record: StepRecord | undefined): number | null {
	if (!record?.started_at || !record.finished_at) return null;
	const ms = Date.parse(record.finished_at) - Date.parse(record.started_at);
	return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

/**
 * Tell the front end a step's progress (when it listens — the headless CLI
 * does not, and its log/warn transcript is the same either way). Every text
 * is redacted here, like every logged line.
 */
export function emit(
	ctx: LoopContext,
	step: StepId,
	phase: StepPhase,
	extra: { message?: string | null; warnings?: readonly string[] } = {},
): void {
	if (ctx.io.step === undefined) return;
	const record = ctx.state?.steps[step];
	ctx.io.step({
		step,
		label: ctx.plan === null ? step : ctx.stepOf(step).label(ctx.plan),
		phase,
		elapsedMs: TIMED_PHASES.has(phase) ? elapsedOf(record) : null,
		...(typeof extra.message === 'string' ? { message: redact(ctx, extra.message) } : {}),
		...(extra.warnings === undefined
			? {}
			: { warnings: extra.warnings.map((warning) => redact(ctx, warning)) }),
	});
}

export function nowIso(): string {
	return new Date().toISOString();
}

/** The step's record (created pending when the state predates it). */
export function recordOf(ctx: LoopContext, step: StepId): StepRecord {
	const state = ctx.state as InstallState;
	state.steps[step] ??= pendingStep();
	return state.steps[step] as StepRecord;
}

// ── the loop ─────────────────────────────────────────────────────────────────

/** The consumer whose verdict may stand in for `step`'s, when it has run; else null. */
function activeConsumer(ctx: LoopContext, step: StepId): StepId | null {
	const consumer = ctx.stepOf(step).consumedBy as StepId | undefined;
	if (consumer === undefined || !ctx.plan?.steps.includes(consumer)) return null;
	return recordOf(ctx, consumer).status === 'pending' ? null : consumer;
}

/**
 * The step's verdict: its own verify; failing that, for a step another one
 * CONSUMES, the consumer's — once the consumer has itself run. Null = no verify.
 */
export async function verifyStep(ctx: LoopContext, step: StepId): Promise<VerifyResult | null> {
	const own = await ctx.verifyOwn(step);
	if (own === null) return null;
	const consumer = own.ok || own.conflict ? null : activeConsumer(ctx, step);
	if (consumer === null) return own;
	const consumed = await verifyStep(ctx, consumer);
	return consumed?.ok === true
		? { ok: true, detail: `consumed by ${consumer}: ${consumed.detail}` }
		: own;
}

function recordVerdict(record: StepRecord, verdict: VerifyResult): void {
	record.verify = { ok: verdict.ok, detail: verdict.detail, at: nowIso() };
}

/** Mark the step running (attempts, intent) and checkpoint. */
function markRunning(ctx: LoopContext, step: StepId): void {
	const record = recordOf(ctx, step);
	record.status = 'running';
	record.attempts += 1;
	record.started_at = nowIso();
	record.finished_at = null;
	record.error = null;
	ctx.intent(step);
	ctx.save();
}

/** The post-run verify: a step that reported success must also VERIFY. */
async function verifyAfterRun(ctx: LoopContext, step: StepId): Promise<void> {
	const verdict = await ctx.verifyOwn(step);
	if (verdict === null) return;
	recordVerdict(recordOf(ctx, step), verdict);
	if (!verdict.ok) {
		hostRefuse(
			'install.step_failed',
			`step reported success but its outcome does not verify: ${verdict.detail}`,
		);
	}
}

/** Mark the step done with its redacted message + warnings, checkpoint, print. */
function markDone(ctx: LoopContext, step: StepId, done: Performed): void {
	const record = recordOf(ctx, step);
	record.status = 'done';
	record.finished_at = nowIso();
	record.message =
		typeof done.message === 'string' && done.message !== '' ? redact(ctx, done.message) : null;
	record.warnings = done.warnings.map((warning) => redact(ctx, warning));
	ctx.save();
	if (record.message !== null) say(ctx, `  ${record.message}`);
	for (const warning of record.warnings) warnLine(ctx, `  ⚠ ${warning}`);
}

/** Run ONE step (it is not done): running → perform → created → verify → done. */
async function runStep(ctx: LoopContext, step: StepId): Promise<void> {
	markRunning(ctx, step);
	maybeFault(ctx, step, 'before');
	ctx.ranAny = true;
	const done = await ctx.perform(step);
	ctx.created(step);
	await verifyAfterRun(ctx, step);
	markDone(ctx, step, done);
	const record = recordOf(ctx, step);
	emit(ctx, step, 'done', { message: record.message, warnings: record.warnings });
	maybeFault(ctx, step, 'after');
}

/** A step recorded done: it must still verify (when it has a verify), else drift. */
async function confirmDone(ctx: LoopContext, step: StepId): Promise<void> {
	const verdict = await verifyStep(ctx, step);
	if (verdict !== null) {
		recordVerdict(recordOf(ctx, step), verdict);
		if (verdict.conflict === true) hostRefuse('install.state_conflict', verdict.detail);
		if (!verdict.ok) {
			hostRefuse(
				'install.state_conflict',
				`step ${step} was recorded done but its outcome is missing (${verdict.detail}) — the install was changed outside the installer; --abort and start again`,
			);
		}
	}
	say(ctx, '  done in an earlier run — skipped');
	emit(ctx, step, 'skipped');
}

/** A step left running/failed whose work LANDED before its checkpoint: adopt it. */
async function adoptLanded(ctx: LoopContext, step: StepId): Promise<boolean> {
	if (ctx.stepOf(step).neverAdopt === true) return false;
	const verdict = await verifyStep(ctx, step);
	if (verdict?.conflict === true) hostRefuse('install.state_conflict', verdict.detail);
	if (verdict?.ok !== true) return false;
	const record = recordOf(ctx, step);
	recordVerdict(record, verdict);
	ctx.created(step);
	record.status = 'done';
	record.finished_at = nowIso();
	record.error = null;
	ctx.save();
	say(ctx, `  verified (completed in an earlier run): ${verdict.detail}`);
	emit(ctx, step, 'adopted', { message: verdict.detail });
	return true;
}

/** One step through the loop's rules (the header): skip, adopt, refuse as drift, or run. */
export async function advanceStep(ctx: LoopContext, step: StepId): Promise<void> {
	const status = recordOf(ctx, step).status;
	say(ctx, `→ [${step}] ${ctx.stepOf(step).label(ctx.plan as PlanFile)}`);
	ctx.currentStep = step;
	emit(ctx, step, 'start');
	if (status === 'done') return confirmDone(ctx, step);
	if (status !== 'pending' && (await adoptLanded(ctx, step))) return;
	await runStep(ctx, step);
}

/** Every plan step through the loop, in order. */
export async function runPlanSteps(ctx: LoopContext): Promise<void> {
	for (const step of (ctx.plan as PlanFile).steps) await advanceStep(ctx, step);
}

/** Mark the current step failed with a redacted error (the checkpoint a resume reads). */
export function recordFailure(ctx: LoopContext, code: string, message: string): void {
	if (ctx.state === null || ctx.currentStep === null) return;
	const record = recordOf(ctx, ctx.currentStep);
	if (record.status !== 'running') return;
	record.status = 'failed';
	record.finished_at = nowIso();
	record.error = { code, message: redact(ctx, message) };
}

// ── the console and the children ─────────────────────────────────────────────

/** The console methods a run's output can leave through (errors/log.ts uses info). */
const CONSOLE_METHODS = ['log', 'info', 'debug', 'trace', 'warn', 'error'] as const;

/**
 * One console argument redacted: a string, or an Error — its stack (message
 * included) becomes redacted TEXT, since a connection error can quote a
 * credential. Other values pass as they are.
 */
function cleanArg(ctx: LoopContext, arg: unknown): unknown {
	if (ctx.unredacted) return arg;
	if (typeof arg === 'string') return redact(ctx, arg);
	if (arg instanceof Error) return redact(ctx, arg.stack ?? `${arg.name}: ${arg.message}`);
	return arg;
}

/** Redact every console line for the run's duration; answers the restorer. */
export function redactConsole(ctx: LoopContext): () => void {
	const original = Object.fromEntries(
		CONSOLE_METHODS.map((method) => [method, console[method]]),
	) as Record<(typeof CONSOLE_METHODS)[number], (...args: unknown[]) => void>;
	for (const method of CONSOLE_METHODS) {
		const write = original[method];
		console[method] = (...args: unknown[]) => write(...args.map((arg) => cleanArg(ctx, arg)));
	}
	return () => {
		for (const method of CONSOLE_METHODS) console[method] = original[method];
	};
}

/** Kill the run's children (psql, apt, certbot, the engine child…) and wait (bounded). */
export async function stopChildren(ctx: LoopContext): Promise<void> {
	const children = [...ctx.children];
	for (const child of children) child.kill('SIGTERM');
	await Promise.race([
		Promise.all(children.map((child) => child.exited)),
		new Promise((done) => setTimeout(done, 10_000)),
	]);
}
