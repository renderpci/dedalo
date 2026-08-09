/**
 * ITEM 3.10a PART 2 — optimizeTables (src/core/db/db_assets.ts).
 *
 * This is the maintenance panel's destructive door: it interpolates the table
 * name into REINDEX/VACUUM sentences (there is no bind for an identifier) and
 * it is the ONLY non-dry-run caller of pruneMatrixIndexes, which DROPs indexes.
 * The gate therefore pins the validation ladder (name regex, then the public
 * BASE TABLE existence filter) and the exact response shape the widget renders.
 *
 * Scratch discipline: the only real table driven here is `matrix_test`, the
 * test playground's own table — REINDEX CONCURRENTLY + VACUUM ANALYZE on it are
 * non-destructive maintenance and leave no rows behind, so there is nothing to
 * clean up. A POLICY-GOVERNED table (matrix_activity, matrix_time_machine) is
 * NEVER passed: that would really drop indexes on this database.
 *
 * Honest scope: the 'REINDEX\n' / 'VACUUM\n' values are HARDCODED string
 * literals (a psql command-tag echo kept for PHP wire shape). They do NOT
 * detect a dropped runWithoutStatementTimeout wrapper, a reordered loop, or a
 * sentence that was never sent — only that the call did not throw.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { optimizeTables } from '../../src/core/db/db_assets.ts';
import { policyForTable } from '../../src/core/db/matrix_index_policy.ts';
import { sql } from '../../src/core/db/postgres.ts';

const SAFE_TABLE = 'matrix_test';

describe('optimizeTables validation ladder (nothing runs)', () => {
	test('matrix_test is NOT policy-governed — this suite can never trigger a real index drop', () => {
		expect(policyForTable(SAFE_TABLE)).toBeUndefined();
	});

	test('an injection attempt is refused by the name format regex, before any statement', async () => {
		const response = await optimizeTables([`${SAFE_TABLE}; DROP TABLE ${SAFE_TABLE}`]);
		expect(response.result).toBe(false);
		expect(response.reindex).toEqual({});
		expect(response.vacuum).toEqual({});
		expect(response.prune).toEqual({});
		expect(response.errors).toContain(
			`Invalid table name format: ${SAFE_TABLE}; DROP TABLE ${SAFE_TABLE}`,
		);
		expect(response.errors).toContain('No valid tables to optimize');
		// and the table is still there
		const rows = (await sql.unsafe(
			`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
			[SAFE_TABLE],
		)) as unknown[];
		expect(rows.length).toBe(1);
	});

	test('a VIEW is refused as non-existent — the BASE TABLE filter, not the name regex, is what stops it', async () => {
		// pg_stat_activity passes the name regex and IS a relation; only the
		// `table_type = 'BASE TABLE'` bound in tableExists refuses it.
		const response = await optimizeTables(['pg_stat_activity']);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('Table does not exist: pg_stat_activity');
		expect(response.reindex).toEqual({});
		expect(response.vacuum).toEqual({});
	});

	test('empty string + a non-string produce one error each, plus the no-valid-tables error', async () => {
		const response = await optimizeTables(['', 42 as unknown as string]);
		expect(response.result).toBe(false);
		expect(response.errors.length).toBe(3);
		expect(response.errors).toEqual([
			'Invalid table name: ',
			'Invalid table name: 42',
			'No valid tables to optimize',
		]);
		expect(response.msg).toBe('Error. Request failed');
		// NOTE (pinned, not a claim about the early return): removing the
		// zero-length early return would yield result TRUE + 'Warning. Request
		// done with errors', never 'optimized 0 table(s)'. The msg above is what
		// distinguishes the two.
	});
});

describe('optimizeTables live run on the test playground table', () => {
	test('a single valid table reindexes + vacuums, prunes nothing, and reports the success count', async () => {
		const response = await optimizeTables([SAFE_TABLE]);
		expect(response.result).toBe(true);
		expect(response.errors).toEqual([]);
		expect(response.reindex[SAFE_TABLE]).toBe('REINDEX\n');
		expect(response.vacuum[SAFE_TABLE]).toBe('VACUUM\n');
		// not a governed log table → pruneMatrixIndexes returns null → no key
		expect(Object.hasOwn(response.prune, SAFE_TABLE)).toBe(false);
		expect(response.msg).toBe('Successfully optimized 1 table(s)');
	});

	test('one valid + one malformed table still runs the valid one, and downgrades the msg to a warning', async () => {
		const response = await optimizeTables([SAFE_TABLE, 'bad name!']);
		expect(response.result).toBe(true);
		expect(response.errors).toContain('Invalid table name format: bad name!');
		expect(response.reindex[SAFE_TABLE]).toBe('REINDEX\n');
		expect(response.vacuum[SAFE_TABLE]).toBe('VACUUM\n');
		expect(response.vacuum['bad name!']).toBeUndefined();
		expect(response.msg).toBe('Warning. Request done with errors');
	});

	test('dryRun executes nothing: no reindex/vacuum entries, validation and msg unchanged', async () => {
		const response = await optimizeTables([SAFE_TABLE], { dryRun: true });
		expect(response.result).toBe(true);
		expect(response.errors).toEqual([]);
		// empty maps ARE the "nothing was done" signal — the destructive half has
		// no other preview
		expect(response.reindex).toEqual({});
		expect(response.vacuum).toEqual({});
		expect(response.prune).toEqual({}); // ungoverned table: classified, no report
		expect(response.msg).toBe('Successfully optimized 1 table(s)');
	});
});

describe('dryRun rewire', () => {
	test('optimizeTables forwards dryRun to pruneMatrixIndexes and gates both sentence loops', () => {
		const source = readFileSync(join(import.meta.dir, '../../src/core/db/db_assets.ts'), 'utf-8');
		const body = source.split('export async function optimizeTables')[1] ?? '';
		expect(body).toContain('pruneMatrixIndexes(table, { dryRun })');
		// the destructive loops must be driven by the gated list, not validTables
		expect(body).not.toContain(
			'for (const table of validTables) {\n\t\ttry {\n\t\t\tawait runWithoutStatementTimeout',
		);
		expect(body).toContain('for (const table of dryRun ? [] : validTables)');
	});

	test('the database_info widget passes the flag through (strict === true opt-in)', () => {
		const widget = readFileSync(
			join(import.meta.dir, '../../src/core/area_maintenance/widgets/database_info.ts'),
			'utf-8',
		);
		expect(widget).toContain('const dryRun = options.dry_run === true;');
		expect(widget).toContain('optimizeTables(tables as string[], { dryRun })');
		// quirk: pinned, not fixed — the widget's other options are untyped
		// client input, so only a real boolean true previews; 'true' as a string
		// still runs the destructive path.
	});
});
