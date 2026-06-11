/**
 * DELETE_HANDLER INTEGRATION TESTS
 * delete_records against a real MariaDB: real deletions, missing-table and
 * missing-database tolerance, and partial-failure isolation.
 * Skips cleanly when MariaDB is unreachable (see helper.ts).
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db_available, TEST_DB, create_test_db, drop_test_db, query_test_db, admin_query } from './helper';
import { delete_records } from '../../lib/delete_handler';
import { close_all_pools } from '../../lib/db';

describe.skipIf(!db_available)('delete_handler integration', () => {

	beforeAll(async () => {
		await create_test_db();
		await admin_query(`CREATE TABLE IF NOT EXISTS \`${TEST_DB}\`.it_targets (
			section_id INT NOT NULL,
			lang VARCHAR(8) NOT NULL,
			code TEXT,
			PRIMARY KEY (section_id, lang)
		)`);
		await admin_query(`INSERT INTO \`${TEST_DB}\`.it_targets (section_id, lang, code) VALUES
			(1, 'lg-eng', 'a'), (1, 'lg-spa', 'b'), (2, 'lg-eng', 'c')`);
	});

	afterAll(async () => {
		await drop_test_db();
		await close_all_pools();
	});

	test('deletes all language variants of the requested section_ids', async () => {
		const res = await delete_records([
			{ database_name: TEST_DB, table_name: 'it_targets', section_ids: [1] },
		]);

		expect(res.result).toBe(true);
		expect(res.deleted[0]).toMatchObject({ database_name: TEST_DB, table_name: 'it_targets', affected: 2 });

		const rows = await query_test_db('SELECT COUNT(*) AS n FROM it_targets');
		expect(Number(rows[0].n)).toBe(1); // only section 2 remains
	});

	test('missing table is tolerated as a no-op success (errno 1146)', async () => {
		const res = await delete_records([
			{ database_name: TEST_DB, table_name: 'no_such_table', section_ids: [1] },
		]);

		expect(res.result).toBe(true);
		expect(res.deleted[0]).toMatchObject({ table_name: 'no_such_table', affected: 0 });
	});

	test('missing database is tolerated as a no-op success (errno 1049)', async () => {
		const res = await delete_records([
			{ database_name: 'web_no_such_db_xyz', table_name: 'whatever', section_ids: [1] },
		]);

		expect(res.result).toBe(true);
		expect(res.deleted[0]).toMatchObject({ database_name: 'web_no_such_db_xyz', affected: 0 });

		// drop the pool the call created for the missing database
		await close_all_pools();
	});

	test('multiple targets are processed independently', async () => {
		const res = await delete_records([
			{ database_name: TEST_DB, table_name: 'no_such_table', section_ids: [9] },
			{ database_name: TEST_DB, table_name: 'it_targets', section_ids: [2] },
		]);

		expect(res.result).toBe(true);
		expect(res.deleted).toHaveLength(2);

		const rows = await query_test_db('SELECT COUNT(*) AS n FROM it_targets');
		expect(Number(rows[0].n)).toBe(0);
	});
});
