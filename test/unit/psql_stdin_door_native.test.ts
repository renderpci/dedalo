/**
 * THE STDIN DOOR (install/pg_exec.ts runPsqlScript) — its outcomes on the suite
 * database, read-only:
 *  - a statement far past the argv caps (Linux: 128 KiB per string; macOS: 1 MiB for
 *    the whole argv + env) RUNS — with the same text as a `-c` argv element as the
 *    control, which this OS refuses (E2BIG at spawn) or psql never receives;
 *  - a failing statement fails the run (ON_ERROR_STOP: `-f` without it exits 0) and
 *    nothing after it executes;
 *  - text inside a quoted literal reaches the server verbatim (`:name` and `\` there
 *    are data, not psql syntax).
 * The census that keeps src/ on this door: psql_argv_sql_tripwire.
 */

import { describe, expect, test } from 'bun:test';
import { connFromConfig, runPsql, runPsqlScript } from '../../src/core/install/pg_exec.ts';

const conn = connFromConfig();
const PAYLOAD_BYTES = 2 * 1024 * 1024;

describe('runPsqlScript sends SQL on stdin', () => {
	test('a 2 MiB statement runs; the same text in argv does not reach psql', async () => {
		const sql = `SELECT length('${'x'.repeat(PAYLOAD_BYTES)}')`;
		const run = await runPsqlScript(conn, sql, { flags: ['-tA'] });
		expect(run.exitCode, run.stderr).toBe(0);
		expect(run.stdout).toBe(String(PAYLOAD_BYTES));
		// Control: the argv shape this door replaces.
		const control = await runPsql(conn, ['-X', '-tA', '-c', sql]).then(
			(result) => (result.exitCode === 0 ? result.stdout : `exit ${result.exitCode}`),
			(error: unknown) => `refused: ${String(error)}`,
		);
		expect(control).not.toBe(String(PAYLOAD_BYTES));
	}, 30000);

	test('a failing statement fails the run and stops it (ON_ERROR_STOP)', async () => {
		const run = await runPsqlScript(conn, "SELECT 1/0;\nSELECT 'after the failure';", {
			flags: ['-tA'],
		});
		expect(run.exitCode).not.toBe(0);
		expect(run.stderr).toContain('division by zero');
		expect(run.stdout).not.toContain('after the failure');
	});

	test('quoted literals reach the server verbatim', async () => {
		const run = await runPsqlScript(conn, "SELECT ':DBNAME' || $q$ :'USER' \\copy $q$ || '\\x'", {
			flags: ['-tA'],
		});
		expect(run.exitCode, run.stderr).toBe(0);
		expect(run.stdout).toBe(":DBNAME :'USER' \\copy \\x");
	});
});
