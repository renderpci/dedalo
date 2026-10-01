/**
 * REAL custom-format backup bytes for the backup gates (P0-13 / OPS-1 / OPS-2).
 *
 * Every backup gate that asks "can pg_restore see this?" must ask it of REAL
 * archive bytes: the whole finding is that `pg_restore --list` accepts a real
 * archive cut to 60% (the TOC sits at the front) while only a full read
 * disproves it. A hand-made lookalike would prove nothing about that.
 *
 * The archive is `pg_dump -F c -b -t dd_ontology` of the SUITE database (a
 * READ — nothing here writes to Postgres), built with the engine's OWN
 * `resolvePgDump()` so that on a host with several majors the dump and the
 * `resolvePgRestore()` that later reads it walk the same candidate order.
 * Measured 2026-08-30: ~0.2 s, ~842 KB, 51 TOC entries.
 *
 * Callers gate their real-bytes legs at COLLECTION time
 * (`describe.if(archive.path !== null && pgRestore !== null)`), never with an
 * early return inside a body (S2-40: a returning body reports a PASS having
 * asserted nothing).
 */

import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { resolvePgDump } from '../../src/core/area_maintenance/backup.ts';

/**
 * The table the archive is cut from. `dd_ontology` is the one table every
 * Dédalo database has by definition, and it carries enough rows that a 60% cut
 * lands in the DATA blocks, past the header and TOC.
 */
export const SOURCE_TABLE = 'dd_ontology';

/** Below this, a 60% cut is not guaranteed to land past the TOC. */
export const MIN_ARCHIVE_BYTES = 64 * 1024;

export interface RealArchive {
	/** The archive path, or null when it could not be built. */
	path: string | null;
	/** Its size, or why it is missing. */
	note: string;
}

/** A REAL custom-format archive of `SOURCE_TABLE` written into `dir`. */
export function buildRealArchive(dir: string): RealArchive {
	const out = join(dir, 'source.custom.backup');
	const result = Bun.spawnSync(
		[
			resolvePgDump(),
			'-h',
			config.db.host,
			'-p',
			String(config.db.port),
			'-U',
			config.db.user,
			'-F',
			'c',
			'-b',
			'-t',
			SOURCE_TABLE,
			'-f',
			out,
			config.db.database,
		],
		{
			stdout: 'ignore',
			stderr: 'pipe',
			env: {
				...(process.env as Record<string, string>),
				...(config.db.password !== '' ? { PGPASSWORD: config.db.password } : {}),
			},
		},
	);
	const stderr = new TextDecoder().decode(result.stderr ?? new Uint8Array()).trim();
	if (result.exitCode !== 0) return { path: null, note: `pg_dump failed: ${stderr}` };
	let size = 0;
	try {
		size = statSync(out).size;
	} catch {
		return { path: null, note: 'pg_dump wrote no file' };
	}
	if (size < MIN_ARCHIVE_BYTES) {
		return {
			path: null,
			note: `the ${SOURCE_TABLE} archive is only ${size} bytes — build the suite database (bun run test:db:setup) so a 60% cut lands in the data blocks`,
		};
	}
	return { path: out, note: `${size} bytes` };
}

/** The first `fraction` of `source` written to `target` — a real prefix, never an invention. */
export function truncatedCopy(source: string, target: string, fraction: number): void {
	const bytes = readFileSync(source);
	writeFileSync(target, bytes.subarray(0, Math.floor(bytes.length * fraction)));
}

/** Push a file's mtime `minutes` into the past (out of the in-progress window). */
export function ageMinutes(filePath: string, minutes: number): void {
	const when = new Date(Date.now() - minutes * 60_000);
	utimesSync(filePath, when, when);
}
