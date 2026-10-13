/**
 * THE HOST EXECUTOR (terminal installer phase 4, 2026-10-12) — runs a HOST
 * route's plan (production: in the root process; docker/trial: as the
 * operator) through the SAME loop as the engine executor (step_loop.ts):
 * the same verify-skip / adopt / drift rules, the same intent/created
 * checkpoints, the same fault seam, the same events — and the same state
 * schema, in its OWN run dir (two processes never share one state file: root
 * never writes into a directory the instance user owns):
 *
 *   production   /var/lib/dedalo-install/<instance>/  (0700 root)
 *   docker/trial <checkout>/.dedalo-install/          (the operator's)
 *
 * The engine steps are ONE host step (host_engine / stack_engine) whose child
 * keeps its own record; the host step verifies it by asking the child.
 *
 * MODES: fresh (refuse an existing record; production refuses without root —
 * the sentence carries the `sudo sh install.sh …` form); resume (the saved
 * plan; the frozen facts; a step whose commands no longer equal the ones the
 * run showed is REFUSED — critique A2); abort (reverse order, only what
 * `created` lists — and once the engine child completed, ONLY the host steps
 * after host_engine: a live install is never taken apart — critique B3).
 *
 * CONFIG-FREE (the privilege gate): run_files_core, the loop, host/** and the
 * plan module — never config.ts, pg_exec or server_state.
 */

import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { isDedaloError } from '../../errors/dedalo_error.ts';
import { DEDALO_VERSION } from '../../update/version.ts';
import {
	type HostStepId,
	type InstallAnswers,
	normalizeInstallAnswers,
	type StepId,
} from '../install_plan.ts';
import type { RunIo, RunOutcomeView } from '../run_events.ts';
import {
	acquireRunLock,
	answerDifferences,
	ensureRunDir,
	type InstallPreflight,
	type InstallState,
	newInstallState,
	PLAN_FILE,
	type PlanFile,
	planHash,
	type RunMode,
	type RunRecord,
	readPlanFile,
	readStateFile,
	releaseRunLock,
	runRecord,
	type SecretKey,
	type Secrets,
	STATE_FILE,
	writePlanFile,
	writeStateFile,
} from '../run_files_core.ts';
import {
	emit,
	type LoopContext,
	nowIso,
	readInstallFault,
	recordFailure,
	recordOf,
	redactConsole,
	runPlanSteps,
	say,
	stopChildren,
	warnLine,
} from '../step_loop.ts';
import type { HostCtx, HostPlanCtx, HostStepDefinition } from './contract.ts';
import { type HostFacts, pendingFacts } from './facts.ts';
import { type HostFs, hostFs } from './fs.ts';
import { hostTable, stepDigest } from './host_table.ts';
import { INSTALL_STATE_ROOT, pathsFor } from './layout.ts';
import { OS_ROWS, osRowById, supportedOsList } from './os_support.ts';
import { hostRefuse } from './refuse.ts';
import { type CommandRunner, scratchRunner, systemRunner } from './runner.ts';
import { readHostRootSeam } from './scratch.ts';
import { bunPinOf, sourceTreeRoot } from './source.ts';
import { emptyHostCreated, type HostCreated } from './state_types.ts';

export interface HostExecutorRequest {
	mode: RunMode;
	execute?: boolean;
	/** fresh: the plan file built from the validated plan. */
	planFile?: PlanFile;
	/** resume: the answers the command line gave, and which keys were given. */
	givenAnswers?: InstallAnswers;
	givenKeys?: readonly string[];
	secrets: Secrets;
	/** abort: must equal the plan's db_database to drop a created database. */
	confirmDatabase?: string;
}

export interface HostExecutorOutcome extends RunOutcomeView {
	/** The lines the operator must act on (firewall, modules, the outside check) — told, never done. */
	told: string[];
	/** An abort of a LIVE install: only the host steps after the engine were undone. */
	keptLive: boolean;
}

/** The machine's seams (a gate injects a recording runner and a scratch fs). */
export interface HostExecutorOptions {
	runner?: CommandRunner;
	fs?: HostFs;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** The source tree (default: the one this module belongs to). */
	source?: string;
	/** Skip the euid check (a gate's scratch run; the preflight's `id -u` still decides). */
	skipPrivilegeCheck?: boolean;
}

/** One host run's context (never module state). */
interface HostRunContext extends LoopContext {
	readonly request: HostExecutorRequest;
	readonly runner: CommandRunner;
	readonly fs: HostFs;
	readonly source: string;
	readonly sleep: (ms: number) => Promise<void>;
	readonly now: () => number;
	readonly runDir: string;
	readonly table: { readonly [K in HostStepId]: HostStepDefinition };
	readonly told: string[];
	run: RunRecord | null;
	secrets: Secrets;
	runLock: boolean;
	keptLive: boolean;
}

// ── where the record lives ───────────────────────────────────────────────────

/** The host run dir of a plan's answers (a host path; the fs maps it under a scratch root). */
export function hostRunDirOf(
	answers: Partial<InstallAnswers>,
	source: string = sourceTreeRoot(),
): string {
	if (answers.route === 'production')
		return `${INSTALL_STATE_ROOT}/${String(answers.instance ?? '')}`;
	return join(source, '.dedalo-install');
}

/**
 * The saved host record of these answers (route + instance), read where the
 * executor will read it (the scratch seam's root included), or null.
 */
export function readHostRecord(
	answers: Partial<InstallAnswers>,
	source: string = sourceTreeRoot(),
): { plan: PlanFile; state: InstallState | null } | null {
	const scratch = readHostRootSeam();
	const dir = hostFs(scratch?.root ?? '').real(hostRunDirOf(answers, source));
	const plan = readPlanFile(dir);
	return plan === null ? null : { plan, state: readStateFile(dir) };
}

/** The command a resume/abort is typed as (production: as root, through the bootstrap). */
export function hostCommandPrefix(answers: Partial<InstallAnswers>): string {
	return answers.route === 'production' ? 'sudo sh install.sh' : 'sh install.sh';
}

/** `--route <r> [--instance <i>]` — what names the record on a resume/abort line. */
function recordFlags(answers: Partial<InstallAnswers>): string {
	const instance = String(answers.instance ?? '');
	return `--route ${String(answers.route)}${instance === '' ? '' : ` --instance ${instance}`}`;
}

/** The hint after a failure. */
function hostHint(ctx: HostRunContext): string[] {
	const plan = ctx.plan;
	if (plan === null || ctx.state === null || ctx.request.mode === 'abort') return [];
	const prefix = `${hostCommandPrefix(plan.answers)} ${recordFlags(plan.answers)}`;
	return [
		`  Progress saved: ${join(ctx.runDir, STATE_FILE)} (plan: ${PLAN_FILE})`,
		`  Fix the cause, then resume:  ${prefix} --resume`,
		`  Or undo this install:        ${prefix} --abort --confirm-database ${String(plan.answers.db_database ?? '<db>')}`,
	];
}

// ── the host context of a step ───────────────────────────────────────────────

/** The answers of the saved plan, normalized (the defaults the plan applied). */
function answersOf(plan: PlanFile): InstallAnswers {
	return normalizeInstallAnswers(plan.answers as Record<string, unknown>).answers;
}

/** The frozen facts (or the pending ones — only the preflight runs before they exist). */
function frozenFacts(state: InstallState | null): HostFacts {
	return state?.preflight.host?.facts ?? pendingFacts();
}

/**
 * The pure plan context: plan, answers, frozen facts, row, paths, source. The
 * paths' service group comes from the FROZEN account facts (critique B2):
 * the frozen digest, the run and every resume compute the same commands.
 */
function planContext(ctx: HostRunContext): HostPlanCtx {
	const plan = ctx.plan as PlanFile;
	const facts = frozenFacts(ctx.state);
	const answers = answersOf(plan);
	return {
		plan,
		answers,
		facts,
		// Before the facts exist only host_preflight runs, and it measures its own row.
		row: facts.os === null ? (OS_ROWS[0] as (typeof OS_ROWS)[number]) : osRowById(facts.os),
		paths: pathsFor(answers, bunPinOf(ctx.source), facts),
		source: ctx.source,
	};
}

function hostCreated(ctx: HostRunContext): HostCreated {
	const state = ctx.state as InstallState;
	state.created.host ??= emptyHostCreated();
	return state.created.host;
}

/** The context a host step runs with. */
function hostContext(ctx: HostRunContext): HostCtx {
	return {
		...planContext(ctx),
		state: ctx.state as InstallState,
		created: hostCreated(ctx),
		secrets: ctx.secrets,
		runner: ctx.runner,
		fs: ctx.fs,
		io: ctx.io,
		children: ctx.children,
		say: (line) => say(ctx, line),
		warn: (line) => warnLine(ctx, line),
		save: () => saveState(ctx),
		sleep: ctx.sleep,
		now: ctx.now,
		...(ctx.request.confirmDatabase === undefined
			? {}
			: { confirmDatabase: ctx.request.confirmDatabase }),
	};
}

function hostStep(ctx: HostRunContext, step: StepId): HostStepDefinition {
	const definition = ctx.table[step as HostStepId];
	if (definition === undefined) {
		hostRefuse(
			'install.invalid_input',
			`${step} is not a host step — this plan belongs to the engine executor`,
		);
	}
	return definition;
}

/**
 * A resume must run the commands the run SHOWED (critique A2): a step's command
 * list is compared with the digest host_preflight froze.
 */
function assertSameCommands(
	ctx: HostRunContext,
	step: StepId,
	definition: HostStepDefinition,
): void {
	const frozen = ctx.state?.preflight.host?.commands_digest[step];
	if (frozen === undefined) return;
	if (stepDigest(definition, planContext(ctx)) !== frozen) {
		hostRefuse(
			'install.state_conflict',
			`the commands of ${step} are not the ones this install showed (the installer's own files changed since) — --abort and start again`,
		);
	}
}

/** A host step's work (the loop's `perform`). */
async function performHostStep(ctx: HostRunContext, step: StepId) {
	const definition = hostStep(ctx, step);
	assertSameCommands(ctx, step, definition);
	const result = await definition.run(hostContext(ctx));
	if (!result.ok) hostRefuse('install.step_failed', result.detail);
	tell(ctx, result.told ?? []);
	return { message: result.detail, warnings: result.warnings ?? [] };
}

/** Lines to tell: the front end's own channel when it has one, else the transcript. */
function tell(ctx: HostRunContext, lines: readonly string[]): void {
	if (lines.length === 0) return;
	ctx.told.push(...lines);
	if (ctx.io.tell !== undefined) ctx.io.tell(lines);
	else for (const line of lines) say(ctx, `  → ${line}`);
}

// ── the modes ────────────────────────────────────────────────────────────────

/** The engine-side preflight fields a host state carries (empty — the child records its own). */
function hostPreflight(): InstallPreflight {
	return {
		preexisting_extensions: [],
		env_backups_before: [],
		env_existed: false,
		env_sha256: null,
		env_had_salt: true,
		sample_env_existed: false,
		install_status_before: null,
		directories_missing: [],
	};
}

function saveState(ctx: HostRunContext): void {
	if (ctx.state !== null) writeStateFile(ctx.state, ctx.runDir);
}

/** The run dir exists at 0700 under 0755 parents (the challenge root's siblings stay readable). */
function prepareRunDir(ctx: HostRunContext): void {
	if (
		ctx.plan?.answers.route === 'production' ||
		ctx.request.planFile?.answers.route === 'production'
	) {
		ctx.fs.mkdir(INSTALL_STATE_ROOT, 0o755, 'root', 'root');
	}
	ensureRunDir(ctx.runDir);
}

function lockRunDir(ctx: HostRunContext): void {
	const lock = acquireRunLock(ctx.request.mode, (line) => warnLine(ctx, `  ⚠ ${line}`), ctx.runDir);
	if (!lock.ok) {
		hostRefuse(
			'install.state_conflict',
			`another install is running (pid ${lock.holder.pid} on ${lock.holder.host}, since ${lock.holder.started_at})`,
		);
	}
	ctx.runLock = true;
}

/** Production needs root: refused before anything is written, with the command that has it. */
function assertPrivilege(plan: PlanFile, skip: boolean): void {
	// Under the scratch seam the recording runner's `id -u` (host_preflight) decides.
	if (skip || plan.answers.route !== 'production' || readHostRootSeam() !== null) return;
	if (process.platform !== 'linux') {
		hostRefuse(
			'install.invalid_input',
			`the production route installs on a Linux server (${supportedOsList()}); on this machine (${process.platform}) use the docker or trial route`,
		);
	}
	if (process.geteuid?.() !== 0) {
		hostRefuse(
			'install.invalid_input',
			'the production route installs packages, a user, units and a site: run it as root — sudo sh install.sh (the same arguments)',
		);
	}
}

function startRun(ctx: HostRunContext, mode: RunMode): void {
	ctx.run = runRecord(mode, ctx.request.execute === true);
	(ctx.state as InstallState).runs.push(ctx.run);
}

async function freshRun(ctx: HostRunContext, skipPrivilege: boolean): Promise<void> {
	const plan = ctx.request.planFile as PlanFile;
	assertPrivilege(plan, skipPrivilege);
	ctx.plan = plan;
	prepareRunDir(ctx);
	lockRunDir(ctx);
	if (readStateFile(ctx.runDir) !== null) {
		hostRefuse(
			'install.state_conflict',
			`an install record exists at ${join(ctx.runDir, STATE_FILE)} — resume it (--resume) or undo it (--abort --confirm-database <db>)`,
		);
	}
	ctx.state = newInstallState(plan, hostPreflight());
	ctx.state.created.host = emptyHostCreated();
	startRun(ctx, 'fresh');
	writePlanFile(plan, ctx.runDir);
	saveState(ctx);
	await runPlanSteps(ctx);
}

/** Read and check the saved record. */
function loadRecord(ctx: HostRunContext): void {
	const plan = readPlanFile(ctx.runDir);
	const state = readStateFile(ctx.runDir);
	if (plan === null || state === null) {
		hostRefuse(
			'install.state_conflict',
			`no install record at ${ctx.runDir} — nothing to ${ctx.request.mode}`,
		);
	}
	if (planHash(plan) !== plan.plan_hash || state.plan_hash !== plan.plan_hash) {
		hostRefuse(
			'install.state_conflict',
			`the install record at ${ctx.runDir} was modified (plan hash mismatch)`,
		);
	}
	ctx.plan = plan;
	ctx.state = state;
}

async function resumeRun(ctx: HostRunContext): Promise<void> {
	lockRunDir(ctx);
	loadRecord(ctx);
	const plan = ctx.plan as PlanFile;
	if (plan.engine_version !== DEDALO_VERSION) {
		hostRefuse(
			'install.state_conflict',
			`plan was written by engine ${plan.engine_version}; this is ${DEDALO_VERSION}`,
		);
	}
	const given = ctx.request.givenAnswers;
	const differing =
		given === undefined ? [] : answerDifferences(plan.answers, given, ctx.request.givenKeys);
	if (differing.length > 0) {
		hostRefuse(
			'install.state_conflict',
			`answers differ from the saved plan: ${differing.join(', ')} — resume takes the saved answers`,
		);
	}
	startRun(ctx, 'resume');
	saveState(ctx);
	await runPlanSteps(ctx);
}

/** Has the engine child completed (a live install — never taken apart by a host abort)? */
async function engineLive(ctx: HostRunContext): Promise<boolean> {
	const plan = ctx.plan as PlanFile;
	const engineStep = plan.steps.find((step) => step === 'host_engine' || step === 'stack_engine');
	if (engineStep === undefined || recordOf(ctx, engineStep).status === 'pending') return false;
	if (recordOf(ctx, engineStep).status === 'done') return true;
	const verify = hostStep(ctx, engineStep).verify;
	return verify === undefined ? false : (await verify(hostContext(ctx))).ok;
}

/** The steps an abort undoes: started ones with an undo, reverse order — after the engine only, when it is live. */
async function undoableSteps(ctx: HostRunContext): Promise<{ steps: StepId[]; live: boolean }> {
	const plan = ctx.plan as PlanFile;
	const live = await engineLive(ctx);
	const engineAt = plan.steps.findIndex(
		(step) => step === 'host_engine' || step === 'stack_engine',
	);
	const steps = plan.steps
		.filter((_step, index) => !live || index > engineAt)
		.filter(
			(step) => recordOf(ctx, step).status !== 'pending' && hostStep(ctx, step).undo !== undefined,
		)
		.reverse();
	return { steps, live };
}

/** The engine and database steps whose undo resets or drops the database (or its volumes). */
const DATABASE_STEPS: ReadonlySet<StepId> = new Set([
	'host_engine',
	'host_database',
	'stack_engine',
	'stack_database',
]);

/**
 * Does this abort touch the database: the engine child's --abort (it resets
 * the database — `--db-mode existing` included), a role/database this install
 * created, or the stack volumes it created?
 */
function abortTouchesDatabase(ctx: HostRunContext, steps: readonly StepId[]): boolean {
	const created = (ctx.state as InstallState).created.host;
	return steps.some(
		(step) =>
			DATABASE_STEPS.has(step) &&
			(step.endsWith('_engine') ||
				created?.pg_database === true ||
				created?.pg_role === true ||
				(created?.stack?.volumes.length ?? 0) > 0),
	);
}

/**
 * The operator's confirmation, checked BEFORE anything is undone (never
 * supplied on the operator's behalf — the engine child gets the operator's own
 * value, so its gate decides too): a refused abort leaves the install whole,
 * never half taken apart.
 */
function assertConfirmed(ctx: HostRunContext, steps: readonly StepId[]): void {
	const db = String((ctx.plan as PlanFile).answers.db_database ?? '');
	if (!abortTouchesDatabase(ctx, steps) || ctx.request.confirmDatabase === db) return;
	hostRefuse(
		'install.invalid_input',
		`--abort resets and drops the database ${db} this install set up: confirm with --confirm-database ${db} — nothing was undone`,
	);
}

async function abortRun(ctx: HostRunContext): Promise<void> {
	lockRunDir(ctx);
	loadRecord(ctx);
	const { steps, live } = await undoableSteps(ctx);
	assertConfirmed(ctx, steps);
	ctx.keptLive = live;
	startRun(ctx, 'abort');
	saveState(ctx);
	if (live) {
		warnLine(
			ctx,
			'  ⚠ the engine install is complete (a live instance): only the host steps after it are undone — the instance, its user, database and code are kept',
		);
	}
	say(ctx, `→ undoing: ${steps.join(', ') || 'nothing'}`);
	for (const step of steps) {
		ctx.currentStep = step;
		const undone = await (hostStep(ctx, step).undo as NonNullable<HostStepDefinition['undo']>)(
			hostContext(ctx),
		);
		recordOf(ctx, step).status = 'pending';
		saveState(ctx);
		say(ctx, `  [${step}] ${undone}`);
		emit(ctx, step, 'undo', { message: undone });
	}
	ctx.currentStep = null;
	if (live) {
		// The instance stays; what was undone is pending again — a --resume puts it back.
		(ctx.state as InstallState).outcome = 'in_progress';
		saveState(ctx);
		return;
	}
	(ctx.state as InstallState).outcome = 'aborted';
	rmSync(join(ctx.runDir, PLAN_FILE), { force: true });
	rmSync(join(ctx.runDir, STATE_FILE), { force: true });
	ctx.state = null;
}

// ── the run ──────────────────────────────────────────────────────────────────

function closeRun(ctx: HostRunContext, result: NonNullable<RunRecord['result']>): void {
	if (ctx.run === null || ctx.state === null) return;
	ctx.run.result = result;
	ctx.run.finished_at = nowIso();
	saveState(ctx);
}

function releaseLock(ctx: HostRunContext): void {
	if (ctx.runLock) releaseRunLock(ctx.runDir);
	ctx.runLock = false;
	// A completed --abort leaves no record: its emptied run dir goes too.
	if (ctx.request.mode === 'abort' && ctx.state === null) removeEmptyDir(ctx.runDir);
}

/** Remove a directory only when it is empty (absent or not empty: kept). */
function removeEmptyDir(dir: string): void {
	try {
		if (readdirSync(dir).length === 0) rmdirSync(dir);
	} catch {
		// absent or not empty: kept
	}
}

function failedOutcome(ctx: HostRunContext, error: unknown): HostExecutorOutcome {
	const code = isDedaloError(error) ? error.code : 'install.step_failed';
	const message = error instanceof Error ? error.message : String(error);
	recordFailure(ctx, code, message);
	if (ctx.currentStep !== null) emit(ctx, ctx.currentStep, 'failed', { message });
	closeRun(ctx, 'failed');
	const wrote = ctx.state !== null;
	return {
		exitCode: 1,
		result: wrote ? 'failed' : 'refused',
		message,
		failedStep: wrote ? ctx.currentStep : null,
		hint: hostHint(ctx),
		told: ctx.told,
		keptLive: false,
	};
}

async function interrupted(
	ctx: HostRunContext,
	signal: 'SIGINT' | 'SIGTERM',
	restore: () => void,
): Promise<never> {
	await stopChildren(ctx);
	recordFailure(ctx, 'install.step_failed', 'interrupted');
	closeRun(ctx, 'interrupted');
	releaseLock(ctx);
	restore();
	if (ctx.currentStep !== null) emit(ctx, ctx.currentStep, 'interrupted', { message: signal });
	ctx.io.interrupted?.(signal);
	ctx.io.warn(
		`\n✖ install interrupted (${signal})${ctx.currentStep === null ? '' : ` at step [${ctx.currentStep}]`}`,
	);
	for (const line of hostHint(ctx)) ctx.io.warn(line);
	return process.exit(signal === 'SIGINT' ? 130 : 143);
}

/** The machine seams: injected, else the scratch seam, else the real host. */
function machine(
	options: HostExecutorOptions,
	children: Set<Subprocess>,
	redactions: () => string[],
) {
	if (options.runner !== undefined && options.fs !== undefined)
		return { runner: options.runner, fs: options.fs };
	const scratch = readHostRootSeam();
	if (scratch !== null) {
		return {
			runner: scratchRunner(scratch.markerDir),
			fs: hostFs(scratch.root, `${scratch.markerDir}/owners.json`),
		};
	}
	return { runner: systemRunner({ children, redactions }), fs: hostFs('') };
}

function newContext(
	request: HostExecutorRequest,
	io: RunIo,
	options: HostExecutorOptions,
): HostRunContext {
	const source = options.source ?? sourceTreeRoot();
	const children = new Set<Subprocess>();
	const redactions = Object.values(request.secrets).filter(
		(value): value is string => typeof value === 'string',
	);
	const seams = machine(options, children, () => redactions);
	const answers = request.planFile?.answers ?? request.givenAnswers ?? {};
	const runDir = seams.fs.real(hostRunDirOf(answers, source));
	const ctx: HostRunContext = {
		io,
		children,
		plan: null,
		state: null,
		fault: null,
		redactions,
		currentStep: null,
		ranAny: false,
		unredacted: false,
		request,
		runner: seams.runner,
		fs: seams.fs,
		source,
		sleep: options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
		now: options.now ?? (() => Date.now()),
		runDir,
		table: hostTable(() => {
			const { facts: _facts, row: _row, paths: _paths, ...base } = planContext(ctx);
			return { ...base, bunPin: bunPinOf(ctx.source) };
		}),
		told: [],
		run: null,
		secrets: { ...request.secrets },
		runLock: false,
		keptLive: false,
		stepOf: (step) => hostStep(ctx, step),
		verifyOwn: async (step) => {
			const verify = hostStep(ctx, step).verify;
			return verify === undefined ? null : verify(hostContext(ctx));
		},
		perform: (step) => performHostStep(ctx, step),
		intent: (step) => hostStep(ctx, step).intent?.(hostContext(ctx)),
		created: (step) => hostStep(ctx, step).created?.(hostContext(ctx)),
		save: () => saveState(ctx),
	};
	return ctx;
}

/** Does the record at `dir` say complete? */
function recordComplete(dir: string): boolean {
	return existsSync(join(dir, STATE_FILE)) && readStateFile(dir)?.outcome === 'complete';
}

async function runMode(
	ctx: HostRunContext,
	options: HostExecutorOptions,
): Promise<HostExecutorOutcome> {
	ctx.fault = readInstallFault();
	if (ctx.request.mode === 'abort') {
		await abortRun(ctx);
		return {
			exitCode: 0,
			result: 'aborted',
			message: null,
			failedStep: null,
			hint: [],
			told: ctx.told,
			keptLive: ctx.keptLive,
		};
	}
	const wasComplete = ctx.request.mode === 'resume' && recordComplete(ctx.runDir);
	await (ctx.request.mode === 'fresh'
		? freshRun(ctx, options.skipPrivilegeCheck === true)
		: resumeRun(ctx));
	ctx.currentStep = null;
	(ctx.state as InstallState).outcome = 'complete';
	closeRun(ctx, 'complete');
	const result = wasComplete && !ctx.ranAny ? 'already_complete' : 'complete';
	return {
		exitCode: 0,
		result,
		message: null,
		failedStep: null,
		hint: [],
		told: ctx.told,
		keptLive: false,
	};
}

/**
 * Run the host steps (fresh), finish them (resume) or undo them (abort). Never
 * throws for a refusal or a failed step; SIGINT/SIGTERM stop the children,
 * record the step failed and exit 130/143 from here.
 */
export async function executeHostInstall(
	request: HostExecutorRequest,
	io: RunIo,
	options: HostExecutorOptions = {},
): Promise<HostExecutorOutcome> {
	const ctx = newContext(request, io, options);
	const restore = redactConsole(ctx);
	const sigint = () => void interrupted(ctx, 'SIGINT', restore);
	const sigterm = () => void interrupted(ctx, 'SIGTERM', restore);
	process.on('SIGINT', sigint);
	process.on('SIGTERM', sigterm);
	io.signals?.(true);
	try {
		return await runMode(ctx, options);
	} catch (error) {
		return failedOutcome(ctx, error);
	} finally {
		process.off('SIGINT', sigint);
		process.off('SIGTERM', sigterm);
		io.signals?.(false);
		releaseLock(ctx);
		restore();
	}
}

/** The secrets one step consumes that the plan was given (the root password always). */
function stepNeeds(plan: PlanFile, definition: HostStepDefinition | undefined): SecretKey[] {
	return (definition?.needs ?? []).filter(
		(key) => key === 'root_password' || plan.secrets_supplied[key],
	);
}

/** The secrets a host run must be given: those of every not-done step that needs one. */
export function hostSecretsNeeded(plan: PlanFile, state: InstallState | null): SecretKey[] {
	// Only `needs` is read: the digest context is never asked for.
	const table = hostTable(() => hostRefuse('install.step_failed', 'no plan context here'));
	const pending = plan.steps.filter((step) => state?.steps[step]?.status !== 'done');
	return [...new Set(pending.flatMap((step) => stepNeeds(plan, table[step as HostStepId])))];
}
