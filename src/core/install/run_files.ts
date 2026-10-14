/**
 * THE TERMINAL INSTALLER'S RUN FILES (phase 1, 2026-10-11) — what makes an
 * install RESUMABLE: a plan file written once, a state file checkpointed after
 * every step, and a lock, all under `<private>/install/` (next to the ontology
 * staging dir, so a run with DEDALO_INSTALL_PRIVATE_DIR set stays in its
 * scratch directory).
 *
 *  - install.plan.json  (schema dedalo.install.plan/1) — the install's
 *    decisions: the PLAIN answers (an allow-list — install_plan.ts
 *    PLAIN_ANSWER_KEYS; a secret answer added later is excluded by default),
 *    which secrets were supplied (booleans), the steps, the thesauri, a VIEW of
 *    the ontology request (never a temp path, never an access code), the
 *    non-secret .env entries the plan renders, and a `plan_hash` over all of it.
 *  - install.state.json (schema dedalo.install.state/1) — per-step status,
 *    attempts, verify verdicts and redacted messages; what the preflight saw;
 *    what the install CREATED (the only things `--abort` may remove).
 *  - install.lock — a HINT (pid, host): the authority on "one install per
 *    database" is the server-side advisory lock (db_restore.ts holdInstallLock).
 *
 * NO SECRET VALUE IS EVER WRITTEN HERE. Every string that reaches these files —
 * and every line the installer prints — passes through redactSecrets.
 *
 * Every write: `<file>.tmp.<pid>` created exclusively at 0600, fsync, rename
 * (the run dir is forced to 0700, existing or not; a symlinked one is refused).
 * Both files are KEPT after success, as the install's record; a fresh run that
 * finds one refuses (executor.ts).
 *
 * CONFIG-FREE: imports src/config/env.ts and the pure core
 * (run_files_core.ts — the shapes, codecs, lock and redaction, which the host
 * route's root process uses without this module) — the CLI reads the plan and
 * state files (and the install's own .env) BEFORE it seeds the environment
 * config.ts freezes.
 * Gates: test/unit/install_run_files_secret_tripwire.test.ts,
 * test/unit/install_executor_native.test.ts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvFile } from '../../config/env.ts';
import { installPrivateDir } from './paths.ts';
import type { InstallState, LockInfo, PlanFile, RunMode } from './run_files_core.ts';
import * as core from './run_files_core.ts';

export * from './run_files_core.ts';

/** The run dir: `<private>/install` (mode 0700). */
export function installRunDir(): string {
	return join(installPrivateDir(), 'install');
}

/** The install's own .env (what persist_config writes). */
export function installEnvPath(): string {
	return join(installPrivateDir(), '.env');
}

// ── the core's file operations, defaulted to the install's run dir ───────────

export function ensureRunDir(dir: string = installRunDir()): boolean {
	return core.ensureRunDir(dir);
}

export function writePlanFile(plan: PlanFile, dir: string = installRunDir()): void {
	core.writePlanFile(plan, dir);
}

export function writeStateFile(state: InstallState, dir: string = installRunDir()): void {
	core.writeStateFile(state, dir);
}

export function readPlanFile(dir: string = installRunDir()): PlanFile | null {
	return core.readPlanFile(dir);
}

export function readStateFile(dir: string = installRunDir()): InstallState | null {
	return core.readStateFile(dir);
}

export function acquireRunLock(
	mode: RunMode,
	warn: (line: string) => void,
	dir: string = installRunDir(),
): { ok: true } | { ok: false; holder: LockInfo } {
	return core.acquireRunLock(mode, warn, dir);
}

export function releaseRunLock(dir: string = installRunDir()): void {
	core.releaseRunLock(dir);
}

/** The live holder of this private dir's run lock, or null (core.liveLockHolder). */
export function liveLockHolder(dir: string = installRunDir()): LockInfo | null {
	return core.liveLockHolder(dir);
}

// ── the install's own .env (the engine side) ─────────────────────────────────

/** The install's own .env parsed (config-free), or null when absent/unreadable. */
export function readInstallEnv(path: string = installEnvPath()): Record<string, string> | null {
	if (!existsSync(path)) return null;
	try {
		return parseEnvFile(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

/** The `.env.bak.*` files in the private dir, by name. */
export function envBackups(dir: string = installPrivateDir()): string[] {
	try {
		return readdirSync(dir)
			.filter((name) => name.startsWith('.env.bak.'))
			.sort();
	} catch {
		return [];
	}
}

/**
 * persist_config's VERIFY — config-free (the resume decides where its secrets
 * come from BEFORE config is frozen): the .env parses; every non-secret entry
 * the plan renders is present with the plan's value; DEDALO_SALT_STRING is
 * there; the install status says the config was written by an install. The
 * status is the CALLER's read (server_state.ts): this module stays off the
 * server-state module, which the host route's root process never loads.
 */
export function persistedConfigMatches(
	plan: PlanFile,
	installStatus: string | undefined,
	envPath: string = installEnvPath(),
): { ok: boolean; detail: string } {
	const env = readInstallEnv(envPath);
	if (env === null) return { ok: false, detail: `${envPath} is missing or unreadable` };
	const problem = envProblem(plan, env) ?? statusProblem(installStatus);
	return problem === null
		? { ok: true, detail: `.env matches the plan (${plan.env_entries.length} entries)` }
		: { ok: false, detail: problem };
}

/** Why the written .env is not the plan's, or null. */
function envProblem(plan: PlanFile, env: Readonly<Record<string, string>>): string | null {
	const differing = plan.env_entries
		.filter((entry) => env[entry.key] !== entry.value)
		.map((entry) => entry.key);
	if (differing.length > 0) return `.env differs from the plan: ${differing.join(', ')}`;
	return (env.DEDALO_SALT_STRING ?? '') === '' ? '.env has no DEDALO_SALT_STRING' : null;
}

/** The install statuses a written install config can carry. */
const WRITTEN_STATUSES: ReadonlySet<string> = new Set(['terminal_installing', 'sealed']);

/** Why the install status does not say "config written by an install", or null. */
function statusProblem(installStatus: string | undefined): string | null {
	const status = installStatus ?? 'unset';
	return WRITTEN_STATUSES.has(status) ? null : `install status is ${status}`;
}
