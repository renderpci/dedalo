/**
 * tool_import_dedalo_csv: section_tipo guess from the uploaded file name and the
 * browser-local store of the user's manual corrections
 * (tools/tool_import_dedalo_csv/js/section_tipo_from_file_name.js — pure, import-free).
 *
 * The old positional regex took the LAST `-xxx` word, so
 * 'export_Ceca_07-10-2026-testmint1-raw.csv' resolved to 'raw'.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const {
	TIPO_GRAMMAR,
	get_section_tipo_candidates,
	get_section_tipo_from_file_name,
	apply_section_tipo_correction,
} = await import(join(ROOT, 'tools/tool_import_dedalo_csv/js/section_tipo_from_file_name.js'));

describe('get_section_tipo_from_file_name', () => {
	const cases: Array<[string, string | null, string[]]> = [
		['export_Ceca_07-10-2026-testmint1-raw.csv', 'testmint1', ['testmint1']],
		['export_Ceca_2026-10-07-testmint1.csv', 'testmint1', ['testmint1']],
		['export_Ceca_2026-10-07-testmint1_media.csv', 'testmint1', ['testmint1']],
		['exported_oral-history_-1-test3.csv', 'test3', ['test3']],
		['export_x-testmint1 (1).csv', 'testmint1', ['testmint1']],
		['export_x-testmint1-1.csv', 'testmint1', ['testmint1']],
		['testmint1.csv', 'testmint1', ['testmint1']],
		['test170_people_testmint1.csv', 'testmint1', ['test170', 'testmint1']],
		['test3-test3.csv', 'test3', ['test3']],
		['export_Coins2023_2026-10-07.csv', null, []],
		['export_Ceca_07-10-2026.csv', null, []],
		['my file.csv', null, []],
		['', null, []],
	];
	for (const [name, expected, candidates] of cases) {
		test(JSON.stringify(name), () => {
			expect(get_section_tipo_from_file_name(name)).toBe(expected);
			expect(get_section_tipo_candidates(name)).toEqual(candidates);
		});
	}

	test('grammar is the one validate_tipo uses (core/common/js/common.js)', () => {
		const common = readFileSync(join(ROOT, 'client/dedalo/core/common/js/common.js'), 'utf8');
		const body = common.slice(common.indexOf('export const validate_tipo'));
		expect(body).toContain(`const regex	= ${TIPO_GRAMMAR.toString()};`);
	});
});

describe('apply_section_tipo_correction', () => {
	test('stores a manual value, does not mutate the input', () => {
		const store = {};
		const next = apply_section_tipo_correction(store, 'a.csv', 'testmint1', 'raw1');
		expect(next).toEqual({ 'a.csv': 'testmint1' });
		expect(store).toEqual({});
	});

	test('a value equal to the guess (or empty) is not a correction: removes the entry', () => {
		const store = { 'a.csv': 'testmint1' };
		expect(apply_section_tipo_correction(store, 'a.csv', 'test3', 'test3')).toEqual({});
		expect(apply_section_tipo_correction(store, 'a.csv', null, 'test3')).toEqual({});
		expect(apply_section_tipo_correction(store, 'a.csv', '', null)).toEqual({});
	});

	test('a changed entry becomes newest; the oldest drop past the cap', () => {
		let store: Record<string, string> = {};
		store = apply_section_tipo_correction(store, 'a.csv', 'aa1', null, 2);
		store = apply_section_tipo_correction(store, 'b.csv', 'bb1', null, 2);
		store = apply_section_tipo_correction(store, 'a.csv', 'aa2', null, 2);
		store = apply_section_tipo_correction(store, 'c.csv', 'cc1', null, 2);
		expect(store).toEqual({ 'a.csv': 'aa2', 'c.csv': 'cc1' });
		expect(Object.keys(store)).toEqual(['a.csv', 'c.csv']);
	});
});
