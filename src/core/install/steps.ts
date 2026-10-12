/**
 * THE ONE STEP TABLE (terminal installer, phase 1, 2026-10-11). Every install
 * step id (install_plan.ts INSTALL_STEP_IDS) → the engine call that performs it
 * — the SAME call for both front ends: the wizard router (engine.ts) serializes
 * `run`'s raw outcome onto the wire exactly as before; the terminal executor
 * (executor.ts) additionally applies the executor-only policy:
 *
 *  - `accept`  — the CLI's refusal of an outcome the wizard renders as a report
 *                (a probe that says "no database"); null = accepted;
 *  - `warnings`— the non-blocking lines an outcome carries;
 *  - `verify`  — did the step's work LAND? (absent = always re-run; a probe or
 *                an idempotent upsert). What makes a resume safe: a step whose
 *                work is verified is never run twice, one whose work is not is
 *                run again, and one RECORDED done whose work is gone is drift;
 *  - `consumedBy` — the step whose verified outcome proves this one (staged
 *                files are deleted by the import that consumes them);
 *  - `neverAdopt` — a step left running/failed is RE-RUN (its run converges),
 *                never marked done on its verify alone: the seed, whose engine
 *                half commits piecemeal (a half-activated hierarchy can pass a
 *                partial verify);
 *  - `undo`    — `--abort` only, and only over what the state file says the
 *                install CREATED;
 *  - `details` — the per-item rows the executor prints after the step (one
 *                row per directory, one per tool): WORDS, never glyphs, so a
 *                screen reader reads them (phase 2, 2026-10-12 — the wizard's
 *                directory and tool reports, now in the terminal).
 *
 * The wizard never calls accept/verify/undo: its "a probe answers ok:true with
 * the report" semantics are unchanged. `to_update`, `verify_active_config` and
 * `get_ontology_catalog` are wizard affordances, not steps — they stay in
 * engine.ts.
 *
 * The `run` halves live in step_runs.ts (STEP_RUNS) — the ONLY part the wizard
 * router imports: the executor-only policy here reads the run files (sync I/O)
 * and must stay off the served request path (sync_io_on_request_path_tripwire).
 * Every row's `run` IS the STEP_RUNS entry (gated in install_step_router_native).
 */

import { copyFileSync, existsSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerState } from '../resolve/server_state.ts';
import type { InstallStepId } from './install_plan.ts';
import { installPrivateDir } from './paths.ts';
import {
	envBackups,
	type InstallState,
	installEnvPath,
	type PlanFile,
	persistedConfigMatches,
	type SecretKey,
	type Secrets,
	sha256Of,
} from './run_files.ts';
import { type InstallStepInputs, STEP_RUNS, type StepRawOutcome } from './step_runs.ts';

export type { InstallStepInputs, StepRawOutcome } from './step_runs.ts';

export interface VerifyContext {
	readonly plan: PlanFile;
	readonly state: InstallState;
	readonly secrets: Secrets;
}

export interface VerifyResult {
	ok: boolean;
	detail: string;
	/** The outcome is present but CONTRADICTS the plan (e.g. another root password): refuse, never re-run. */
	conflict?: boolean;
}

export interface InstallStepDefinition {
	readonly id: InstallStepId;
	readonly kind: 'probe' | 'action';
	/** The secrets `run` consumes (a resume must re-ask them only while the step is not done). */
	readonly needs: readonly SecretKey[];
	/** The human line `→ [<id>] <label>`. */
	label(plan: PlanFile): string;
	run(inputs: InstallStepInputs): Promise<StepRawOutcome>;
	accept?(outcome: StepRawOutcome, inputs: InstallStepInputs): string | null;
	warnings?(outcome: StepRawOutcome): string[];
	/** The per-item rows printed after the step (see the header); never the outcome's verdict. */
	details?(outcome: StepRawOutcome): string[];
	verify?(ctx: VerifyContext): Promise<VerifyResult>;
	readonly consumedBy?: InstallStepId;
	/** A step left running/failed is always re-run, never adopted on its verify (see the header). */
	readonly neverAdopt?: true;
	undo?(ctx: VerifyContext): Promise<string>;
}

// ── the secrets a run must be given ─────────────────────────────────────────

const ENV_CARRIED: readonly SecretKey[] = ['db_password', 'mysql_password', 'smtp_pass'];

/** Is `step` in the plan and not yet recorded done? */
function stillToDo(plan: PlanFile, state: InstallState | null, step: InstallStepId): boolean {
	return plan.steps.includes(step) && state?.steps[step]?.status !== 'done';
}

/**
 * The secrets this run must be GIVEN. db/mysql/smtp: only while persist_config
 * is not done (once it is, the install's own 0600 .env carries them back); the
 * root password: only while set_root_pw is not done. A secret the original run
 * was not given (a passwordless trust connection) is never required. HERE, in
 * the config-free step table (not the executor, which reaches config through
 * pg_exec): scripts/install.ts asks for a resume's missing secrets BEFORE it
 * seeds the environment config.ts freezes.
 */
export function secretsNeeded(plan: PlanFile, state: InstallState | null): SecretKey[] {
	const persistPending = stillToDo(plan, state, 'persist_config');
	const carried = ENV_CARRIED.filter((key) => persistPending && plan.secrets_supplied[key]);
	return stillToDo(plan, state, 'set_root_pw') ? [...carried, 'root_password'] : carried;
}

/** The install status the preflight found (what --abort puts back). */
function statusBefore(state: InstallState): ServerState['install_status'] {
	return (state.preflight.install_status_before ?? undefined) as ServerState['install_status'];
}

/** The domain TLDs a plan stages and imports, deps first. */
function plannedTlds(plan: PlanFile): string[] {
	return (plan.ontology_request?.items ?? []).map((item) => item.tld);
}

/** The outcome's own `warnings` list, when it carries one. */
function ownWarnings(outcome: StepRawOutcome): string[] {
	return Array.isArray(outcome.warnings) ? outcome.warnings.map(String) : [];
}

/** A probe's not-ok outcome, as a warning (the config is written anyway — `tail` says so). */
function probeWarning(tail: string) {
	return (outcome: StepRawOutcome): string[] =>
		outcome.ok === true ? [] : [`${String(outcome.msg ?? '')} — ${tail}`];
}

/** The thesauri install_hierarchies imports (the answer's, then the declared ones). */
function hierarchiesLabel(plan: PlanFile): string {
	return `hierarchies: ${plan.hierarchies.join(', ') || 'none'}`;
}

const test_db_connection: InstallStepDefinition = {
	id: 'test_db_connection',
	kind: 'probe',
	needs: ['db_password'],
	label: () => 'database connection',
	run: STEP_RUNS.test_db_connection,
	accept: (outcome, inputs) => {
		if (outcome.db_exists === true) return null;
		if (outcome.can_connect !== true) return String(outcome.msg ?? 'database not reachable');
		return `database '${String(inputs.posted.db_database ?? '')}' must exist (empty) first — ${String(outcome.msg ?? '')}`;
	},
};

const test_diffusion_connection: InstallStepDefinition = {
	id: 'test_diffusion_connection',
	kind: 'probe',
	needs: ['mysql_password'],
	label: () => 'diffusion (MariaDB) connection',
	run: STEP_RUNS.test_diffusion_connection,
	// An unattended install may legitimately configure a target the build host
	// cannot reach yet: a warning, never a refusal.
	warnings: probeWarning('writing the diffusion config anyway'),
};

const test_mailer_connection: InstallStepDefinition = {
	id: 'test_mailer_connection',
	kind: 'probe',
	needs: ['smtp_pass'],
	label: () => 'SMTP connection',
	run: STEP_RUNS.test_mailer_connection,
	warnings: probeWarning('writing the SMTP config anyway'),
};

const persist_config: InstallStepDefinition = {
	id: 'persist_config',
	kind: 'action',
	needs: ['db_password', 'mysql_password', 'smtp_pass'],
	label: () => 'write the .env',
	run: STEP_RUNS.persist_config,
	warnings: ownWarnings,
	verify: async (ctx) => persistedConfigMatches(ctx.plan),
	undo: async (ctx) => {
		const { setServerState } = await import('../resolve/server_state.ts');
		const restored = restorePreInstallEnv(ctx.state);
		const removed = removeInstallEnvCopies(ctx.state);
		setServerState({ install_status: statusBefore(ctx.state) });
		return `${restored}; ${removed} backup(s) removed; install status reset`;
	},
};

/**
 * Put the pre-install .env back (atomically: copy + rename), or remove the one
 * the install wrote when there was none. The original's backup is the recorded
 * one, else the `.env.bak.*` whose content hash the preflight recorded (a crash
 * before the checkpoint recorded nothing).
 */
function restorePreInstallEnv(state: InstallState): string {
	const envPath = installEnvPath();
	const dir = installPrivateDir();
	if (!state.preflight.env_existed) {
		rmSync(envPath, { force: true });
		return 'removed .env';
	}
	const backup =
		state.created.env_backup ??
		envBackups().find((name) => sha256Of(join(dir, name)) === state.preflight.env_sha256);
	if (backup === undefined) return 'pre-install .env backup not found — .env left as is';
	const tmp = `${envPath}.tmp.${process.pid}`;
	copyFileSync(join(dir, backup), tmp);
	renameSync(tmp, envPath);
	return 'restored the pre-install .env';
}

/** Remove the secret copies the install's persist runs left (backups, staged tmps, its sample.env). */
function removeInstallEnvCopies(state: InstallState): number {
	const dir = installPrivateDir();
	const backups = installCreatedBackups(state);
	for (const backup of backups) rmSync(join(dir, backup), { force: true });
	for (const name of readdirSync(dir).filter((item) => item.startsWith('.env.tmp.'))) {
		rmSync(join(dir, name), { force: true });
	}
	if (state.created.sample_env && !state.preflight.sample_env_existed) {
		rmSync(join(dir, 'sample.env'), { force: true });
	}
	return backups.length;
}

/**
 * The `.env.bak.*` files THIS install created: every one that was not there at
 * its preflight (computed now, so a persist run that died before its
 * checkpoint is covered too), plus the recorded ones. An operator's own older
 * backup is in the preflight's baseline and is never touched.
 */
export function installCreatedBackups(state: InstallState): string[] {
	const baseline = state.preflight.env_backups_before;
	const appeared =
		baseline === undefined ? [] : envBackups().filter((name) => !baseline.includes(name));
	return [...new Set([...state.created.env_backups, ...appeared])].sort();
}

/** One check_directories row as the outcome carries it. */
interface DirectoryRow {
	label: string;
	path: string;
	exists: boolean;
	writable: boolean;
}

/** `ok  Private config  /path` / `missing  …` / `not writable  …` — one per directory. */
export function directoryDetails(outcome: StepRawOutcome): string[] {
	const dirs = (Array.isArray(outcome.dirs) ? outcome.dirs : []) as DirectoryRow[];
	return dirs.map((dir) => {
		const state = !dir.exists ? 'missing' : dir.writable ? 'ok' : 'not writable';
		return `${state}  ${dir.label}  ${dir.path}`;
	});
}

/** One register_tools report row as the outcome carries it. */
interface ToolRow {
	name: string;
	version: string | null;
	errors: string[];
	warnings: string[];
}

/** `ok  tool_x 1.2` / `warn  tool_y: …` / `error  tool_z: …` — one per tool. */
export function toolDetails(outcome: StepRawOutcome): string[] {
	const report = (Array.isArray(outcome.report) ? outcome.report : []) as ToolRow[];
	return report.map((tool) => {
		if (tool.errors.length > 0) return `error  ${tool.name}: ${tool.errors.join('; ')}`;
		if (tool.warnings.length > 0) return `warn  ${tool.name}: ${tool.warnings.join('; ')}`;
		return `ok  ${tool.name}${tool.version === null ? '' : ` ${tool.version}`}`;
	});
}

const check_directories: InstallStepDefinition = {
	id: 'check_directories',
	kind: 'action',
	needs: [],
	label: () => 'directories',
	run: STEP_RUNS.check_directories,
	details: directoryDetails,
	accept: (outcome) => {
		if (outcome.ok === true) return null;
		// A bare path list read as a crash (measured 2026-10-08: "install failed:
		// /backups/db"). Say what is wrong and as whom, so the operator can chown.
		const dirs = (outcome.dirs ?? []) as {
			label: string;
			path: string;
			exists: boolean;
			writable: boolean;
		}[];
		return (
			`these directories are missing or not writable by this process (uid ${process.getuid?.() ?? '?'}): ` +
			dirs
				.filter((dir) => !dir.writable)
				.map((dir) => `${dir.label} ${dir.path}${dir.exists ? '' : ' (could not be created)'}`)
				.join(', ')
		);
	},
	verify: async () => {
		const { checkDirectories } = await import('./directories.ts');
		const report = checkDirectories({ create: false });
		return { ok: report.ok, detail: report.msg };
	},
	undo: async (ctx) => {
		// Only what the preflight saw MISSING and now exists — computed at abort
		// time, so a crash before the step's checkpoint loses nothing. Deepest
		// first, and only while empty (never a directory holding anything).
		const created = ctx.state.preflight.directories_missing
			.filter((path) => existsSync(path))
			.sort((a, b) => b.length - a.length);
		const removed: string[] = [];
		for (const path of created) {
			try {
				if (readdirSync(path).length === 0) {
					rmdirSync(path);
					removed.push(path);
				}
			} catch {
				// not empty / not ours to force: kept
			}
		}
		return removed.length === 0
			? 'no created directory was empty'
			: `removed ${removed.join(', ')}`;
	},
};

const stage_ontologies: InstallStepDefinition = {
	id: 'stage_ontologies',
	kind: 'action',
	needs: [],
	label: (plan) =>
		`ontology files: ${plannedTlds(plan).join(', ')} (fetched + verified before the database is touched)`,
	run: STEP_RUNS.stage_ontologies,
	warnings: ownWarnings,
	verify: async (ctx) => {
		const { stagedMatches } = await import('./ontology_install.ts');
		return stagedMatches(plannedTlds(ctx.plan));
	},
	consumedBy: 'install_ontologies',
	undo: async () => {
		const { installOntologyStagingDir } = await import('./paths.ts');
		const { removeStagingDir } = await import('./ontology_install.ts');
		await removeStagingDir(installOntologyStagingDir());
		return 'removed the ontology staging dir';
	},
};

const install_db_from_default_file: InstallStepDefinition = {
	id: 'install_db_from_default_file',
	kind: 'action',
	needs: [],
	label: () => 'restore database from seed (+ activate core hierarchies)',
	run: STEP_RUNS.install_db_from_default_file,
	verify: async (ctx) => {
		const { seedComplete } = await import('./db_restore.ts');
		const { connFromConfig } = await import('./pg_exec.ts');
		return seedComplete(connFromConfig(), ctx.state.install_id);
	},
	// Its engine half commits piecemeal: an unfinished run is re-run (stamped →
	// completeFreshInstall converges), never adopted.
	neverAdopt: true,
	undo: async (ctx) => {
		const { resetDatabaseToEmpty } = await import('./db_restore.ts');
		const { connFromConfig } = await import('./pg_exec.ts');
		return resetDatabaseToEmpty(
			connFromConfig(),
			ctx.state.preflight.preexisting_extensions,
			ctx.state.install_id,
		);
	},
};

/** Every database step after the seed: its undo is the seed's (the whole database is reset). */
const COVERED_BY_SEED = async (): Promise<string> => 'covered by install_db_from_default_file';

const install_ontologies: InstallStepDefinition = {
	id: 'install_ontologies',
	kind: 'action',
	needs: [],
	label: (plan) => `domain ontologies: ${plannedTlds(plan).join(', ')}`,
	run: STEP_RUNS.install_ontologies,
	warnings: ownWarnings,
	verify: async (ctx) => {
		const { ontologyImportComplete } = await import('./ontology_install.ts');
		return ontologyImportComplete(plannedTlds(ctx.plan));
	},
	undo: COVERED_BY_SEED,
};

const set_root_pw: InstallStepDefinition = {
	id: 'set_root_pw',
	kind: 'action',
	needs: ['root_password'],
	label: () => 'set root password',
	run: STEP_RUNS.set_root_pw,
	verify: async (ctx) => {
		const { rootPasswordMatches, rootPasswordState } = await import('./root_pw.ts');
		const state = await rootPasswordState();
		if (state !== 'set') return { ok: false, detail: `root password ${state}` };
		const password = ctx.secrets.root_password;
		if (password === undefined || password === '') {
			return { ok: true, detail: 'root password set (not re-verified: not re-asked)' };
		}
		return (await rootPasswordMatches(password))
			? { ok: true, detail: 'root password set and verified' }
			: { ok: false, conflict: true, detail: 'root password already set to a different value' };
	},
	undo: COVERED_BY_SEED,
};

const install_hierarchies: InstallStepDefinition = {
	id: 'install_hierarchies',
	kind: 'action',
	needs: [],
	label: hierarchiesLabel,
	run: STEP_RUNS.install_hierarchies,
	// A failed hierarchy FAILS the install (nothing is sealed): a thesaurus the
	// operator asked for but cannot use is not an install that worked.
	accept: (outcome) =>
		outcome.ok === true ? null : `hierarchies: ${((outcome.errors ?? []) as string[]).join('; ')}`,
	undo: COVERED_BY_SEED,
};

const register_tools: InstallStepDefinition = {
	id: 'register_tools',
	kind: 'action',
	needs: [],
	label: () => 'register tools',
	run: STEP_RUNS.register_tools,
	details: toolDetails,
	undo: COVERED_BY_SEED,
};

const install_finish: InstallStepDefinition = {
	id: 'install_finish',
	kind: 'action',
	needs: [],
	label: () => 'seal install',
	run: STEP_RUNS.install_finish,
	verify: async () => {
		const { getServerState } = await import('../resolve/server_state.ts');
		const status = getServerState().install_status;
		return { ok: status === 'sealed', detail: `install status ${status ?? 'unset'}` };
	},
	undo: async (ctx) => {
		const { setServerState } = await import('../resolve/server_state.ts');
		setServerState({ install_status: statusBefore(ctx.state) });
		return 'install status reset';
	},
};

/** EXHAUSTIVE over InstallStepId: a new step id fails to compile until it has a row. */
export const INSTALL_STEPS: { readonly [K in InstallStepId]: InstallStepDefinition } =
	Object.freeze({
		test_db_connection,
		test_diffusion_connection,
		test_mailer_connection,
		persist_config,
		check_directories,
		stage_ontologies,
		install_db_from_default_file,
		install_ontologies,
		set_root_pw,
		install_hierarchies,
		register_tools,
		install_finish,
	});
