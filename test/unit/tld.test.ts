/**
 * Workstream 0 gate: the pure TLD identity rules (ontology/tld.ts), pinned to
 * the PHP edge cases (shared/core_functions.php safe_tld / get_tld_from_tipo /
 * get_section_id_from_tipo). Getting these wrong mis-derives every provisioned
 * section tipo, so each surprising PHP behavior is an explicit assertion.
 */

import { describe, expect, test } from 'bun:test';
import {
	buildTipo,
	getSectionIdFromTipo,
	getTldFromTipo,
	isMainTipo,
	mapTldToTargetSectionTipo,
	safeTld,
} from '../../src/core/ontology/tld.ts';

describe('safeTld (PHP /^[a-z]{2,}$/)', () => {
	test('accepts a multi-letter tld', () => {
		expect(safeTld('dd')).toBe('dd');
		expect(safeTld('hierarchy')).toBe('hierarchy');
		expect(safeTld('ontologytype')).toBe('ontologytype');
	});
	test('rejects a single letter', () => {
		expect(safeTld('a')).toBeNull();
	});
	test('rejects hyphens and digits (strict)', () => {
		expect(safeTld('es-x')).toBeNull();
		expect(safeTld('dd1')).toBeNull();
		expect(safeTld('es0')).toBeNull();
	});
	test('rejects empty', () => {
		expect(safeTld('')).toBeNull();
	});
});

describe('getTldFromTipo (PHP /^[a-z]{2,}/)', () => {
	test('takes the leading letter run', () => {
		expect(getTldFromTipo('dd0')).toBe('dd');
		expect(getTldFromTipo('ontologytype14')).toBe('ontologytype');
		expect(getTldFromTipo('es123')).toBe('es');
	});
	test('null when no leading letters', () => {
		expect(getTldFromTipo('0dd')).toBeNull();
		expect(getTldFromTipo('123')).toBeNull();
	});
});

describe('getSectionIdFromTipo (PHP /[0-9]+/, first digit run, 0 is valid)', () => {
	test('main section 0 is returned as the string "0"', () => {
		expect(getSectionIdFromTipo('dd0')).toBe('0');
	});
	test('takes the first digit run', () => {
		expect(getSectionIdFromTipo('hierarchy1')).toBe('1');
		expect(getSectionIdFromTipo('ontology35')).toBe('35');
		expect(getSectionIdFromTipo('ontologytype14')).toBe('14');
	});
	test('null when there is no digit', () => {
		expect(getSectionIdFromTipo('abc')).toBeNull();
	});
});

describe('mapTldToTargetSectionTipo (PHP safe_tld + "0")', () => {
	test('derives the <tld>0 main section', () => {
		expect(mapTldToTargetSectionTipo('dd')).toBe('dd0');
		expect(mapTldToTargetSectionTipo('rsc')).toBe('rsc0');
	});
	test('throws on an invalid tld', () => {
		expect(() => mapTldToTargetSectionTipo('a')).toThrow();
		expect(() => mapTldToTargetSectionTipo('es-1')).toThrow();
	});
});

describe('buildTipo / isMainTipo', () => {
	test('buildTipo concatenates', () => {
		expect(buildTipo('es', 1)).toBe('es1');
		expect(buildTipo('es', '2')).toBe('es2');
		expect(buildTipo('dd', 0)).toBe('dd0');
	});
	test('isMainTipo only matches <tld>0', () => {
		expect(isMainTipo('dd0', 'dd')).toBe(true);
		expect(isMainTipo('dd1', 'dd')).toBe(false);
		expect(isMainTipo('rsc0', 'dd')).toBe(false);
	});
});
