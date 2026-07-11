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

/** Absolute path (or bare name for PATH resolution) of a pg client binary. */
export function resolvePgBinary(
	name: 'psql' | 'pg_dump' | 'pg_restore' | 'gzip' | 'gunzip',
): string {
	if (name === 'gzip' || name === 'gunzip') return name; // system PATH
	const declared = config.ops.pgBinPath;
	if (typeof declared === 'string' && declared !== '') {
		const candidate = join(declared, name);
		if (existsSync(candidate)) return candidate;
	}
	for (const version of [18, 17, 16, 15]) {
		const candidate = `/opt/homebrew/opt/postgresql@${version}/bin/${name}`;
		if (existsSync(candidate)) return candidate;
	}
	return name;
}

/** True when a psql client can be resolved (config, Homebrew, or PATH). */
export function psqlResolvable(): boolean {
	const resolved = resolvePgBinary('psql');
	if (resolved !== 'psql') return existsSync(resolved);
	// Bare 'psql' → probe PATH with a --version call.
	const probe = Bun.spawnSync(['psql', '--version'], { stdout: 'pipe', stderr: 'pipe' });
	return probe.exitCode === 0;
}
