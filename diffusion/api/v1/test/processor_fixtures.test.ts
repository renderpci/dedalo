/**
 * PROCESSOR FIXTURE TESTS
 * Behavior tests of process_response against the fixture library:
 * database/table resolution, the 5-level language fallback chain and
 * column-order (auto-merge) mode.
 */

import { describe, test, expect } from 'bun:test';
import { process_response } from '../lib/diffusion_processor';
import type { php_api_response } from '../lib/types';

import minimal from './fixtures/php_response_minimal.json';
import multilang from './fixtures/php_response_multilang.json';
import column_order from './fixtures/php_response_column_order.json';

const as_response = (f: unknown) => f as unknown as php_api_response;

describe('processor: minimal response', () => {

	test('resolves database from main hierarchy and table from datum.term', () => {
		const tables = process_response(as_response(minimal));
		expect(tables).toHaveLength(1);
		expect(tables[0].database_name).toBe('web_test_diffusion');
		expect(tables[0].table_name).toBe('minimal');
	});

	test('nolan value lands in every configured lang record', () => {
		const tables = process_response(as_response(minimal));
		expect(tables[0].records).toHaveLength(1); // single lang configured
		expect(tables[0].records[0]).toEqual({
			section_id: 7,
			lang: 'lg-eng',
			columns: { code: 'only-value' },
		});
	});

	test('returns empty array when result is false or datum missing', () => {
		expect(process_response({ result: false, msg: 'err' } as php_api_response)).toEqual([]);
		expect(process_response({ result: true, msg: 'ok' } as php_api_response)).toEqual([]);
	});
});

describe('processor: 5-level language fallback', () => {

	const tables = process_response(as_response(multilang));
	const records = tables[0].records;
	const by_lang = Object.fromEntries(records.map(r => [r.lang, r.columns]));

	test('one record per configured language', () => {
		expect(records.map(r => r.lang).sort()).toEqual(['lg-cat', 'lg-eng', 'lg-spa']);
	});

	test('level 1: exact lang match wins', () => {
		expect(by_lang['lg-eng'].exact).toBe('exact-eng');
		expect(by_lang['lg-spa'].exact).toBe('exact-spa');
		expect(by_lang['lg-cat'].exact).toBe('exact-cat');
	});

	test('level 2: nolan duplicates across all languages', () => {
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(by_lang[lang].nolan_only).toBe('nolan-value');
		}
	});

	test('level 3: main_lang fallback fills missing translations', () => {
		expect(by_lang['lg-spa'].main_only).toBe('main-value');
		expect(by_lang['lg-cat'].main_only).toBe('main-value');
	});

	test('level 4: any-lang fallback uses the only available language', () => {
		// value only exists in lg-ita, which is not even in the configured langs
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(by_lang[lang].any_only).toBe('any-value');
		}
	});

	test('level 5: columns with no data anywhere resolve to null', () => {
		for (const lang of ['lg-eng', 'lg-spa', 'lg-cat']) {
			expect(by_lang[lang].missing).toBeNull();
		}
	});
});

describe('processor: column-order (auto-merge) mode', () => {

	test('non-empty context.columns with empty parser groups by section and joins', () => {
		const tables = process_response(as_response(column_order));
		expect(tables[0].records).toHaveLength(1);
		// columns joined with ', ' inside a section; sections joined with ' | '
		expect(tables[0].records[0].columns.place).toBe('Madrid, Spain | Paris, France');
	});
});
