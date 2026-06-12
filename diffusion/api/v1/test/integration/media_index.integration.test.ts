/**
 * MEDIA_INDEX INTEGRATION TESTS
 * Marker lifecycle against a real MariaDB: delete_records drops markers
 * for targets carrying section_tipo, and rebuild() diff-syncs the store
 * from SELECT DISTINCT section_id (tolerating missing tables/databases).
 * Skips cleanly when MariaDB is unreachable (see helper.ts).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { existsSync, mkdtempSync } from 'fs';
import path from 'path';
import os from 'os';

import { db_available, TEST_DB, create_test_db, drop_test_db, admin_query } from './helper';
import { delete_records } from '../../lib/delete_handler';
import { apply_table_state, rebuild } from '../../lib/media_index';
import { close_all_pools } from '../../lib/db';

let tmp_media_path: string;
let saved_env: string | undefined;

const pub = (key: string) => path.join(tmp_media_path, '.publication', 'pub', key);
const tbl = (db: string, table: string, key: string) => path.join(tmp_media_path, '.publication', 'dbs', db, table, key);

describe.skipIf(!db_available)('media_index integration', () => {

	beforeAll(async () => {
		await create_test_db();
		await admin_query(`CREATE TABLE IF NOT EXISTS \`${TEST_DB}\`.it_media (
			section_id INT NOT NULL,
			lang VARCHAR(8) NOT NULL,
			code TEXT,
			PRIMARY KEY (section_id, lang)
		)`);
		await admin_query(`INSERT INTO \`${TEST_DB}\`.it_media (section_id, lang, code) VALUES
			(1, 'lg-eng', 'a'), (1, 'lg-spa', 'b'), (2, 'lg-eng', 'c')`);
	});

	afterAll(async () => {
		await drop_test_db();
		await close_all_pools();
	});

	beforeEach(() => {
		saved_env = process.env.DEDALO_MEDIA_PATH;
		tmp_media_path = mkdtempSync(path.join(os.tmpdir(), 'dd_media_int_'));
		process.env.DEDALO_MEDIA_PATH = tmp_media_path;
	});

	afterEach(async () => {
		if (saved_env === undefined) {
			delete process.env.DEDALO_MEDIA_PATH;
		} else {
			process.env.DEDALO_MEDIA_PATH = saved_env;
		}
		await fs.rm(tmp_media_path, { recursive: true, force: true });
	});

	test('delete_records removes markers when target carries section_tipo', async () => {
		await apply_table_state(TEST_DB, 'it_media', 'test3', [1, 2], []);
		expect(existsSync(pub('test3_1'))).toBe(true);

		const res = await delete_records([
			{ database_name: TEST_DB, table_name: 'it_media', section_ids: [1], section_tipo: 'test3' },
		]);

		expect(res.result).toBe(true);
		expect(existsSync(pub('test3_1'))).toBe(false);
		expect(existsSync(pub('test3_2'))).toBe(true); // untouched
	});

	test('delete_records without section_tipo keeps markers (back-compat)', async () => {
		await apply_table_state(TEST_DB, 'it_media', 'test3', [2], []);

		const res = await delete_records([
			{ database_name: TEST_DB, table_name: 'it_media', section_ids: [2] },
		]);

		expect(res.result).toBe(true);
		expect(existsSync(pub('test3_2'))).toBe(true); // marker untouched without section_tipo
	});

	test('rebuild diff-syncs markers from the live table', async () => {
		// drift: a stale marker (section 99 not in the table) and no marker
		// for sections 1/2 that ARE published
		await apply_table_state(TEST_DB, 'it_media', 'test3', [99], []);

		const res = await rebuild([
			{ database_name: TEST_DB, table_name: 'it_media', section_tipo: 'test3' },
		]);

		expect(res.result).toBe(true);
		expect(res.markers).toBe(2);
		expect(existsSync(pub('test3_1'))).toBe(true);
		expect(existsSync(pub('test3_2'))).toBe(true);
		expect(existsSync(pub('test3_99'))).toBe(false);
	});

	test('rebuild treats missing table/database as nothing published', async () => {
		await apply_table_state(TEST_DB, 'no_such_table', 'test3', [5], []);
		expect(existsSync(pub('test3_5'))).toBe(true);

		const res = await rebuild([
			{ database_name: TEST_DB, table_name: 'no_such_table', section_tipo: 'test3' },
			{ database_name: 'web_no_such_db_xyz', table_name: 'whatever', section_tipo: 'test3' },
		]);

		expect(res.result).toBe(true);
		expect(existsSync(pub('test3_5'))).toBe(false);

		await close_all_pools();
	});

	test('rebuild removes per-table dirs no longer in the ontology targets', async () => {
		await apply_table_state('web_stale_db', 'old_table', 'test3', [7], []);
		expect(existsSync(pub('test3_7'))).toBe(true);

		const res = await rebuild([
			{ database_name: TEST_DB, table_name: 'it_media', section_tipo: 'test3' },
		]);

		expect(res.result).toBe(true);
		expect(existsSync(tbl('web_stale_db', 'old_table', 'test3_7'))).toBe(false);
		expect(existsSync(pub('test3_7'))).toBe(false);
	});
});
