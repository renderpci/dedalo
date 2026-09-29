/**
 * ONLINE MIGRATIONS — the grammar of a migration that runs AFTER the listener
 * binds (2026-09-27; runner: migrate.ts `runOnlineMigrations`).
 *
 * WHY A SECOND CLASS. The boot runner (`runMigrations`) is awaited in
 * startServer BEFORE `Bun.serve` binds the socket, and a migration's run is
 * unbounded (statement_timeout = 0). A full-heap `CREATE INDEX` on the time
 * machine (29M rows on a large install: the seq scan alone 4.5-12 s, plus the
 * sort) therefore kept the socket closed for minutes — and the systemd
 * watchdog (deploy/dedalo-ts-watchdog.sh, a 30 s /health probe with no boot
 * grace) read the missing socket as dead: with an update pending it ROLLED THE
 * UPDATE BACK mid-build (the index transaction rolled back with it, so every
 * retry repeated it — the release could never land); with none it restarted
 * the server into the same unrecorded build, forever.
 *
 * An index that only makes readers FASTER (every reader is correct without it)
 * has no reason to hold the listener. Such a file is tagged ONLINE and runs in
 * the background once the server serves: `CREATE INDEX CONCURRENTLY` (no write
 * lock on the live table; outside any transaction, which CONCURRENTLY requires),
 * then `ANALYZE`. A build that dies (a restart mid-build) leaves an INVALID
 * index, which `IF NOT EXISTS` would silently keep forever — the runner drops
 * such a leftover before it retries, and records the file only once every
 * index it names is VALID.
 *
 * THE GRAMMAR (closed — anything else is refused, at run time and by
 * migration_shared_row_tripwire): after `--` comments are stripped, the file is
 * `;`-separated statements, each either
 *   - `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <name> ON …`, or
 *   - `ANALYZE …`.
 * No transaction control, no `SET` (the runner sets the session bounds on its
 * reserved connection), nothing that writes a row.
 *
 * PURE: no DB import, so the hermetic tripwire can read it.
 */

/** The tag an online migration file carries (verbatim, a `--` comment). */
export const ONLINE_MIGRATION_TAG = '-- ONLINE MIGRATION:';

/** One statement of an online migration. */
export type OnlineStatement =
	| { kind: 'create_index'; indexName: string; sql: string }
	| { kind: 'analyze'; sql: string };

const CREATE_INDEX_CONCURRENTLY =
	/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)\s+ON\s+/i;
const ANALYZE = /^ANALYZE\b/i;

/** Whether a migration file's text declares it ONLINE. */
export function isOnlineMigration(content: string): boolean {
	return content.includes(ONLINE_MIGRATION_TAG);
}

/** The text with `--` line comments removed. */
export function stripSqlComments(content: string): string {
	return content.replace(/--[^\n]*/g, '');
}

/**
 * The statements of an online migration, in order. Throws on any statement
 * outside the grammar (see the header) and on a file with none.
 */
export function parseOnlineMigration(file: string, content: string): OnlineStatement[] {
	const statements: OnlineStatement[] = [];
	for (const raw of stripSqlComments(content).split(';')) {
		const text = raw.trim();
		if (text === '') continue;
		const index = CREATE_INDEX_CONCURRENTLY.exec(text);
		if (index !== null) {
			statements.push({ kind: 'create_index', indexName: index[1] as string, sql: text });
		} else if (ANALYZE.test(text)) {
			statements.push({ kind: 'analyze', sql: text });
		} else {
			throw new Error(
				`online migration ${file}: statement outside the grammar (CREATE INDEX CONCURRENTLY IF NOT EXISTS | ANALYZE): ${text.slice(0, 120)}`,
			);
		}
	}
	if (statements.length === 0) throw new Error(`online migration ${file}: no statement`);
	return statements;
}
