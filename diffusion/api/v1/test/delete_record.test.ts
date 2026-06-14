import { expect, test, describe } from "bun:test";
import { validate_delete_targets } from "../lib/delete_handler";
import { check_internal_token } from "../lib/auth";
import { generate_delete } from "../lib/sql_generator";

describe('delete_record validation', () => {

	test('rejects missing or empty targets', () => {
		expect(validate_delete_targets(undefined)).not.toBeNull();
		expect(validate_delete_targets(null)).not.toBeNull();
		expect(validate_delete_targets([])).not.toBeNull();
		expect(validate_delete_targets('not an array')).not.toBeNull();
	});

	test('rejects targets with missing fields', () => {
		expect(validate_delete_targets([
			{ table_name: 'interview', section_ids: [1] }
		])).not.toBeNull(); // missing database_name

		expect(validate_delete_targets([
			{ database_name: 'web_dedalo', section_ids: [1] }
		])).not.toBeNull(); // missing table_name

		expect(validate_delete_targets([
			{ database_name: 'web_dedalo', table_name: 'interview', section_ids: [] }
		])).not.toBeNull(); // empty section_ids

		expect(validate_delete_targets([
			{ database_name: 'web_dedalo', table_name: 'interview', section_ids: [{}] }
		])).not.toBeNull(); // bad section_id type
	});

	test('accepts valid targets', () => {
		expect(validate_delete_targets([
			{ database_name: 'web_dedalo', table_name: 'interview', section_ids: [1, '2'] },
			{ database_name: 'web_other',  table_name: 'informant', section_ids: [3] }
		])).toBeNull();
	});
});

describe('delete_record SQL shape', () => {

	test('generates parameterized DELETE for section_ids', () => {
		const stmt = generate_delete('interview', [101, '102', 103]);

		expect(stmt.sql).toBe('DELETE FROM `interview` WHERE section_id IN (?, ?, ?)');
		expect(stmt.params).toEqual(['101', '102', '103']);
	});

	test('escapes table name identifiers', () => {
		const stmt = generate_delete('weird`table', [1]);

		expect(stmt.sql).toContain('`weird``table`');
	});
});

describe('delete_record internal token auth', () => {

	test('rejects token when env var is unset or empty', () => {
		const prev = process.env.DIFFUSION_INTERNAL_TOKEN;
		delete process.env.DIFFUSION_INTERNAL_TOKEN;

		expect(check_internal_token('any-token')).toBe(false);
		expect(check_internal_token(null)).toBe(false);

		process.env.DIFFUSION_INTERNAL_TOKEN = '';
		expect(check_internal_token('any-token')).toBe(false);

		if (prev !== undefined) process.env.DIFFUSION_INTERNAL_TOKEN = prev;
		else delete process.env.DIFFUSION_INTERNAL_TOKEN;
	});

	test('rejects wrong token and accepts matching token', () => {
		const prev = process.env.DIFFUSION_INTERNAL_TOKEN;
		process.env.DIFFUSION_INTERNAL_TOKEN = 'secret-token-123';

		expect(check_internal_token('wrong-token-xxxx')).toBe(false);
		expect(check_internal_token('secret')).toBe(false); // different length
		expect(check_internal_token(null)).toBe(false);
		expect(check_internal_token('secret-token-123')).toBe(true);

		if (prev !== undefined) process.env.DIFFUSION_INTERNAL_TOKEN = prev;
		else delete process.env.DIFFUSION_INTERNAL_TOKEN;
	});
});
