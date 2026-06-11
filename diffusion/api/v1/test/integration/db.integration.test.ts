/**
 * DB INTEGRATION TESTS
 * insert_table_data against a real MariaDB: table creation, composite key
 * upserts, multi-lang rows, schema growth (ALTER), deletions and
 * transaction atomicity.
 * Skips cleanly when MariaDB is unreachable (see helper.ts).
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db_available, TEST_DB, create_test_db, drop_test_db, query_test_db } from './helper';
import { insert_table_data, close_all_pools } from '../../lib/db';
import type { processed_table, context_field } from '../../lib/types';

const text_ctx = (term: string): context_field => ({
	term, tipo: 't_' + term, model: 'field_text', parent: 'p1', parser: {},
});

function make_table(records: processed_table['records'], deletions: processed_table['deletions'] = []): processed_table {
	return {
		database_name: TEST_DB,
		table_name: 'it_interview',
		records,
		deletions,
		columns_context: { code: text_ctx('code'), title: text_ctx('title') },
	};
}

describe.skipIf(!db_available)('db.ts integration', () => {

	beforeAll(async () => {
		await create_test_db();
	});

	afterAll(async () => {
		await drop_test_db();
		await close_all_pools();
	});

	test('creates the table with composite key and inserts multi-lang rows', async () => {
		const affected = await insert_table_data(make_table([
			{ section_id: 1, lang: 'lg-eng', columns: { code: 'C-1', title: 'Hello' } },
			{ section_id: 1, lang: 'lg-spa', columns: { code: 'C-1', title: 'Hola' } },
		]));

		expect(affected).toBeGreaterThanOrEqual(2);

		const rows = await query_test_db('SELECT section_id, lang, code, title FROM it_interview ORDER BY lang');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ lang: 'lg-eng', code: 'C-1', title: 'Hello' });
		expect(rows[1]).toMatchObject({ lang: 'lg-spa', code: 'C-1', title: 'Hola' });

		// composite primary key (section_id, lang)
		const keys = await query_test_db(
			`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
			 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'it_interview' AND CONSTRAINT_NAME = 'PRIMARY'
			 ORDER BY ORDINAL_POSITION`,
			[TEST_DB]
		);
		expect(keys.map(k => k.COLUMN_NAME)).toEqual(['section_id', 'lang']);
	});

	test('re-running upserts updates values without duplicating rows', async () => {
		await insert_table_data(make_table([
			{ section_id: 1, lang: 'lg-eng', columns: { code: 'C-1-v2', title: 'Hello v2' } },
		]));

		const rows = await query_test_db('SELECT COUNT(*) AS n FROM it_interview WHERE section_id = 1');
		expect(Number(rows[0].n)).toBe(2); // still eng + spa

		const eng = await query_test_db("SELECT code, title FROM it_interview WHERE section_id = 1 AND lang = 'lg-eng'");
		expect(eng[0]).toMatchObject({ code: 'C-1-v2', title: 'Hello v2' });
	});

	test('schema grows when a new column appears (ALTER TABLE ADD)', async () => {
		const table = make_table([
			{ section_id: 2, lang: 'lg-eng', columns: { code: 'C-2', title: 'T2', notes: 'extra column' } },
		]);
		table.columns_context.notes = text_ctx('notes');

		await insert_table_data(table);

		const rows = await query_test_db('SELECT notes FROM it_interview WHERE section_id = 2');
		expect(rows[0].notes).toBe('extra column');
	});

	test('deletions remove every language variant of the section_id', async () => {
		const affected = await insert_table_data(make_table([], [1]));
		expect(affected).toBe(2); // eng + spa rows of section 1

		const rows = await query_test_db('SELECT COUNT(*) AS n FROM it_interview WHERE section_id = 1');
		expect(Number(rows[0].n)).toBe(0);
	});

	test('a poisoned record rolls back the whole table transaction', async () => {
		const before = await query_test_db('SELECT COUNT(*) AS n FROM it_interview');

		const table = make_table([
			{ section_id: 3, lang: 'lg-eng', columns: { code: 'C-3', title: 'ok' } },
			// poisoned: column name that breaks ALTER/INSERT identifier limits
			{ section_id: 4, lang: 'lg-eng', columns: { code: 'C-4', ['x'.repeat(100)]: 'boom' } },
		]);

		await expect(insert_table_data(table)).rejects.toThrow();

		// section 3 must NOT have been committed (atomic per-table transaction)
		const after = await query_test_db('SELECT COUNT(*) AS n FROM it_interview');
		expect(Number(after[0].n)).toBe(Number(before[0].n));
	});
});
