/**
 * SQL_GENERATOR EXTRA TESTS
 * Upsert statement shapes and identifier escaping (CREATE/ALTER coverage
 * lives in sql_generation.test.ts; DELETE coverage in delete_record.test.ts).
 */

import { describe, test, expect } from 'bun:test';
import { generate_upsert, generate_batch_upsert, escape_identifier } from '../lib/sql_generator';
import type { processed_record, processed_table } from '../lib/types';

describe('generate_upsert', () => {

	test('builds parameterized INSERT ... ON DUPLICATE KEY UPDATE', () => {
		const record: processed_record = {
			section_id: 12,
			lang: 'lg-eng',
			columns: { code: 'C-1', title: 'Hello' },
		};
		const stmt = generate_upsert('interview', record);

		expect(stmt.sql).toContain('INSERT INTO `interview` (section_id, lang, `code`, `title`)');
		expect(stmt.sql).toContain('VALUES (?, ?, ?, ?)');
		expect(stmt.sql).toContain('ON DUPLICATE KEY UPDATE');
		expect(stmt.sql).toContain('`code` = VALUES(`code`)');
		expect(stmt.params).toEqual([12, 'lg-eng', 'C-1', 'Hello']);
	});

	test('uses INSERT IGNORE when there are no data columns', () => {
		const record: processed_record = { section_id: 1, lang: 'lg-eng', columns: {} };
		const stmt = generate_upsert('interview', record);

		expect(stmt.sql).toContain('INSERT IGNORE INTO `interview`');
		expect(stmt.sql).not.toContain('ON DUPLICATE KEY UPDATE');
	});

	test('null column values are preserved as parameters', () => {
		const record: processed_record = { section_id: 1, lang: 'lg-eng', columns: { code: null } };
		const stmt = generate_upsert('interview', record);

		expect(stmt.params).toEqual([1, 'lg-eng', null]);
	});
});

describe('generate_batch_upsert', () => {

	test('one statement per record', () => {
		const table: processed_table = {
			database_name: 'web_test',
			table_name: 'interview',
			section_tipo: 'test3',
			records: [
				{ section_id: 1, lang: 'lg-eng', columns: { code: 'a' } },
				{ section_id: 1, lang: 'lg-spa', columns: { code: 'b' } },
				{ section_id: 2, lang: 'lg-eng', columns: { code: 'c' } },
			],
			deletions: [],
			columns_context: {},
		};

		const statements = generate_batch_upsert(table);
		expect(statements).toHaveLength(3);
		for (const stmt of statements) {
			expect(stmt.sql).toContain('INSERT INTO `interview`');
		}
	});
});

describe('escape_identifier', () => {

	test('wraps in backticks and escapes embedded backticks', () => {
		expect(escape_identifier('plain')).toBe('`plain`');
		expect(escape_identifier('weird`name')).toBe('`weird``name`');
	});
});
