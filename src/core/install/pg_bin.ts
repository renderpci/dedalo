/**
 * Resolve a PostgreSQL client binary (psql/pg_dump/...) matching the server
 * version — the install twin of backup.ts resolvePgDump (PHP
 * system::get_pg_bin_path): explicit config first, then version-suffixed
 * Homebrew installs newest-first, then PATH. A client older than the server
 * refuses to connect, so newest-first matters on multi-version dev machines.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/config.ts';

/** Homebrew postgresql@<n> formulas probed, NEWEST FIRST (an older client refuses a newer server). */
const HOMEBREW_PG_VERSIONS: readonly number[] = [18, 17, 16, 15];

/**
 * The ordered candidate paths for a pg client binary — configured dir FIRST,
 * then the version-suffixed Homebrew installs newest-first. Pure over its
 * inputs (the caller probes existence in order and falls back to the bare name
 * for PATH resolution), so the ORDER law is gateable without a filesystem.
 */
export function pgBinaryCandidates(name: string, declaredDir: string | undefined): string[] {
	const candidates: string[] = [];
	if (typeof declaredDir === 'string' && declaredDir !== '') {
		candidates.push(join(declaredDir, name));
	}
	for (const version of HOMEBREW_PG_VERSIONS) {
		candidates.push(`/opt/homebrew/opt/postgresql@${version}/bin/${name}`);
	}
	return candidates;
}

/** Absolute path (or bare name for PATH resolution) of a pg client binary. */
export function resolvePgBinary(
	name: 'psql' | 'pg_dump' | 'pg_restore' | 'gzip' | 'gunzip',
): string {
	if (name === 'gzip' || name === 'gunzip') return name; // system PATH
	for (const candidate of pgBinaryCandidates(name, config.ops.pgBinPath)) {
		if (existsSync(candidate)) return candidate;
	}
	return name;
}

/**
 * True when a psql client can be resolved (config, Homebrew, or PATH).
 *
 * COVERAGE-EXEMPT for execution (plan §4.1.9 → §5.1): both arms are probes of
 * THIS machine — an `existsSync` on a resolved path, or a `Bun.spawnSync('psql
 * --version')` — so any assertion compares a probe against the same probe and
 * answers differently on a clone or in CI. The decidable part, the candidate
 * ORDER, is extracted to `pgBinaryCandidates` and gated in
 * test/unit/tier1_install_native.test.ts.
 */
export function psqlResolvable(): boolean {
	const resolved = resolvePgBinary('psql');
	if (resolved !== 'psql') return existsSync(resolved);
	// Bare 'psql' → probe PATH with a --version call.
	const probe = Bun.spawnSync(['psql', '--version'], { stdout: 'pipe', stderr: 'pipe' });
	return probe.exitCode === 0;
}
