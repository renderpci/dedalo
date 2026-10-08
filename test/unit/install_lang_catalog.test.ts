/**
 * Unit gate — the install language catalog + derivation (DEC-19 lang config).
 * Pure, no DB. Covers: default (lg-eng + lg-spa) when absent, refuse on empty/invalid,
 * default interface/data membership, and the derived map/array shapes.
 */

import { describe, expect, test } from 'bun:test';
import {
	deriveLangConfig,
	INSTALL_DEFAULT_LANG_CODES,
	INSTALL_LANG_CATALOG,
	INSTALL_LANG_CODES,
} from '../../src/core/install/lang_catalog.ts';

describe('install lang catalog', () => {
	test('absent langs → the default working languages (lg-eng, lg-spa), no errors', () => {
		const r = deriveLangConfig({});
		expect(r.errors).toEqual([]);
		// The default is English + Spanish, literally — every other catalog language
		// is optional, offered but never on by default.
		expect([...INSTALL_DEFAULT_LANG_CODES]).toEqual(['lg-eng', 'lg-spa']);
		expect(r.projectsDefaultLangs).toEqual(['lg-eng', 'lg-spa']);
		expect(Object.keys(r.applicationLangs)).toEqual(['lg-eng', 'lg-spa']);
		// the default is a strict subset of what the installer offers
		expect(INSTALL_LANG_CODES.length).toBeGreaterThan(INSTALL_DEFAULT_LANG_CODES.length);
		// map carries the labels
		expect(r.applicationLangs['lg-eng']).toBe(INSTALL_LANG_CATALOG['lg-eng']);
		// defaults fall to the first catalog code
		expect(r.applicationLangsDefault).toBe('lg-eng');
		expect(r.dataLangDefault).toBe('lg-eng');
		expect(r.structureLang).toBe('lg-spa');
	});

	test('picked subset drives BOTH the map and the code list (consistent)', () => {
		const r = deriveLangConfig({
			langs: ['lg-spa', 'lg-cat'],
			appLangDefault: 'lg-cat',
			dataLangDefault: 'lg-spa',
		});
		expect(r.errors).toEqual([]);
		expect(r.projectsDefaultLangs).toEqual(['lg-spa', 'lg-cat']);
		expect(r.applicationLangs).toEqual({ 'lg-spa': 'Castellano', 'lg-cat': 'Català' });
		expect(r.applicationLangsDefault).toBe('lg-cat');
		expect(r.dataLangDefault).toBe('lg-spa');
	});

	test('comma string input is accepted and de-duped', () => {
		const r = deriveLangConfig({ langs: 'lg-eng, lg-spa , lg-eng' });
		expect(r.errors).toEqual([]);
		expect(r.projectsDefaultLangs).toEqual(['lg-eng', 'lg-spa']);
	});

	test('EXPLICIT empty set → error (never silently ship all)', () => {
		expect(deriveLangConfig({ langs: [] }).errors.length).toBeGreaterThan(0);
		expect(deriveLangConfig({ langs: '' }).errors.length).toBeGreaterThan(0);
	});

	test('a code outside the catalog → error', () => {
		const r = deriveLangConfig({ langs: ['lg-eng', 'lg-zzz'] });
		expect(r.errors.some((e) => e.includes('lg-zzz'))).toBe(true);
	});

	test('a malformed code → error', () => {
		const r = deriveLangConfig({ langs: ['english'] });
		expect(r.errors.some((e) => e.includes('english'))).toBe(true);
	});

	test('a default language not in the picked set → error', () => {
		const r = deriveLangConfig({ langs: ['lg-eng'], appLangDefault: 'lg-spa' });
		expect(r.errors.some((e) => e.includes('lg-spa'))).toBe(true);
	});
});
