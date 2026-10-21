/**
 * THE ONE STEP TABLE (terminal installer, phase 1, 2026-10-11). Every install
 * step id (install_plan.ts INSTALL_STEP_IDS) → the engine call that performs it
 * (`run`), plus the policy the terminal executor (executor.ts) applies:
 *
 *  - `accept`  — the executor's refusal of an outcome that is a report, not a
 *                success (a probe that says "no database"); null = accepted;
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
 *                screen reader reads them (phase 2, 2026-10-12).
 *
 * The `run` halves live in step_runs.ts (STEP_RUNS); every row's `run` IS the
 * STEP_RUNS entry. This policy half reads the run files (sync I/O) and is never
 * on the served request path (sync_io_on_request_path_tripwire;
 * no_install_surface_tripwire: the server's import closure holds no install
 * step module).
 */

import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { basename, join, sep as pathSep, resolve as resolvePath } from 'node:path';
import { projectRoot } from '../../config/env.ts';
import { writeFileDurably } from '../files/durable.ts';
import { isTempSibling } from '../files/temp_path.ts';
import type { ServerState } from '../resolve/server_state.ts';
import { devTrustReviewText } from './dev_certificate.ts';
import { authorityFile } from './host/tls_authority.ts';
import type { InstallStepId } from './install_plan.ts';
import { devTlsDir, installPrivateDir } from './paths.ts';
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
import type { VerifyResult } from './step_loop.ts';
import { type InstallStepInputs, STEP_RUNS, type StepRawOutcome } from './step_runs.ts';

export type { InstallStepInputs, StepRawOutcome } from './step_runs.ts';

export interface VerifyContext {
	readonly plan: PlanFile;
	readonly state: InstallState;
	readonly secrets: Secrets;
}

/** A step's verdict — the ONE shape, owned by the shared loop (step_loop.ts). */
export type { VerifyResult } from './step_loop.ts';

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

/**
 * Does an --abort have to be GIVEN the database password? When the seed
 * started (the reset drops what it restored) and the install was run with one
 * — and `available` (the secrets the abort runs with: once persist_config is
 * done, the install's own .env's) does not hold it. ONE predicate: the CLI's
 * refusal (scripts/install.ts) and the interactive abort's question
 * (install_session.ts) both ask it.
 */
export function abortNeedsDatabasePassword(
	plan: PlanFile,
	state: InstallState,
	available: Secrets,
): boolean {
	return (
		(state.created.seed_started || state.created.seed_restored) &&
		plan.secrets_supplied.db_password === true &&
		(available.db_password ?? '') === ''
	);
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
	verify: async (ctx) => {
		const { getServerState } = await import('../resolve/server_state.ts');
		return persistedConfigMatches(ctx.plan, getServerState().install_status);
	},
	undo: async (ctx) => {
		const { setServerState } = await import('../resolve/server_state.ts');
		const restored = restorePreInstallEnv(ctx.state);
		const removed = removeInstallEnvCopies(ctx.state);
		setServerState({ install_status: statusBefore(ctx.state) });
		const runtime = await removeCreatedRuntimeFiles(ctx.state);
		return `${restored}; ${removed} backup(s) removed; install status reset${runtime}`;
	},
};

/** A sqlite store's companion files (removed with it). */
const SQLITE_SIDE_FILES = ['', '-wal', '-shm', '-journal'] as const;

/**
 * The server's runtime files this install CREATED — the state file, the
 * session store (campaign 3 C3-9: a developer abort left both) — removed: the
 * last undo, after the install status was reset. One that existed at the
 * preflight is kept; a record without the list (older) removes nothing.
 */
async function removeCreatedRuntimeFiles(state: InstallState): Promise<string> {
	const before = state.preflight.runtime_files_before;
	if (before === undefined) return '';
	const { RUNTIME_PATH_CENSUS } = await import('./runtime_paths.ts');
	// Only a file INSIDE the install's private dir is the install's: a path an
	// env override points elsewhere (a test run's own session store) is never
	// this undo's to remove.
	const privatePrefix = `${resolvePath(installPrivateDir())}${pathSep}`;
	const created = RUNTIME_PATH_CENSUS.filter((entry) => RUNTIME_FILE_IDS.includes(entry.id))
		.map((entry) => entry.resolve())
		.filter(
			(path): path is string =>
				path !== null &&
				resolvePath(path).startsWith(privatePrefix) &&
				!before.includes(path) &&
				existsSync(path),
		);
	for (const path of created) {
		for (const side of SQLITE_SIDE_FILES) rmSync(`${path}${side}`, { force: true });
	}
	return created.length === 0 ? '' : `; removed ${created.join(', ')}`;
}

/** The runtime files a server creates in the private dir (runtime_paths.ts census ids). */
const RUNTIME_FILE_IDS: readonly string[] = Object.freeze(['ts_state_path', 'session_db_path']);

/**
 * Put the pre-install .env back (atomically and durably), or remove the one
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
	// The durability kernel's door, like persist_config's own write: the
	// restored .env survives a power cut, and a failure leaves no staged copy.
	writeFileDurably(envPath, readFileSync(join(dir, backup)), { mode: 0o600 });
	return 'restored the pre-install .env';
}

/**
 * A staged copy of the secrets a killed persist run can leave: the durable
 * door's temp sibling of `.env` or of a `.env.bak.*` (`<name>.tmp-<base36>`,
 * core/files/temp_path.ts), or the pre-2026-10-21 `.env.tmp.<pid>`.
 */
function isStagedEnvCopy(name: string): boolean {
	return name.startsWith('.env.tmp.') || (name.startsWith('.env') && isTempSibling(name));
}

/** Remove the secret copies the install's persist runs left (backups, staged tmps, its sample.env). */
function removeInstallEnvCopies(state: InstallState): number {
	const dir = installPrivateDir();
	const backups = installCreatedBackups(state);
	for (const backup of backups) rmSync(join(dir, backup), { force: true });
	for (const name of readdirSync(dir).filter(isStagedEnvCopy)) {
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

/** `<label> <path> (missing|not writable)` for every directory that is not ok, comma-joined. */
export function directoriesNeedingAttention(dirs: readonly DirectoryRow[]): string {
	return dirs
		.filter((dir) => !(dir.exists && dir.writable))
		.map((dir) => `${dir.label} ${dir.path} (${dir.exists ? 'not writable' : 'missing'})`)
		.join(', ');
}

const install_dev_dependencies: InstallStepDefinition = {
	id: 'install_dev_dependencies',
	kind: 'action',
	needs: [],
	label: () => 'development dependencies (bun install)',
	run: STEP_RUNS.install_dev_dependencies,
	verify: async () => {
		const { describeGaps, devDependencyGaps } = await import('./dev_dependencies.ts');
		const gaps = devDependencyGaps(projectRoot);
		return {
			ok: gaps.length === 0,
			detail:
				gaps.length === 0
					? 'every development dependency at its locked version'
					: `not usable: ${describeGaps(gaps)}`,
		};
	},
	// Never removed: the checkout's node_modules is the developer's (and the
	// installer's own dependencies live in the same tree).
	undo: async () => 'development dependencies kept (the checkout is yours)',
};

const dev_tls_certificate: InstallStepDefinition = {
	id: 'dev_tls_certificate',
	kind: 'action',
	needs: [],
	label: () =>
		`development certificate (the local CA generator, deploy/dedalo-tls-rotate.sh → ${devTlsDir()})`,
	run: STEP_RUNS.dev_tls_certificate,
	verify: async (ctx) => {
		const { devCertificateProblems, devStepTarget } = await import('./dev_tls.ts');
		const target = devStepTarget(ctx.plan.answers);
		const problems = devCertificateProblems(target.dir, target.names);
		return {
			ok: problems.length === 0,
			detail:
				problems.length === 0
					? `certificate for ${target.names.join(', ')} chains to the local authority in ${target.dir}`
					: problems.join('; '),
		};
	},
	// Only a directory this install created: an earlier install's authority (which
	// this one only renewed) is the developer's, trusted on this machine already.
	undo: async (ctx) => {
		const dir = devTlsDir();
		if (ctx.state.created.dev_tls_dir !== true) {
			return `development certificate kept (${dir} was there before this install)`;
		}
		// The trust undo runs first (reverse order); an entry it could NOT remove (a
		// cancelled dialog, a refused sudo) is still trusted on this machine. Its
		// record — and the authority it names — must outlive this directory's
		// removal, or `bun run tls:untrust` has nothing left to take it back with.
		const { readTrustRecord, TRUST_RECORD_NAME } = await import('./dev_trust.ts');
		if (readTrustRecord(dir).length > 0) {
			const keep = new Set([TRUST_RECORD_NAME, basename(authorityFile(dir))]);
			for (const name of readdirSync(dir)) {
				if (!keep.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
			}
			return `development certificate removed, but ${dir} keeps ${[...keep].join(' and ')}: the authority is still trusted on this machine — run \`bun run tls:untrust\``;
		}
		rmSync(dir, { recursive: true, force: true });
		return `development certificate removed (${dir})`;
	},
};

/**
 * Trust the development authority on this machine (D2). No `verify`: a
 * cancelled prompt is a DONE step with a warning ("not trusted yet" — the
 * server serves either way), and the run itself measures the trust before it
 * asks anything, so a resume never prompts twice.
 */
const dev_trust_ca: InstallStepDefinition = {
	id: 'dev_trust_ca',
	kind: 'action',
	needs: [],
	label: () =>
		`development authority trusted on this machine: ${devTrustReviewText(process.platform, process.geteuid?.() ?? null)}`,
	run: STEP_RUNS.dev_trust_ca,
	warnings: ownWarnings,
	undo: async (ctx) => {
		const { untrustDevAuthorityOnMachine } = await import('./dev_trust.ts');
		const result = await untrustDevAuthorityOnMachine(devTlsDir(), ctx.state.install_id);
		const removed =
			result.removed.length === 0 ? 'nothing this install trusted' : result.removed.join(', ');
		return result.failed.length === 0
			? `trust removed: ${removed}`
			: `trust removed: ${removed}; NOT removed (do it by hand): ${result.failed.join('; ')}`;
	},
};

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
		// NAME the directory (campaign 3b N4): "One or more directories need
		// attention" read as "something changed it outside the installer".
		return {
			ok: report.ok,
			detail: report.ok ? report.msg : directoriesNeedingAttention(report.dirs),
		};
	},
	undo: async (ctx) => {
		// The media tree first (campaign 3 C3-9: it was left whole, under a
		// deleted service uid), then what the preflight saw MISSING and now
		// exists — computed at abort time, so a crash before the step's
		// checkpoint loses nothing. Deepest first, and only while empty (never
		// a directory holding anything).
		const tree = await pruneMediaTree(ctx.state);
		const created = ctx.state.preflight.directories_missing.filter((path) => existsSync(path));
		const removed = removeEmptyDeepestFirst(created);
		const dirs =
			removed.length === 0 ? 'no created directory was empty' : `removed ${removed.join(', ')}`;
		return tree === 0 ? dirs : `media tree: ${tree} empty director(ies) removed; ${dirs}`;
	},
};

/** Remove each of `paths` that is an empty directory, deepest first; answers the removed ones. */
export function removeEmptyDeepestFirst(paths: readonly string[]): string[] {
	const removed: string[] = [];
	for (const path of [...paths].sort((a, b) => b.length - a.length)) {
		try {
			if (readdirSync(path).length === 0) {
				rmdirSync(path);
				removed.push(path);
			}
		} catch {
			// absent / not empty / not ours to force: kept
		}
	}
	return removed;
}

/** Every directory under `root` (not `root` itself), any depth; symlinks never followed. */
function directoriesUnder(root: string): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const path = join(dir, entry.name);
			found.push(path);
			walk(path);
		}
	};
	try {
		walk(root);
	} catch {
		// unreadable: what was found so far
	}
	return found;
}

/**
 * The media gate's generated files in a media root that held NOTHING before
 * the install (campaign 3 C3-9, measured on a real Debian 13 drill): the rule
 * files (`.htaccess`, the two nginx files) and the session markers of the
 * install's own root login (`.publication/auth/*`). All regenerated by the
 * engine at every start — never a record, never a media file — and, in a
 * root that was empty, all this install's; left behind, they kept the media
 * tree (and so its service user) alive after an abort.
 */
async function removeGateArtifacts(): Promise<void> {
	const { authMarkerDir, ruleFilePaths } = await import('../media/protection.ts');
	for (const path of Object.values(ruleFilePaths() ?? {})) rmSync(path, { force: true });
	for (const path of filesIn(authMarkerDir())) rmSync(path, { force: true });
}

/** The regular files directly in `dir` (none when it is null or absent). */
function filesIn(dir: string | null): string[] {
	if (dir === null || !existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(dir, entry.name));
}

/**
 * The media tree's EMPTY directories this install made (C3-9): when the media
 * root held nothing at the preflight, every directory under it is the
 * install's; otherwise only the ones check_directories recorded. Never a file,
 * never a directory that holds one. Answers how many were removed.
 */
async function pruneMediaTree(state: InstallState): Promise<number> {
	const recorded = state.created.media_tree ?? [];
	if (state.preflight.media_root_empty !== true) return removeEmptyDeepestFirst(recorded).length;
	await removeGateArtifacts();
	const { config } = await import('../../config/config.ts');
	const { assertTestMediaRoot } = await import('../media/test_media_root.ts');
	const configured = config.media.rootPath;
	const root = configured === null ? null : assertTestMediaRoot(configured, 'pruneMediaTree');
	const all = root === null ? recorded : [...new Set([...recorded, ...directoriesUnder(root)])];
	return removeEmptyDeepestFirst(all).length;
}

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

/**
 * THE DEVELOPER ROUTE IS FINISHED WHEN IT SERVES (TODO-053, D4 — dev_serve.ts):
 * the operator's own `bun run dev`, started once with the written .env; /health
 * over the development listener (the local authority as the trust anchor) and a
 * root login over it; stopped again. A red check fails the step, naming the
 * cause, so the install is never reported complete on a listener nothing
 * served. No `verify` (a done step is not booted again on a resume) and no
 * `undo` (the server is stopped and the port waited free; what the boot writes —
 * the session store, the logs, the rebuilt CSS — is the operator's own
 * `bun run dev`'s, written as the checkout's owner: the check refuses root).
 */
const verify_dev_server: InstallStepDefinition = {
	id: 'verify_dev_server',
	kind: 'action',
	needs: [],
	label: () =>
		'serve check: `bun run dev` started once — /health and a root login over the development listener — then stopped',
	run: STEP_RUNS.verify_dev_server,
	warnings: ownWarnings,
};

/** EXHAUSTIVE over InstallStepId: a new step id fails to compile until it has a row. */
export const INSTALL_STEPS: { readonly [K in InstallStepId]: InstallStepDefinition } =
	Object.freeze({
		test_db_connection,
		test_diffusion_connection,
		test_mailer_connection,
		install_dev_dependencies,
		dev_tls_certificate,
		dev_trust_ca,
		persist_config,
		check_directories,
		stage_ontologies,
		install_db_from_default_file,
		install_ontologies,
		set_root_pw,
		install_hierarchies,
		register_tools,
		install_finish,
		verify_dev_server,
	});
