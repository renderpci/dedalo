/**
 * THE TERMINAL INSTALLER'S EXECUTOR (phase 1, 2026-10-11) — runs a validated
 * install plan as a RESUMABLE sequence: the plan file is written once, the state
 * file is checkpointed around every step, and a run that dies anywhere is
 * finished by `scripts/install.ts --resume` (or undone by `--abort
 * --confirm-database <db>`).
 *
 * THREE MODES.
 *  - fresh: refuse on an existing install record; prove the target database
 *    EMPTY (zero user objects — db_restore.ts inspectTargetDatabase) and
 *    STAMPABLE (the install role owns it) under the server-side install lock;
 *    record the preflight; write the plan + state; run every step.
 *  - resume: same plan (hash, engine version, answers); re-ask only the secrets
 *    a NOT-done step still consumes; then the step loop below.
 *  - abort: undo, in reverse plan order, only what the state says the install
 *    CREATED. Never a sealed install; never without `--confirm-database` once
 *    the seed started; never a database that does not carry THIS install's
 *    stamp (db_restore.ts header) unless it is empty; never DROP DATABASE.
 *    Always under the server-side install lock when the database is reachable.
 *
 * THE STEP LOOP (resume safety rests on it). For each plan step:
 *  - recorded `done`: a step with a verify must still verify (else DRIFT — the
 *    install was changed outside the installer — refused); one without a verify
 *    (a probe, an idempotent upsert) is skipped;
 *  - recorded `running`/`failed` (a crash or a refusal): a verify that passes
 *    means the work landed before the checkpoint — marked done, skipped
 *    (except a `neverAdopt` step — the seed — which is always re-run);
 *    otherwise the step runs again. No undo is ever needed to resume: the seed
 *    restore is ONE transaction (rolled back by a kill) that stamps the
 *    database with the install id, the seed step re-decides from that stamp on
 *    every run (completes its own seed, restores only into an EMPTY database),
 *    and every other step converges when re-run;
 *  - pending: run, accept, verify, checkpoint.
 *
 * NOTHING SECRET IS WRITTEN OR PRINTED: run files are built from plain answers
 * (run_files.ts), every message is redacted, and console output is redacted
 * for the run's duration (engine modules print directly). The one exception is
 * the generated DEDALO_SALT_STRING, shown ONCE in the final summary (through
 * ExecutorIo.showOnce when the front end has a terminal for it).
 *
 * A step's `details` (steps.ts — one row per directory, one per tool) are
 * printed after its run, through the same redacted `say`.
 *
 * Imported only AFTER the CLI has seeded the environment config.ts freezes
 * (scripts/install.ts). The step table and the machine-facing host are
 * injectable: test/unit/install_executor_native.test.ts drives a fake table in
 * a temp private dir. Gates: that one, install_resume_drill,
 * install_run_files_secret_tripwire.
 */

import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Subprocess } from 'bun';
import { processEnvValue, readEnv } from '../../config/env.ts';
import { isDedaloError } from '../errors/index.ts';
import { getServerState, statePath } from '../resolve/server_state.ts';
import { DEDALO_VERSION } from '../update/version.ts';
import type { InstallLockHandle, TargetDatabaseState } from './db_restore.ts';
import {
	INSTALL_STEP_IDS,
	type InstallAnswers,
	type InstallPlan,
	type InstallStepId,
} from './install_plan.ts';
import type { OntologyCatalog } from './ontology_choice.ts';
import { installPrivateDir } from './paths.ts';
import { trackPsqlChildren } from './pg_exec.ts';
import { refuseInstall } from './refuse.ts';
import type { RunIo, StepPhase } from './run_events.ts';
import {
	acquireRunLock,
	answerDifferences,
	buildPlanFile,
	canonicalJson,
	ensureRunDir,
	envBackups,
	type InstallPreflight,
	type InstallState,
	installEnvPath,
	installRunDir,
	newInstallState,
	ontologyDecisions,
	PLAN_FILE,
	type PlanFile,
	pendingStep,
	planHash,
	type RunMode,
	type RunRecord,
	readInstallEnv,
	readPlanFile,
	readStateFile,
	redactSecrets,
	releaseRunLock,
	runRecord,
	type SecretKey,
	type Secrets,
	STATE_FILE,
	type StepRecord,
	sha256Of,
	writePlanFile,
	writeStateFile,
} from './run_files.ts';
import {
	INSTALL_STEPS,
	type InstallStepDefinition,
	type InstallStepInputs,
	installCreatedBackups,
	secretsNeeded,
	type VerifyContext,
	type VerifyResult,
} from './steps.ts';

// secretsNeeded lives in the config-free step table (scripts/install.ts asks for
// a resume's missing secrets BEFORE it seeds the environment config freezes).
export { secretsNeeded };

/**
 * What the run writes to: log/warn lines, the one-time display of the salt,
 * and (optional, the full-screen front end) the step events and the signal
 * arming — run_events.ts RunIo.
 */
export type ExecutorIo = RunIo;

/** What the executor needs from the machine — injectable so the loop is testable without one. */
export interface ExecutorHost {
	initTest(): Promise<{ ok: boolean; errors: string[] }>;
	inspectDatabase(): Promise<TargetDatabaseState>;
	/** The server-side one-install-per-database lock; null = another session holds it. */
	holdDatabaseLock(): Promise<InstallLockHandle | null>;
	/** The directories check_directories manages. */
	directoryPaths(): Promise<string[]>;
	installStatus(): string | null;
	verifyRootLogin(password: string): Promise<boolean>;
	/** Why the server state file is not under the install's private dir, or null. */
	statePathProblem(): string | null;
}

export interface ExecutorRequest {
	mode: RunMode;
	/** --execute given (recorded on the run). */
	execute?: boolean;
	/** fresh: built by the caller from the validated plan; resume/abort: read from disk here. */
	planFile?: PlanFile;
	/** fresh, or a resume that re-resolved the ontology catalog (its request carries the files). */
	plan?: InstallPlan;
	/** resume: the answers the command line gave (normalized), compared with the saved plan. */
	givenAnswers?: InstallAnswers;
	/** resume: the answer keys the operator actually supplied (only those are compared). */
	givenKeys?: readonly string[];
	secrets: Secrets;
	ontologyCatalog?: OntologyCatalog;
	/** abort: must equal the plan's db_database once the seed started. */
	confirmDatabase?: string;
}

export interface ExecutorOutcome {
	exitCode: 0 | 1 | 130 | 143;
	result: 'complete' | 'already_complete' | 'aborted' | 'failed' | 'refused';
	/** The refusal/failure sentence (redacted). */
	message: string | null;
	failedStep: InstallStepId | null;
	/** The resume/abort hint — empty when no state file exists. */
	hint: string[];
}

export interface ExecutorOptions {
	table?: { readonly [K in InstallStepId]: InstallStepDefinition };
	host?: ExecutorHost;
}

// ── the crash seam ───────────────────────────────────────────────────────────

/** DEDALO_INSTALL_FAULT=<step>:<before|after> — the resume drill's SIGKILL point. */
export interface InstallFault {
	step: InstallStepId;
	when: 'before' | 'after';
}

/** Is `value` a `<step id>:before|after` seam value? */
function faultShape(step: string | undefined, when: string | undefined): boolean {
	const knownStep = (INSTALL_STEP_IDS as readonly string[]).includes(step ?? '');
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
		refuseInstall(
			'install.invalid_input',
			`DEDALO_INSTALL_FAULT must be <step id>:before|after (got '${raw}')`,
		);
	}
	return { step: step as InstallStepId, when: when as 'before' | 'after' };
}

// ── secrets and the hint ─────────────────────────────────────────────────────

/** Is the step recorded done (in the state, when there is one)? */
function recordedDone(state: InstallState | null, step: InstallStepId): boolean {
	return state?.steps[step]?.status === 'done';
}

const SECRET_SOURCE: Readonly<Record<SecretKey, string>> = Object.freeze({
	db_password:
		'database password (DEDALO_INSTALL_DB_PASSWORD, --secrets-stdin, or typed at the prompt)',
	mysql_password:
		'diffusion password (DEDALO_INSTALL_MYSQL_PASSWORD, --secrets-stdin, or typed at the prompt)',
	smtp_pass:
		'SMTP password (DEDALO_INSTALL_SMTP_PASSWORD, --secrets-stdin, or typed at the prompt)',
	root_password:
		'root password (DEDALO_INSTALL_ROOT_PASSWORD, --secrets-stdin, or typed at the prompt)',
});

/** The command prefix that reaches the same private dir. */
function commandPrefix(): string {
	const dir = processEnvValue('DEDALO_INSTALL_PRIVATE_DIR') ?? '';
	return `${dir === '' ? '' : `DEDALO_INSTALL_PRIVATE_DIR=${dir} `}bun run scripts/install.ts`;
}

/** The lines that tell the operator how to resume or undo (the failure hint). */
export function resumeHint(
	plan: PlanFile,
	_state: InstallState,
	needed: readonly SecretKey[],
): string[] {
	const secretsLine =
		needed.length === 0
			? []
			: [`    secrets needed again: ${needed.map((key) => SECRET_SOURCE[key]).join('; ')}`];
	return [
		`  Progress saved: ${join(installRunDir(), STATE_FILE)} (plan: ${PLAN_FILE})`,
		`  Fix the cause, then resume:  ${commandPrefix()} --resume`,
		...secretsLine,
		`  Or undo this install:        ${commandPrefix()} --abort --confirm-database ${String(plan.answers.db_database ?? '<db>')}`,
	];
}

// ── the real host ────────────────────────────────────────────────────────────

/**
 * B14: an operator who sets only DEDALO_INSTALL_PRIVATE_DIR would write the
 * .env to one directory and ts_state.json to another — possibly a live one.
 */
function statePathOutsidePrivateDir(): string | null {
	if (readEnv('DEDALO_TS_STATE_PATH') !== undefined) return null;
	if (resolve(dirname(statePath())) === resolve(installPrivateDir())) return null;
	return `the server state file (${statePath()}) is not in the install's private dir (${installPrivateDir()}) — set DEDALO_PRIVATE_DIR (or DEDALO_TS_STATE_PATH) so both point at the same place`;
}

/** The machine as the CLI sees it (config is frozen to the install's database by now). */
export function engineHost(appName: string): ExecutorHost {
	return {
		initTest: async () => {
			const { runInitTest } = await import('./init_test.ts');
			const report = runInitTest();
			return { ok: report.result, errors: report.errors };
		},
		inspectDatabase: async () => {
			const { inspectTargetDatabase } = await import('./db_restore.ts');
			const { connFromConfig } = await import('./pg_exec.ts');
			return inspectTargetDatabase(connFromConfig(), appName);
		},
		holdDatabaseLock: async () => {
			const { holdInstallLock } = await import('./db_restore.ts');
			const { connFromConfig } = await import('./pg_exec.ts');
			return holdInstallLock(connFromConfig(), appName);
		},
		directoryPaths: async () => (await import('./directories.ts')).installDirectoryPaths(),
		installStatus: () => getServerState().install_status ?? null,
		verifyRootLogin: async (password) => {
			const { login } = await import('../security/auth.ts');
			return (await login('root', password, 'local')).ok === true;
		},
		statePathProblem: statePathOutsidePrivateDir,
	};
}

// ── the run ──────────────────────────────────────────────────────────────────

/** One executor run's mutable context (never module state — one per call). */
interface RunContext {
	readonly io: ExecutorIo;
	readonly table: { readonly [K in InstallStepId]: InstallStepDefinition };
	readonly host: ExecutorHost;
	readonly request: ExecutorRequest;
	readonly children: Set<Subprocess>;
	fault: InstallFault | null;
	plan: PlanFile | null;
	state: InstallState | null;
	run: RunRecord | null;
	secrets: Secrets;
	redactions: string[];
	currentStep: InstallStepId | null;
	dbLock: InstallLockHandle | null;
	runLock: boolean;
	ranAny: boolean;
	/** True only while the ONE unredacted line (the salt) is printed. */
	unredacted: boolean;
}

type RefusalCode = 'install.invalid_input' | 'install.state_conflict' | 'install.step_failed';

/** Throw `code` with `detail` when `condition` holds. */
function refuseIf(condition: boolean, code: RefusalCode, detail: () => string): void {
	if (condition) refuseInstall(code, detail());
}

function redact(ctx: RunContext, text: string): string {
	return redactSecrets(text, ctx.redactions);
}

function say(ctx: RunContext, line: string): void {
	ctx.io.log(redact(ctx, line));
}

function warnLine(ctx: RunContext, line: string): void {
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
function emit(
	ctx: RunContext,
	step: InstallStepId,
	phase: StepPhase,
	extra: { message?: string | null; warnings?: readonly string[] } = {},
): void {
	if (ctx.io.step === undefined) return;
	const record = ctx.state?.steps[step];
	ctx.io.step({
		step,
		label: ctx.plan === null ? step : ctx.table[step].label(ctx.plan),
		phase,
		elapsedMs: TIMED_PHASES.has(phase) ? elapsedOf(record) : null,
		...(typeof extra.message === 'string' ? { message: redact(ctx, extra.message) } : {}),
		...(extra.warnings === undefined
			? {}
			: { warnings: extra.warnings.map((warning) => redact(ctx, warning)) }),
	});
}

function saveState(ctx: RunContext): void {
	if (ctx.state !== null) writeStateFile(ctx.state);
}

function nowIso(): string {
	return new Date().toISOString();
}

/** The step's record (created pending when the state predates it). */
function recordOf(ctx: RunContext, step: InstallStepId): StepRecord {
	const state = ctx.state as InstallState;
	state.steps[step] ??= pendingStep();
	return state.steps[step] as StepRecord;
}

function verifyContext(ctx: RunContext): VerifyContext {
	return { plan: ctx.plan as PlanFile, state: ctx.state as InstallState, secrets: ctx.secrets };
}

/** The consumer whose verdict may stand in for `step`'s, when it has run; else null. */
function activeConsumer(ctx: RunContext, step: InstallStepId): InstallStepId | null {
	const consumer = ctx.table[step].consumedBy;
	if (consumer === undefined || !ctx.plan?.steps.includes(consumer)) return null;
	return recordOf(ctx, consumer).status === 'pending' ? null : consumer;
}

/**
 * The step's verdict: its own verify; failing that, for a step another one
 * CONSUMES (staged files the import deletes), the consumer's — once the consumer
 * has itself run. Null = the step has no verify.
 */
async function verifyStep(ctx: RunContext, step: InstallStepId): Promise<VerifyResult | null> {
	const verify = ctx.table[step].verify;
	if (verify === undefined) return null;
	const own = await verify(verifyContext(ctx));
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

/** The inputs every executor step runs with. */
function stepInputs(ctx: RunContext): InstallStepInputs {
	const plan = ctx.plan as PlanFile;
	const { secrets } = ctx;
	return {
		posted: {
			...plan.answers,
			db_password: secrets.db_password ?? '',
			mysql_password: secrets.mysql_password ?? '',
			smtp_pass: secrets.smtp_pass ?? '',
		},
		createDirectories: true,
		ontologyCatalog: ctx.request.ontologyCatalog,
		ontologyRequest: ctx.request.plan?.ontologyRequest ?? undefined,
		hierarchies: plan.hierarchies,
		actorUserId: -1,
		rootPassword: secrets.root_password,
		installStatus: 'terminal_installing',
		installId: (ctx.state as InstallState).install_id,
	};
}

/** The intent each step writes BEFORE its work (B13): what --abort must clean even without a checkpoint. */
const INTENT: Partial<Record<InstallStepId, (created: InstallState['created']) => void>> = {
	install_db_from_default_file: (created) => {
		created.seed_started = true;
	},
	stage_ontologies: (created) => {
		created.staging_dir = true;
	},
	persist_config: (created) => {
		created.env_file = true;
	},
};

/** The pre-install .env's backup among `fresh` (its content hash is the preflight's). */
function originalBackup(fresh: readonly string[], sha: string | null): string | null {
	const dir = installPrivateDir();
	return fresh.find((name) => sha256Of(join(dir, name)) === sha) ?? null;
}

/**
 * persist_config's creations: the backups (every `.env.bak.*` that appeared
 * since the PREFLIGHT's baseline — never minus a per-attempt list, so an
 * operator's own older backup is never recorded, and one written by an attempt
 * that died before its checkpoint is), the original's backup, sample.env, the salt.
 */
function recordPersisted(ctx: RunContext): void {
	const state = ctx.state as InstallState;
	const { created, preflight } = state;
	const fresh = installCreatedBackups(state);
	created.env_backups = fresh;
	if (preflight.env_existed && created.env_backup === null) {
		created.env_backup = originalBackup(fresh, preflight.env_sha256);
	}
	created.sample_env =
		!preflight.sample_env_existed && existsSync(join(installPrivateDir(), 'sample.env'));
	rememberSalt(ctx);
}

/** The salt the .env now holds joins the redaction list (it is printed once, at the end only). */
function rememberSalt(ctx: RunContext): void {
	const salt = readInstallEnv()?.DEDALO_SALT_STRING ?? '';
	if (salt !== '' && !ctx.redactions.includes(salt)) ctx.redactions.push(salt);
}

/** What the step created, recorded with its checkpoint. */
const CREATED: Partial<Record<InstallStepId, (ctx: RunContext) => void>> = {
	persist_config: recordPersisted,
	check_directories: (ctx) => {
		const { created, preflight } = ctx.state as InstallState;
		created.directories = preflight.directories_missing.filter((path) => existsSync(path));
	},
	install_db_from_default_file: (ctx) => {
		(ctx.state as InstallState).created.seed_restored = true;
	},
};

/** SIGKILL this process at the seam point (the resume drill). */
function maybeFault(ctx: RunContext, step: InstallStepId, when: 'before' | 'after'): void {
	if (ctx.fault?.step === step && ctx.fault.when === when) process.kill(process.pid, 'SIGKILL');
}

/** Mark the step running (attempts, intent) and checkpoint. */
function markRunning(ctx: RunContext, step: InstallStepId): void {
	const record = recordOf(ctx, step);
	record.status = 'running';
	record.attempts += 1;
	record.started_at = nowIso();
	record.finished_at = null;
	record.error = null;
	INTENT[step]?.((ctx.state as InstallState).created);
	saveState(ctx);
}

/** The post-run verify: a step that reported success must also VERIFY. */
async function verifyAfterRun(ctx: RunContext, step: InstallStepId): Promise<void> {
	const verify = ctx.table[step].verify;
	if (verify === undefined) return;
	const verdict = await verify(verifyContext(ctx));
	recordVerdict(recordOf(ctx, step), verdict);
	refuseIf(
		!verdict.ok,
		'install.step_failed',
		() => `step reported success but its outcome does not verify: ${verdict.detail}`,
	);
}

/** Mark the step done with its redacted message + warnings, checkpoint, print. */
function markDone(ctx: RunContext, step: InstallStepId, msg: unknown, warnings: string[]): void {
	const record = recordOf(ctx, step);
	record.status = 'done';
	record.finished_at = nowIso();
	record.message = typeof msg === 'string' && msg !== '' ? redact(ctx, msg) : null;
	record.warnings = warnings.map((warning) => redact(ctx, warning));
	saveState(ctx);
	if (record.message !== null) say(ctx, `  ${record.message}`);
	for (const warning of record.warnings) warnLine(ctx, `  ⚠ ${warning}`);
}

/** Run ONE step (it is not done): running → run → accept → verify → done. */
async function runStep(ctx: RunContext, step: InstallStepId): Promise<void> {
	const definition = ctx.table[step];
	const inputs = stepInputs(ctx);
	markRunning(ctx, step);
	maybeFault(ctx, step, 'before');
	ctx.ranAny = true;
	const outcome = await trackPsqlChildren(ctx.children, () => definition.run(inputs));
	// The per-item rows first: a refused directory check names each directory.
	for (const line of definition.details?.(outcome) ?? []) say(ctx, `    ${line}`);
	const refusal = definition.accept?.(outcome, inputs) ?? null;
	refuseIf(refusal !== null, 'install.step_failed', () => refusal as string);
	CREATED[step]?.(ctx);
	await verifyAfterRun(ctx, step);
	markDone(ctx, step, outcome.msg, definition.warnings?.(outcome) ?? []);
	const record = recordOf(ctx, step);
	emit(ctx, step, 'done', { message: record.message, warnings: record.warnings });
	maybeFault(ctx, step, 'after');
}

/** A step recorded done: it must still verify (when it has a verify), else drift. */
async function confirmDone(ctx: RunContext, step: InstallStepId): Promise<void> {
	const verdict = await verifyStep(ctx, step);
	if (verdict !== null) {
		recordVerdict(recordOf(ctx, step), verdict);
		refuseIf(verdict.conflict === true, 'install.state_conflict', () => verdict.detail);
		refuseIf(
			!verdict.ok,
			'install.state_conflict',
			() =>
				`step ${step} was recorded done but its outcome is missing (${verdict.detail}) — the install was changed outside the installer; --abort and start again`,
		);
	}
	say(ctx, '  done in an earlier run — skipped');
	emit(ctx, step, 'skipped');
}

/** A step left running/failed whose work LANDED before its checkpoint: adopt it. Answers whether it did. */
async function adoptLanded(ctx: RunContext, step: InstallStepId): Promise<boolean> {
	if (ctx.table[step].neverAdopt === true) return false;
	const verdict = await verifyStep(ctx, step);
	refuseIf(verdict?.conflict === true, 'install.state_conflict', () => verdict?.detail ?? '');
	if (verdict?.ok !== true) return false;
	const record = recordOf(ctx, step);
	recordVerdict(record, verdict);
	CREATED[step]?.(ctx);
	record.status = 'done';
	record.finished_at = nowIso();
	record.error = null;
	saveState(ctx);
	say(ctx, `  verified (completed in an earlier run): ${verdict.detail}`);
	emit(ctx, step, 'adopted', { message: verdict.detail });
	return true;
}

/** One step through the loop's rules (the header): skip, adopt, refuse as drift, or run. */
async function advanceStep(ctx: RunContext, step: InstallStepId): Promise<void> {
	const status = recordOf(ctx, step).status;
	say(ctx, `→ [${step}] ${ctx.table[step].label(ctx.plan as PlanFile)}`);
	ctx.currentStep = step;
	emit(ctx, step, 'start');
	if (status === 'done') return confirmDone(ctx, step);
	if (status !== 'pending' && (await adoptLanded(ctx, step))) return;
	await runStep(ctx, step);
}

/** Mark the current step failed with a redacted error (the checkpoint a resume reads). */
function recordFailure(ctx: RunContext, code: string, message: string): void {
	if (ctx.state === null || ctx.currentStep === null) return;
	const record = recordOf(ctx, ctx.currentStep);
	if (record.status !== 'running') return;
	record.status = 'failed';
	record.finished_at = nowIso();
	record.error = { code, message: redact(ctx, message) };
}

// ── the modes ────────────────────────────────────────────────────────────────

/** The preflight a fresh run records (env, status, directories, extensions). */
async function freshPreflight(
	ctx: RunContext,
	database: TargetDatabaseState,
): Promise<InstallPreflight> {
	const envPath = installEnvPath();
	const salt = readInstallEnv(envPath)?.DEDALO_SALT_STRING ?? '';
	return {
		preexisting_extensions: [...database.extensions],
		env_backups_before: envBackups(),
		env_existed: existsSync(envPath),
		env_sha256: sha256Of(envPath),
		env_had_salt: salt !== '',
		sample_env_existed: existsSync(join(installPrivateDir(), 'sample.env')),
		install_status_before: ctx.host.installStatus(),
		directories_missing: missingWithAncestors(await ctx.host.directoryPaths()),
	};
}

/**
 * The managed directories that do not exist yet, WITH every missing ancestor a
 * recursive mkdir will also create (`backups` for `backups/db`) — so --abort
 * can remove exactly what the install made, and nothing that predates it.
 */
function missingWithAncestors(paths: readonly string[]): string[] {
	const missing = new Set<string>();
	for (const path of paths) {
		for (let current = resolve(path); !existsSync(current); current = dirname(current)) {
			missing.add(current);
		}
	}
	return [...missing];
}

/** The database must exist, be EMPTY for an install, and have no seed restore on it. */
function assertFreshTarget(db: string, target: TargetDatabaseState): void {
	refuseIf(!target.exists, 'install.state_conflict', () => `database '${db}' must exist first`);
	refuseIf(
		target.seedRestoreRunning !== null,
		'install.state_conflict',
		() => `a seed restore into '${db}' is still running (backend pid ${target.seedRestoreRunning})`,
	);
	refuseIf(
		!target.emptyForInstall,
		'install.state_conflict',
		() =>
			`database '${db}' is not empty (${target.userObjectCount} objects, e.g. ${target.userObjects.slice(0, 5).join(', ')}) — the installer only installs into an empty database`,
	);
	// The seed stamps the database (COMMENT ON DATABASE — owner only): what lets a
	// resume and --abort prove the database is this install's. Refused HERE,
	// before any write, not by a rolled-back restore later.
	refuseIf(
		!target.canStamp,
		'install.state_conflict',
		() =>
			`the install role does not own database '${db}' — create it with OWNER set to the install user (CREATE DATABASE ${db} OWNER <db user>)`,
	);
}

/** Take the server-side lock on the target database, or refuse. */
async function lockDatabase(ctx: RunContext, db: string): Promise<void> {
	ctx.dbLock = await ctx.host.holdDatabaseLock();
	refuseIf(
		ctx.dbLock === null,
		'install.state_conflict',
		() => `another install is running against database '${db}'`,
	);
}

/** Take the run-dir lock, or refuse. */
function lockRunDir(ctx: RunContext): void {
	const lock = acquireRunLock(ctx.request.mode, (line) => warnLine(ctx, `  ⚠ ${line}`));
	if (!lock.ok) {
		refuseInstall(
			'install.state_conflict',
			`another install is running (pid ${lock.holder.pid} on ${lock.holder.host}, since ${lock.holder.started_at})`,
		);
	}
	ctx.runLock = true;
}

/** A fresh run never starts over an existing install record. */
function assertNoRecord(): void {
	const existing = readStateFile();
	if (existing === null) return;
	const db = String(readPlanFile()?.answers.db_database ?? '<db>');
	refuseInstall(
		'install.state_conflict',
		`an install record exists at ${join(installRunDir(), STATE_FILE)} (outcome: ${existing.outcome}) — resume it with --resume, undo it with --abort --confirm-database ${db}, or remove the install directory if this private directory is being reused deliberately`,
	);
}

/** The machine-side checks before the database is even looked at. */
async function assertMachineReady(ctx: RunContext): Promise<void> {
	const problem = ctx.host.statePathProblem();
	refuseIf(problem !== null, 'install.invalid_input', () => problem as string);
	refuseIf(
		ctx.host.installStatus() === 'sealed',
		'install.state_conflict',
		() =>
			'this private directory belongs to a SEALED installation — a fresh install never overwrites a live one',
	);
	say(ctx, '→ pre-flight checks');
	const init = await ctx.host.initTest();
	refuseIf(!init.ok, 'install.step_failed', () => `pre-flight: ${init.errors.join('; ')}`);
}

/** Reach the target, lock it, and prove it empty UNDER the lock (two installs cannot both see it empty). */
async function claimEmptyDatabase(ctx: RunContext, db: string): Promise<TargetDatabaseState> {
	const reachable = await ctx.host.inspectDatabase();
	refuseIf(
		!reachable.reachable,
		'install.step_failed',
		() => `database server not reachable for '${db}'`,
	);
	refuseIf(!reachable.exists, 'install.state_conflict', () => `database '${db}' must exist first`);
	await lockDatabase(ctx, db);
	const target = await ctx.host.inspectDatabase();
	assertFreshTarget(db, target);
	return target;
}

/** Every refusal of a fresh run happens here — before anything is written. */
async function freshPreconditions(ctx: RunContext, plan: PlanFile): Promise<InstallPreflight> {
	lockRunDir(ctx);
	assertNoRecord();
	await assertMachineReady(ctx);
	const target = await claimEmptyDatabase(ctx, String(plan.answers.db_database ?? ''));
	return freshPreflight(ctx, target);
}

/** A refusal before any write leaves nothing behind (lock released, a dir this run made removed). */
function undoFreshRefusal(ctx: RunContext, createdDir: boolean): void {
	if (ctx.state !== null) return;
	if (ctx.runLock) releaseRunLock();
	ctx.runLock = false;
	if (createdDir) removeRunDirIfEmpty();
}

/** FRESH: preflight everything, write nothing until it all passes, then run. */
async function freshRun(ctx: RunContext): Promise<void> {
	const plan = ctx.request.planFile as PlanFile;
	const createdDir = ensureRunDir();
	try {
		const preflight = await freshPreconditions(ctx, plan);
		// Only now is anything written.
		ctx.plan = plan;
		ctx.state = newInstallState(plan, preflight);
		startRun(ctx, 'fresh');
		writePlanFile(plan);
		saveState(ctx);
	} catch (error) {
		undoFreshRefusal(ctx, createdDir);
		throw error;
	}
	for (const step of plan.steps) await advanceStep(ctx, step);
}

/** Append this process's run record. */
function startRun(ctx: RunContext, mode: RunMode): void {
	ctx.run = runRecord(mode, ctx.request.execute === true);
	(ctx.state as InstallState).runs.push(ctx.run);
}

/** Read + check the saved plan and state (resume/abort). */
function loadRecord(ctx: RunContext): { plan: PlanFile; state: InstallState } {
	const plan = readPlanFile();
	const state = readStateFile();
	if (plan === null || state === null) {
		return refuseInstall(
			'install.state_conflict',
			`no install record at ${installRunDir()} — nothing to ${ctx.request.mode}`,
		);
	}
	refuseIf(
		planHash(plan) !== plan.plan_hash || state.plan_hash !== plan.plan_hash,
		'install.state_conflict',
		() => `the install record at ${installRunDir()} was modified (plan hash mismatch)`,
	);
	ctx.plan = plan;
	ctx.state = state;
	return { plan, state };
}

/** A resume's answers must be the saved plan's (resume takes the saved answers). */
function assertSameAnswers(ctx: RunContext, plan: PlanFile): void {
	const given = ctx.request.givenAnswers;
	const differing =
		given === undefined ? [] : answerDifferences(plan.answers, given, ctx.request.givenKeys);
	refuseIf(
		differing.length > 0,
		'install.state_conflict',
		() =>
			`answers differ from the saved plan: ${differing.join(', ')} — resume takes the saved answers; drop the flags, or --abort and start again`,
	);
}

/** A resume that re-resolved the ontology source must have reached the same decisions. */
function assertSameOntologyDecisions(ctx: RunContext, plan: PlanFile): void {
	const replanned = ctx.request.plan;
	if (replanned === undefined) return;
	const fresh = ontologyDecisions(buildPlanFile(replanned, {}));
	refuseIf(
		canonicalJson(fresh) !== canonicalJson(ontologyDecisions(plan)),
		'install.state_conflict',
		() => 'the ontology source changed since the plan was written — --abort and start again',
	);
}

/** No other installer session may be working on the target (an orphan psql of a killed run). */
async function assertNoInstallerSessions(ctx: RunContext, db: string): Promise<void> {
	const target = await ctx.host.inspectDatabase();
	refuseIf(
		!target.reachable,
		'install.step_failed',
		() => `database server not reachable for '${db}'`,
	);
	refuseIf(
		target.seedRestoreRunning !== null,
		'install.state_conflict',
		() => `a seed restore into '${db}' is still running (backend pid ${target.seedRestoreRunning})`,
	);
	refuseIf(
		target.installSessions.length > 0,
		'install.state_conflict',
		() =>
			`another installer session is still active on '${db}' (backend pid ${target.installSessions.join(', ')}) — wait for it to end`,
	);
}

/** The secrets a resume still needs and was not given. */
function assertSecretsGiven(ctx: RunContext, plan: PlanFile, state: InstallState): void {
	const missing = secretsNeeded(plan, state).filter((key) => (ctx.secrets[key] ?? '') === '');
	refuseIf(
		missing.includes('root_password'),
		'install.invalid_input',
		() =>
			'--resume needs the root password (set_root_pw has not run): DEDALO_INSTALL_ROOT_PASSWORD or --secrets-stdin',
	);
	refuseIf(
		missing.length > 0,
		'install.invalid_input',
		() => `--resume needs: ${missing.map((key) => SECRET_SOURCE[key]).join('; ')}`,
	);
}

/** RESUME: same plan, same answers, the missing secrets re-asked, then the loop. */
async function resumeRun(ctx: RunContext): Promise<void> {
	lockRunDir(ctx);
	const { plan, state } = loadRecord(ctx);
	refuseIf(
		plan.engine_version !== DEDALO_VERSION,
		'install.state_conflict',
		() => `plan was written by engine ${plan.engine_version}; this is ${DEDALO_VERSION}`,
	);
	assertSameAnswers(ctx, plan);
	assertSameOntologyDecisions(ctx, plan);
	assertSecretsGiven(ctx, plan, state);
	const db = String(plan.answers.db_database ?? '');
	await lockDatabase(ctx, db);
	await assertNoInstallerSessions(ctx, db);
	startRun(ctx, 'resume');
	saveState(ctx);
	for (const step of plan.steps) await advanceStep(ctx, step);
}

/** Has this install touched the database (the seed started)? */
function touchedDatabase(state: InstallState): boolean {
	return state.created.seed_started || state.created.seed_restored;
}

/**
 * An abort that never reached the seed still takes the server-side lock when
 * the database answers (a live run of the same install on another host holds
 * it); an unreachable server cannot hold it, so the abort proceeds, warned.
 */
async function lockUntouchedDatabase(ctx: RunContext, db: string): Promise<void> {
	if (!(await ctx.host.inspectDatabase()).reachable) {
		warnLine(
			ctx,
			`  ⚠ database '${db}' not reachable — aborting without the server-side install lock`,
		);
		return;
	}
	await lockDatabase(ctx, db);
}

/** The checks before any undo: never sealed; the database reset confirmed and safe. */
async function assertAbortable(
	ctx: RunContext,
	plan: PlanFile,
	state: InstallState,
): Promise<void> {
	// B3: a sealed install is a LIVE install — its database holds real records.
	refuseIf(
		recordedDone(state, 'install_finish') || ctx.host.installStatus() === 'sealed',
		'install.state_conflict',
		() => 'this install is SEALED (live) — --abort never undoes a sealed installation',
	);
	const db = String(plan.answers.db_database ?? '');
	if (!touchedDatabase(state)) return lockUntouchedDatabase(ctx, db);
	refuseIf(
		ctx.request.confirmDatabase !== db,
		'install.invalid_input',
		() => `--abort resets database '${db}' to empty: confirm with --confirm-database ${db}`,
	);
	await lockDatabase(ctx, db);
	await assertNoInstallerSessions(ctx, db);
	// Checked BEFORE any undo (the seed's own reset checks it again, in its
	// transaction): a database that is neither this install's (its stamp) nor
	// empty is not the install's to reset — and nothing else is undone either.
	const target = await ctx.host.inspectDatabase();
	refuseIf(
		target.installStamp !== state.install_id && !target.emptyForInstall,
		'install.state_conflict',
		() =>
			`database '${db}' is not stamped by this install (${target.installStamp ?? 'no stamp'}) and is not empty — refusing to reset it; nothing was undone`,
	);
}

/** The steps --abort undoes, reverse plan order: every started one that has an undo. */
function undoableSteps(ctx: RunContext, plan: PlanFile, state: InstallState): InstallStepId[] {
	const started = (step: InstallStepId): boolean =>
		recordOf(ctx, step).status !== 'pending' ||
		(step === 'install_db_from_default_file' && touchedDatabase(state));
	return [...plan.steps]
		.reverse()
		.filter((step) => started(step) && ctx.table[step].undo !== undefined);
}

/** ABORT: undo, in reverse, only what the install created. */
async function abortRun(ctx: RunContext): Promise<void> {
	lockRunDir(ctx);
	const { plan, state } = loadRecord(ctx);
	await assertAbortable(ctx, plan, state);
	startRun(ctx, 'abort');
	saveState(ctx);
	const undoable = undoableSteps(ctx, plan, state);
	say(ctx, `→ undoing: ${undoable.join(', ') || 'nothing'}`);
	for (const step of undoable) {
		ctx.currentStep = step;
		const undo = ctx.table[step].undo as NonNullable<InstallStepDefinition['undo']>;
		const undone = await undo(verifyContext(ctx));
		say(ctx, `  [${step}] ${undone}`);
		emit(ctx, step, 'undo', { message: undone });
	}
	state.outcome = 'aborted';
	rmSync(join(installRunDir(), PLAN_FILE), { force: true });
	rmSync(join(installRunDir(), STATE_FILE), { force: true });
	ctx.state = null;
}

/** Remove the run dir when nothing is left in it. */
function removeRunDirIfEmpty(): void {
	const dir = installRunDir();
	try {
		if (readdirSync(dir).length === 0) rmdirSync(dir);
	} catch {
		// absent or not empty: kept
	}
}

/** The end-to-end proof: an actual root login — when the password is in hand. */
async function verifyLogin(ctx: RunContext): Promise<void> {
	const password = ctx.secrets.root_password ?? '';
	if (password === '') {
		say(
			ctx,
			'  root login not re-verified (set_root_pw completed in an earlier run; password not re-asked)',
		);
		return;
	}
	say(ctx, '→ verify root login');
	const verified = await ctx.host.verifyRootLogin(password);
	refuseIf(!verified, 'install.step_failed', () => 'root login verification failed after install');
	say(ctx, '  root login verified');
}

/**
 * Print the ONE unredacted line: through the front end's one-time display when
 * it has one (answers whether it reached a terminal), else logged. The console
 * redaction is lifted only for this call.
 */
function displayUnredacted(ctx: RunContext, line: string): boolean {
	ctx.unredacted = true;
	try {
		if (ctx.io.showOnce !== undefined) return ctx.io.showOnce([line]);
		ctx.io.log(line);
		return true;
	} finally {
		ctx.unredacted = false;
	}
}

/**
 * The generated salt, shown ONCE (the one secret line — unredacted by design).
 * Through the front end's terminal when it has one: recorded as shown only
 * when it reached a terminal; otherwise (output redirected to a file) the run
 * says where the salt is stored instead of writing it into a log.
 */
function showSaltOnce(ctx: RunContext): void {
	const { created } = ctx.state as InstallState;
	const salt = readInstallEnv()?.DEDALO_SALT_STRING ?? '';
	if (!created.salt_generated || created.salt_shown || salt === '') return;
	if (displayUnredacted(ctx, `  generated DEDALO_SALT_STRING = ${salt}`)) created.salt_shown = true;
	else say(ctx, `  generated DEDALO_SALT_STRING stored in ${installEnvPath()} (0600)`);
}

/** The end of a fresh/resume run: the root login, the salt (once), the outcome. */
async function finishRun(
	ctx: RunContext,
	wasComplete: boolean,
): Promise<ExecutorOutcome['result']> {
	await verifyLogin(ctx);
	showSaltOnce(ctx);
	(ctx.state as InstallState).outcome = 'complete';
	closeRun(ctx, 'complete');
	return wasComplete && !ctx.ranAny ? 'already_complete' : 'complete';
}

/** Close this process's run record with `result` and checkpoint. */
function closeRun(ctx: RunContext, result: NonNullable<RunRecord['result']>): void {
	if (ctx.run === null || ctx.state === null) return;
	ctx.run.result = result;
	ctx.run.finished_at = nowIso();
	saveState(ctx);
}

/** The console methods a run's output can leave through (errors/log.ts uses info). */
const CONSOLE_METHODS = ['log', 'info', 'debug', 'trace', 'warn', 'error'] as const;

/**
 * One console argument redacted: a string, or an Error — its stack (message
 * included) becomes redacted TEXT, since a connection error can quote a
 * credential. Other values pass as they are.
 */
function cleanArg(ctx: RunContext, arg: unknown): unknown {
	if (ctx.unredacted) return arg;
	if (typeof arg === 'string') return redact(ctx, arg);
	if (arg instanceof Error) return redact(ctx, arg.stack ?? `${arg.name}: ${arg.message}`);
	return arg;
}

/** Redact every console line for the run's duration (engine modules print directly). */
function redactConsole(ctx: RunContext): () => void {
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

/** Release everything this run holds. */
async function releaseAll(ctx: RunContext): Promise<void> {
	const lock = ctx.dbLock;
	ctx.dbLock = null;
	await lock?.release();
	if (ctx.runLock) releaseRunLock();
	ctx.runLock = false;
	if (ctx.request.mode === 'abort' && ctx.state === null) removeRunDirIfEmpty();
}

/** Kill the step's psql children and wait (bounded) for them to exit. */
async function stopChildren(ctx: RunContext): Promise<void> {
	const children = [...ctx.children];
	for (const child of children) child.kill('SIGTERM');
	await Promise.race([
		Promise.all(children.map((child) => child.exited)),
		new Promise((done) => setTimeout(done, 10_000)),
	]);
}

/** The hint, when there is a saved install to resume (never for --abort). */
function hintFor(ctx: RunContext): string[] {
	const { plan, state } = ctx;
	if (plan === null || state === null || ctx.request.mode === 'abort') return [];
	return resumeHint(plan, state, secretsNeeded(plan, state));
}

/** The outcome of a run that threw. */
function failedOutcome(ctx: RunContext, error: unknown): ExecutorOutcome {
	const code = isDedaloError(error) ? error.code : 'install.step_failed';
	const message = redact(ctx, error instanceof Error ? error.message : String(error));
	recordFailure(ctx, code, message);
	if (ctx.currentStep !== null) emit(ctx, ctx.currentStep, 'failed', { message });
	closeRun(ctx, 'failed');
	const wrote = ctx.state !== null;
	return {
		exitCode: 1,
		result: wrote ? 'failed' : 'refused',
		message,
		failedStep: wrote ? ctx.currentStep : null,
		hint: hintFor(ctx),
	};
}

/** SIGINT/SIGTERM: stop the children, record the step failed, release, exit 130/143. */
async function interrupted(
	ctx: RunContext,
	signal: 'SIGINT' | 'SIGTERM',
	restoreConsole: () => void,
): Promise<never> {
	await stopChildren(ctx);
	recordFailure(ctx, 'install.step_failed', 'interrupted');
	closeRun(ctx, 'interrupted');
	await releaseAll(ctx);
	restoreConsole();
	const at = ctx.currentStep === null ? '' : ` at step [${ctx.currentStep}]`;
	if (ctx.currentStep !== null) emit(ctx, ctx.currentStep, 'interrupted', { message: signal });
	ctx.io.interrupted?.(signal);
	ctx.io.warn(`\n✖ install interrupted (${signal})${at}`);
	for (const line of hintFor(ctx)) ctx.io.warn(line);
	return process.exit(signal === 'SIGINT' ? 130 : 143);
}

/** A fresh context for one call. */
function newContext(
	request: ExecutorRequest,
	io: ExecutorIo,
	options: ExecutorOptions,
): RunContext {
	return {
		io,
		table: options.table ?? INSTALL_STEPS,
		host: options.host ?? engineHost(`dedalo_install:${process.pid}`),
		request,
		children: new Set(),
		fault: null,
		plan: null,
		state: null,
		run: null,
		secrets: { ...request.secrets },
		redactions: Object.values(request.secrets).filter(
			(value): value is string => typeof value === 'string',
		),
		currentStep: null,
		dbLock: null,
		runLock: false,
		ranAny: false,
		unredacted: false,
	};
}

/** The mode's run, then (fresh/resume) the end-of-run tasks. */
async function runMode(ctx: RunContext): Promise<ExecutorOutcome> {
	ctx.fault = readInstallFault();
	if (ctx.request.mode === 'abort') {
		await abortRun(ctx);
		return { exitCode: 0, result: 'aborted', message: null, failedStep: null, hint: [] };
	}
	const wasComplete = ctx.request.mode === 'resume' && readStateFile()?.outcome === 'complete';
	await (ctx.request.mode === 'fresh' ? freshRun(ctx) : resumeRun(ctx));
	ctx.currentStep = null;
	const result = await finishRun(ctx, wasComplete);
	if (result === 'already_complete') say(ctx, 'install already complete — every step verified');
	return { exitCode: 0, result, message: null, failedStep: null, hint: [] };
}

/**
 * Run the install (fresh), finish it (resume) or undo it (abort). Never throws
 * for a refusal or a failed step — the outcome carries the redacted sentence and
 * the hint; SIGINT/SIGTERM record the step failed, release the locks and exit
 * 130/143 from here.
 */
export async function executeInstall(
	request: ExecutorRequest,
	io: ExecutorIo,
	options: ExecutorOptions = {},
): Promise<ExecutorOutcome> {
	const ctx = newContext(request, io, options);
	const restoreConsole = redactConsole(ctx);
	const sigint = () => void interrupted(ctx, 'SIGINT', restoreConsole);
	const sigterm = () => void interrupted(ctx, 'SIGTERM', restoreConsole);
	process.on('SIGINT', sigint);
	process.on('SIGTERM', sigterm);
	io.signals?.(true);
	try {
		return await runMode(ctx);
	} catch (error) {
		return failedOutcome(ctx, error);
	} finally {
		process.off('SIGINT', sigint);
		process.off('SIGTERM', sigterm);
		io.signals?.(false);
		await releaseAll(ctx);
		restoreConsole();
	}
}
