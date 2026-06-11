/**
 * DB_ADMIN INTEGRATION TESTS
 * check_database_exists and backup_database (mysqldump) against a real
 * MariaDB. Skips cleanly when MariaDB is unreachable; the backup test
 * additionally skips when mysqldump is not installed.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { db_available, TEST_DB, create_test_db, drop_test_db, admin_query } from './helper';
import { check_database_exists, backup_database } from '../../lib/db_admin';

const mysqldump_available = Bun.which(process.env.MYSQLDUMP_BIN || 'mysqldump') !== null;
const BACKUP_FILE = `/tmp/it_diffusion_backup_${process.pid}.sql`;

describe.skipIf(!db_available)('db_admin integration', () => {

	beforeAll(async () => {
		await create_test_db();
		await admin_query(`CREATE TABLE IF NOT EXISTS \`${TEST_DB}\`.it_backup_probe (id INT PRIMARY KEY)`);
	});

	afterAll(async () => {
		await drop_test_db();
		try { unlinkSync(BACKUP_FILE); } catch { /* ignore */ }
	});

	test('check_database_exists: true for existing database', async () => {
		const res = await check_database_exists(TEST_DB);
		expect(res.result).toBe(true);
		expect(res.exists).toBe(true);
	});

	test('check_database_exists: false for missing database (server reachable)', async () => {
		const res = await check_database_exists('web_no_such_db_xyz');
		expect(res.result).toBe(true);  // server reachable
		expect(res.exists).toBe(false); // database missing
	});

	test.skipIf(!mysqldump_available)('backup_database dumps the test database', async () => {
		const res = await backup_database(TEST_DB, BACKUP_FILE);

		expect(res.result).toBe(true);
		expect(res.file_exists).toBe(true);
		expect(res.file_size).toBeGreaterThan(0);
		expect(existsSync(BACKUP_FILE)).toBe(true);

		const content = readFileSync(BACKUP_FILE, 'utf8');
		expect(content).toContain('it_backup_probe');
	});
});
