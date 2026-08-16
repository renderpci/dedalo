/**
 * Ordered schema migrations for TS-OWNED tables (audit S2-39, DEC-17 item 7).
 *
 * Scope: ONLY the `dedalo_ts_*` operational tables this server owns (job
 * queue, locks, session mirrors, future additions). The shared matrix/
 * dd_ontology schema is provisioned by the PHP installer during coexistence —
 * a TS-only matrix provisioning path is a documented CUTOVER blocker
 * (engineering/PRODUCTION.md §Schema; DEC-17/DEC-19), not this runner's job.
 *
 * ONE NAMED EXCEPTION — a "seed-defect correction on shared rows" (2026-08-16,
 * first instance 0004_dd560_drop_view_tree.sql). A shipped seed can carry a
 * data mistake that every install inherits; correcting it belongs to the
 * install lane, not to a user edit, so such a file may UPDATE `matrix_*` /
 * `dd_ontology*` rows under FOUR constraints, mechanically gated by
 * test/unit/migration_shared_row_tripwire.test.ts:
 *   1. an UPDATE only — never INSERT / DELETE / TRUNCATE / ALTER / DROP /
 *      CREATE on a shared table (a seed ships through the ontology, a purge is
 *      a tool, a schema change is the installer's);
 *   2. the file carries the tag comment `-- SHARED-ROW SEED CORRECTION:` with
 *      its reason (the gate requires the literal);
 *   3. every such UPDATE pins its WHERE with a jsonb `@>` containment on the
 *      EXACT defective value, so a row an operator has since changed — or
 *      already fixed — is never overwritten (single row / single record);
 *   4. NO TM audit row, by design: this is an install-level correction whose
 *      operator-facing record is the version table itself, not a user write.
 *      The ordinary write law (save_component.ts, tx + TM) is not weakened —
 *      it simply does not apply to a seed correction.
 * Anything outside that shape is not a migration: it goes through
 * db/matrix_write.ts / ontology/ontology_write.ts like every other write.
 *
 * Model (boring on purpose):
 * - migrations/ holds numbered files `NNNN_name.sql`, applied in filename
 *   order inside one transaction each;
 * - the version table records every applied filename; re-runs skip them
 *   (boot is idempotent);
 * - a failed migration ABORTS the run (later files must not leapfrog a hole)
 *   but the caller (startServer) logs and continues serving — the lazy
 *   CREATE IF NOT EXISTS bootstraps in each subsystem remain the fallback.
 *
 * Evolving a TS-owned table = append a new numbered .sql here. Never edit an
 * applied file (the version table records names, not hashes — editing history
 * silently diverges installs).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';

/** The in-repo migrations directory (this file's sibling). */
export const MIGRATIONS_DIR = resolve(import.meta.dir, 'migrations');

/** Default version table (dedalo_ts_* prefix like every TS-owned table). */
export const MIGRATIONS_VERSION_TABLE = 'dedalo_ts_schema_migrations';

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

export interface MigrationRunResult {
	/** Filenames applied by THIS run, in order. */
	applied: string[];
	/** Count of already-recorded files skipped. */
	skipped: number;
}

/**
 * Apply all pending migrations in filename order. `dir`/`versionTable` are
 * injectable for tests (scratch `dedalo_ts_test_*` table + temp dir); the
 * production caller uses the defaults.
 */
export async function runMigrations(options?: {
	dir?: string;
	versionTable?: string;
}): Promise<MigrationRunResult> {
	const dir = options?.dir ?? MIGRATIONS_DIR;
	const versionTable = options?.versionTable ?? MIGRATIONS_VERSION_TABLE;
	if (!TABLE_NAME_PATTERN.test(versionTable)) {
		throw new Error(`runMigrations: invalid version table name '${versionTable}'`);
	}
	if (!existsSync(dir)) {
		return { applied: [], skipped: 0 };
	}
	const files = readdirSync(dir)
		.filter((name) => MIGRATION_FILE_PATTERN.test(name))
		.sort();

	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${versionTable}" (
			version    text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`,
		[],
	);
	const rows = (await sql.unsafe(`SELECT version FROM "${versionTable}"`, [])) as {
		version: string;
	}[];
	const alreadyApplied = new Set(rows.map((row) => row.version));

	const applied: string[] = [];
	let skipped = 0;
	for (const file of files) {
		if (alreadyApplied.has(file)) {
			skipped += 1;
			continue;
		}
		const content = await Bun.file(join(dir, file)).text();
		// One transaction per migration: the DDL and its version record land
		// together or not at all — a crash mid-file never records a half-applied
		// migration (and never skips a failed one on the next boot).
		await withTransaction(async () => {
			await sql.unsafe(content, []);
			await sql.unsafe(`INSERT INTO "${versionTable}" (version) VALUES ($1)`, [file]);
		});
		applied.push(file);
		console.log(`[migrations] applied ${file}`);
	}
	return { applied, skipped };
}

/** The startServer entry point: defaults only. */
export function runBootMigrations(): Promise<MigrationRunResult> {
	return runMigrations();
}
