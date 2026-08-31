#!/usr/bin/env bun
/**
 * RUN THE CI TIERS THE WAY THE RUNNER RUNS THEM — here, before pushing.
 *
 * WHY THIS EXISTS. `scripts/verify.ts` proves the code works ON YOUR MACHINE: with
 * ../private/.env loaded, your Postgres, your libc. The hosted tiers run with none of
 * that — `scripts/ci/db_tier.sh` composes its whole environment in-process precisely so
 * nothing is inherited, and there is no ../private/.env on a runner at all. Nothing
 * executed the tiers that way locally, so the RUNNER was the first place the code ever
 * met the runner's environment, and CI became the debugger: ~10 minutes and a pasted log
 * per iteration.
 *
 * MEASURED COST OF NOT HAVING THIS (2026-08-31): twelve defects in one day, every one
 * invisible to `verify` and guaranteed to be found by a runner and only by a runner —
 * an unset egress allowlist, an anti-vacuity probe that required the private file, the
 * parity census addressing a database nobody builds, eight config keys the tier never
 * composed, a BSD-only `gzcat`, an nginx gate that bound :80, a suite database that
 * inherited the host's collation. Four of those are caught by this script on a Mac; the
 * platform-bound ones need `--docker` (see below), which is the same script one layer
 * down.
 *
 * WHAT IT DOES NOT DO. It does not replace `verify` — that is the developer-environment
 * gate and stays. This is the OTHER environment, and both matter.
 *
 * THE ONE THING IT BORROWS FROM ../private/.env is the Postgres CONNECTION (host, port,
 * user, password) — never any application config. A runner is handed a database by its
 * service container; you are handed one by your machine. That is a fact about where
 * Postgres lives, not about how the engine is configured, and it is the only reason this
 * script reads that file at all. Every DEDALO_* key the tiers need, they compose
 * themselves — which is exactly the property under test.
 *
 * Usage:
 *   bun run ci:local              # both tiers, as CI runs them
 *   bun run ci:local --hermetic   # typecheck + lint + static tripwires + daemon packages
 *   bun run ci:local --db         # suite DB build + DB tripwires + unit tier + parity
 *   bun run ci:local --keep       # leave the scratch private dir on disk for inspection
 *
 * The db tier DROPS AND REBUILDS its own suite database (`dedalo_ci_test`, derived from
 * the tier's own DB_NAME). It is distinct from the one `bun run test:db:setup` builds for
 * you, so your suite database is not disturbed.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..');

/** The tiers, in the order a push runs them. */
const TIERS = [
	{ id: 'hermetic', script: 'scripts/ci/hermetic.sh', flag: '--hermetic' },
	{ id: 'db', script: 'scripts/ci/db_tier.sh', flag: '--db' },
] as const;

/**
 * The Postgres connection, and NOTHING else, out of ../private/.env.
 *
 * Parsed with the same minimal grammar `src/config/env.ts` uses rather than importing it:
 * importing the config layer would load the developer's whole configuration, which is the
 * one thing this script exists to withhold from the tiers.
 */
function connectionFromPrivateEnv(): Record<string, string> {
	const CONNECTION_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'] as const;
	const path = join(REPO_ROOT, '..', 'private', '.env');
	if (!existsSync(path)) return {};
	const found: Record<string, string> = {};
	for (const raw of readFileSync(path, 'utf8').split('\n')) {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		if (!(CONNECTION_KEYS as readonly string[]).includes(key)) continue;
		found[key] = line
			.slice(eq + 1)
			.trim()
			.replace(/^(['"])(.*)\1$/, '$2');
	}
	return found;
}

/**
 * Where the Postgres CLIENT binaries live. `db_tier.sh` defaults this to the Debian path
 * its runner has; on any other host that directory does not exist and `pg_dump` cannot be
 * resolved, so the suite build dies before it starts. Derived from the psql on PATH.
 */
function pgBinPath(): string | undefined {
	const which = Bun.spawnSync(['which', 'pg_dump'], { stdout: 'pipe', stderr: 'ignore' });
	const found = which.stdout.toString().trim();
	return found === '' ? undefined : dirname(found);
}

function main(): void {
	const args = new Set(process.argv.slice(2));
	if (args.has('--help') || args.has('-h')) {
		console.log(
			'bun run ci:local [--hermetic] [--db] [--keep]\n\n' +
				'Runs the CI tiers with the environment a RUNNER has: no ../private/.env, every\n' +
				'DEDALO_* key composed by the tier itself. Only the Postgres connection is taken\n' +
				'from your machine. Default: both tiers.',
		);
		process.exit(0);
	}

	const selected = TIERS.filter((tier) => args.has(tier.flag));
	const tiers = selected.length > 0 ? selected : TIERS;

	// THE RUNNER'S CONDITION, made real: an EMPTY directory where ../private would be.
	// Not a missing path — `db_tier.sh` does `mkdir -p ../private` itself, so a runner has
	// the directory and not the file. Reproducing the file's absence is the point; a
	// missing directory would test something else.
	const privateDir = mkdtempSync(join(tmpdir(), 'dedalo-ci-local-private-'));

	const connection = connectionFromPrivateEnv();
	const missing = ['DB_HOST', 'DB_USER'].filter(
		(key) => process.env[key] === undefined && connection[key] === undefined,
	);
	if (missing.length > 0) {
		console.error(
			`ci:local: no Postgres connection. ${missing.join(' and ')} is neither in your environment nor in ../private/.env.\n` +
				'A runner is handed a database by its service container; this script needs to be told where yours is.',
		);
		rmSync(privateDir, { recursive: true, force: true });
		process.exit(2);
	}

	const binPath = process.env.DEDALO_PG_BIN_PATH ?? pgBinPath();
	const env: Record<string, string | undefined> = {
		...process.env,
		...connection,
		// The caller's explicit values still win over the file's.
		...Object.fromEntries(
			['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']
				.filter((key) => process.env[key] !== undefined)
				.map((key) => [key, process.env[key]]),
		),
		DEDALO_PRIVATE_DIR: privateDir,
		...(binPath === undefined ? {} : { DEDALO_PG_BIN_PATH: binPath }),
	};

	console.log(`== ci:local: private dir ${privateDir} (empty — the runner's condition)`);
	console.log(`== ci:local: tiers ${tiers.map((tier) => tier.id).join(', ')}`);
	if (binPath !== undefined) console.log(`== ci:local: pg client ${binPath}`);

	const verdicts: { id: string; code: number }[] = [];
	for (const tier of tiers) {
		console.log(`\n══════ ${tier.id} ══════`);
		const proc = Bun.spawnSync(['bash', tier.script], {
			cwd: REPO_ROOT,
			env,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		verdicts.push({ id: tier.id, code: proc.exitCode ?? 1 });
	}

	if (args.has('--keep')) console.log(`\n== ci:local: kept ${privateDir}`);
	else rmSync(privateDir, { recursive: true, force: true });

	console.log('\n── CI:LOCAL SUMMARY ──');
	for (const verdict of verdicts) {
		console.log(`  ${verdict.code === 0 ? '✓' : '✗'} ${verdict.id}`);
	}
	const failed = verdicts.filter((verdict) => verdict.code !== 0);
	if (failed.length > 0) {
		console.log(
			`\nCI:LOCAL RED — ${failed.map((verdict) => verdict.id).join(', ')}. This is what the runner will say.`,
		);
		process.exit(1);
	}
	console.log('\nCI:LOCAL GREEN');
}

main();
