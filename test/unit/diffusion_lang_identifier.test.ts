/**
 * P1 foundation gates (DIFFUSION_PLAN D3-P1): the identifier chokepoint and
 * the language ladder — written and exhaustively tested BEFORE the plan
 * compiler and resolver exist, per the phase ordering rule.
 *
 * Ladder semantics pinned against the old engine's PHASE-2 expansion
 * (diffusion_processor.ts:683-760); sanitize/escape pinned against
 * sanitize_column_name / escape_identifier.
 */

import { describe, expect, test } from 'bun:test';
import {
	escapeSqlIdentifier,
	isValidSqlIdentifier,
	requireSqlIdentifier,
	sanitizeSqlName,
} from '../../src/diffusion/plan/identifier.ts';
import {
	NOLAN_KEY,
	applyFieldPolicy,
	projectRecordRows,
	resolveColumnForLang,
} from '../../src/diffusion/project/lang_ladder.ts';
import type { ColumnLangValues } from '../../src/diffusion/project/lang_ladder.ts';

describe('identifier chokepoint (spec §8.3)', () => {
	test('sanitizeSqlName reproduces the oracle byte-for-byte', () => {
		// [input, expected] — from sanitize_column_name semantics.
		const cases: Array<[string, string]> = [
			['code', 'code'],
			['Title', 'title'],
			['web_test_diffusion', 'web_test_diffusion'],
			['Oral History', 'oral_history'],
			['Título 7', 't_tulo_7'],
			['  spaced  ', 'spaced'],
			['a--b__c', 'a_b_c'],
			['_edge_', 'edge'],
			['UPPER-CASE.NAME', 'upper_case_name'],
			['ñandú', 'and'],
		];
		for (const [input, expected] of cases) {
			expect(sanitizeSqlName(input)).toBe(expected);
		}
	});

	test('strict grammar: leading letter, [a-z0-9_], max 64', () => {
		expect(isValidSqlIdentifier('interview')).toBe(true);
		expect(isValidSqlIdentifier('a')).toBe(true);
		expect(isValidSqlIdentifier(`a${'b'.repeat(63)}`)).toBe(true);
		expect(isValidSqlIdentifier(`a${'b'.repeat(64)}`)).toBe(false); // 66 > 64
		expect(isValidSqlIdentifier('7code')).toBe(false); // leading digit
		expect(isValidSqlIdentifier('_code')).toBe(false); // leading underscore
		expect(isValidSqlIdentifier('')).toBe(false);
		expect(isValidSqlIdentifier('Code')).toBe(false); // uppercase
		expect(isValidSqlIdentifier('co de')).toBe(false);
		expect(isValidSqlIdentifier('drop`table')).toBe(false);
	});

	test('requireSqlIdentifier: sanitize-then-validate, loud on hostile labels', () => {
		expect(requireSqlIdentifier('Oral History', 'table')).toBe('oral_history');
		// A label that sanitizes to a leading digit fails loudly, naming the role.
		expect(() => requireSqlIdentifier('7 samurai', 'column')).toThrow(/column identifier/);
		// Injection-shaped labels collapse to safe names or fail — never pass through.
		expect(requireSqlIdentifier('x`; DROP TABLE users; --', 'table')).toBe('x_drop_table_users');
		expect(() => requireSqlIdentifier('€€€', 'database')).toThrow(/database identifier/);
	});

	test('escapeSqlIdentifier doubles backticks (oracle escape_identifier)', () => {
		expect(escapeSqlIdentifier('interview')).toBe('`interview`');
		expect(escapeSqlIdentifier('we`ird')).toBe('`we``ird`');
	});
});

describe('language ladder (oracle PHASE-2, all rungs)', () => {
	const values = (entries: Array<[string, string | null]>): ColumnLangValues => new Map(entries);

	test('rung 1: exact lang wins over everything', () => {
		const map = values([
			['lg-spa', 'ES'],
			[NOLAN_KEY, 'NL'],
			['lg-eng', 'EN'],
		]);
		expect(resolveColumnForLang(map, 'lg-eng', 'lg-spa')).toBe('EN');
	});

	test('rung 2: nolan beats main_lang and any', () => {
		const map = values([
			['lg-spa', 'ES'],
			[NOLAN_KEY, 'NL'],
		]);
		expect(resolveColumnForLang(map, 'lg-eng', 'lg-spa')).toBe('NL');
	});

	test('rung 3: main_lang fallback', () => {
		const map = values([
			['lg-spa', 'ES'],
			['lg-cat', 'CA'],
		]);
		expect(resolveColumnForLang(map, 'lg-eng', 'lg-spa')).toBe('ES');
	});

	test('rung 4: any available lang (insertion order — oracle get_first_value)', () => {
		const map = values([
			['lg-cat', 'CA'],
			['lg-fra', 'FR'],
		]);
		expect(resolveColumnForLang(map, 'lg-eng', 'lg-spa')).toBe('CA');
	});

	test('rung 5: nothing → null', () => {
		expect(resolveColumnForLang(values([]), 'lg-eng', 'lg-spa')).toBeNull();
	});

	test('a stored NULL at rung 1/4 is honored, not skipped (oracle .has() semantics)', () => {
		expect(resolveColumnForLang(values([['lg-eng', null]]), 'lg-eng', null)).toBeNull();
		expect(resolveColumnForLang(values([['lg-cat', null]]), 'lg-eng', null)).toBeNull();
	});

	test('no configured langs → single null-lang row taking nolan-or-first', () => {
		const rows = projectRecordRows(
			7,
			new Map([
				['code', values([[NOLAN_KEY, 'C-1']])],
				['title', values([['lg-spa', 'Título']])],
				['empty', values([])],
			]),
			{ langs: [], mainLang: null },
		);
		expect(rows).toEqual([
			{ sectionId: 7, lang: null, columns: { code: 'C-1', title: 'Título', empty: null } },
		]);
	});

	test('multilang expansion: one row per lang, per-column independent fallback', () => {
		const rows = projectRecordRows(
			1,
			new Map([
				['code', values([[NOLAN_KEY, 'CODE-001']])],
				[
					'title',
					values([
						['lg-eng', 'English title'],
						['lg-spa', 'Título español'],
					]),
				],
			]),
			{ langs: ['lg-eng', 'lg-spa', 'lg-cat'], mainLang: 'lg-eng' },
		);
		expect(rows).toEqual([
			{
				sectionId: 1,
				lang: 'lg-eng',
				columns: { code: 'CODE-001', title: 'English title' },
			},
			{
				sectionId: 1,
				lang: 'lg-spa',
				columns: { code: 'CODE-001', title: 'Título español' },
			},
			// lg-cat: code via nolan, title via main_lang (rung 3).
			{
				sectionId: 1,
				lang: 'lg-cat',
				columns: { code: 'CODE-001', title: 'English title' },
			},
		]);
	});
});

describe('field policies (oracle apply_ets, single application point)', () => {
	test('emptyToString: null/""/[]/null-literal/{} → "" ; real values pass', () => {
		const policy = { emptyToString: true };
		for (const empty of [null, '', '[]', 'null', '{}']) {
			expect(applyFieldPolicy(empty, policy)).toBe('');
		}
		expect(applyFieldPolicy('0', policy)).toBe('0');
		expect(applyFieldPolicy('[1]', policy)).toBe('[1]');
	});

	test('defaultValue: null/""/[]/null-literal → constant; "{}" is NOT defaulted (oracle)', () => {
		const policy = { defaultValue: '0' };
		for (const empty of [null, '', '[]', 'null']) {
			expect(applyFieldPolicy(empty, policy)).toBe('0');
		}
		expect(applyFieldPolicy('{}', policy)).toBe('{}');
		expect(applyFieldPolicy('7', policy)).toBe('7');
	});

	test('emptyToString wins over defaultValue when both set (oracle order)', () => {
		expect(applyFieldPolicy(null, { emptyToString: true, defaultValue: 'X' })).toBe('');
	});

	test('policies apply inside projection rows', () => {
		const rows = projectRecordRows(
			2,
			new Map([['norder', new Map<string, string | null>()]]),
			{ langs: ['lg-eng'], mainLang: 'lg-eng' },
			new Map([['norder', { defaultValue: '0' }]]),
		);
		expect(rows[0]?.columns.norder).toBe('0');
	});
});
