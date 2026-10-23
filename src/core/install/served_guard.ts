/**
 * THE UNSERVED PROOF (campaign 3 C3-11) — what lets a host route's --abort take
 * apart an install whose engine steps COMPLETED (sealed) but whose instance
 * never started serving, without ever weakening "a served instance is never
 * undone" (executor.ts assertAbortable, critique B3).
 *
 * Two independent halves must agree before a sealed install is undone:
 *  - the HOST attests it: the step that first starts the instance as a server
 *    (host_first_boot / stack_up) never started (`created.served` — the host
 *    executor);
 *  - the DATABASE proves it: its rows are exactly the ones the install left
 *    when it sealed. The fingerprint is, for every table, its row count and
 *    the newest row version (`max(xmin)`): any insert, update or delete a
 *    server made — a login's activity row, a saved record and its Time
 *    Machine row, a boot migration — changes it. Taken after the install's own
 *    root login, so the install's last write is inside it.
 *
 * READ-ONLY: one SELECT through the psql channel (pg_exec.ts runPsql — no pool,
 * no write shape). A fingerprint that cannot be taken is null, and null never
 * equals anything: the abort is refused.
 */

import { type DbConnDescriptor, runPsqlScript } from './pg_exec.ts';

/**
 * md5 over `<schema.table>:<count>/<max xmin>` of every table outside the
 * system schemas, in name order. `query_to_xml` runs the per-table SELECT
 * server-side, so one statement covers a table list nobody hard-codes.
 */
export const FINGERPRINT_SQL = `SELECT md5(coalesce(string_agg(t.rel || ':' || (xpath('/row/f/text()', query_to_xml(format('SELECT count(*) || ''/'' || coalesce(max(xmin::text::bigint), 0) AS f FROM %s', t.rel), false, true, '')))[1]::text, ',' ORDER BY t.rel), ''))
FROM (SELECT format('%I.%I', schemaname, tablename) AS rel FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) t`;

/** The database's row fingerprint, or null when it could not be taken. */
export async function databaseFingerprint(conn: DbConnDescriptor): Promise<string | null> {
	const run = await runPsqlScript(conn, FINGERPRINT_SQL, { flags: ['-tA'] });
	const value = run.stdout.trim();
	return run.exitCode === 0 && /^[0-9a-f]{32}$/.test(value) ? value : null;
}

/**
 * Why a sealed install may NOT be undone as unserved, or null when it may: the
 * install must have recorded its fingerprint, and the database must still
 * answer exactly it.
 */
export function unservedRefusal(
	recorded: string | null | undefined,
	now: string | null,
): string | null {
	if (recorded === null || recorded === undefined) {
		return 'this install recorded no fingerprint of its database when it sealed — it cannot prove the instance never served';
	}
	if (now === null)
		return 'the database could not be fingerprinted — nothing proves the instance never served';
	return now === recorded
		? null
		: 'the database changed since the install sealed it — the instance has served (or someone wrote to it)';
}
