/**
 * Unit gate — the install language catalog + derivation (DEC-19 lang config).
 * Pure, no DB. Covers: the catalog = the UI-label catalog files, default (lg-eng +
 * lg-spa) working set when absent, refuse on empty/invalid, default interface
 * (catalog) / data (picked set) membership, and the derived map/array shapes.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
	deriveLangConfig,
	INSTALL_DEFAULT_LANG_CODES,
	INSTALL_LANG_CATALOG,
	INSTALL_LANG_CODES,
} from '../../src/core/install/lang_catalog.ts';

const LABEL_CATALOG_DIR = join(import.meta.dir, '../../src/core/labels/catalog');

describe('install lang catalog', () => {
	test('the install catalog is EXACTLY the shipped UI-label catalogs (every translated lang is offered)', () => {
		const shipped = readdirSync(LABEL_CATALOG_DIR)
			.filter((name) => /^lg-[a-z0-9_]+\.json$/.test(name))
			.map((name) => name.slice(0, -'.json'.length))
			.sort();
		expect(shipped.length).toBeGreaterThan(0);
		expect([...INSTALL_LANG_CODES].sort()).toEqual(shipped);
		for (const code of INSTALL_LANG_CODES) expect(INSTALL_LANG_CATALOG[code]).toBeTruthy();
	});

	test('absent langs → the default working languages (lg-eng, lg-spa), no errors', () => {
		const r = deriveLangConfig({});
		expect(r.errors).toEqual([]);
		// The default is English + Spanish, literally — every other catalog language
		// is optional, offered but never on by default.
		expect([...INSTALL_DEFAULT_LANG_CODES]).toEqual(['lg-eng', 'lg-spa']);
		expect(r.projectsDefaultLangs).toEqual(['lg-eng', 'lg-spa']);
		// interface languages = the whole catalog, in presentation order
		expect(r.applicationLangs).toEqual({ ...INSTALL_LANG_CATALOG });
		expect(Object.keys(r.applicationLangs)).toEqual([...INSTALL_LANG_CODES]);
		// the default is a strict subset of what the installer offers
		expect(INSTALL_LANG_CODES.length).toBeGreaterThan(INSTALL_DEFAULT_LANG_CODES.length);
		// map carries the labels
		expect(r.applicationLangs['lg-eng']).toBe(INSTALL_LANG_CATALOG['lg-eng']);
		// defaults fall to the first catalog code
		expect(r.applicationLangsDefault).toBe('lg-eng');
		expect(r.dataLangDefault).toBe('lg-eng');
		expect(r.structureLang).toBe('lg-spa');
	});

	test('picked subset drives the working langs; the interface map stays the whole catalog', () => {
		const r = deriveLangConfig({
			langs: ['lg-spa', 'lg-cat'],
			appLangDefault: 'lg-cat',
			dataLangDefault: 'lg-spa',
		});
		expect(r.errors).toEqual([]);
		expect(r.projectsDefaultLangs).toEqual(['lg-spa', 'lg-cat']);
		expect(r.applicationLangs).toEqual({ ...INSTALL_LANG_CATALOG });
		for (const code of r.projectsDefaultLangs) expect(Object.hasOwn(r.applicationLangs, code)).toBe(true);
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

	test('a default DATA language not in the picked set → error', () => {
		const r = deriveLangConfig({ langs: ['lg-eng'], dataLangDefault: 'lg-spa' });
		expect(r.errors.some((e) => e.includes('lg-spa'))).toBe(true);
	});

	test('the default INTERFACE language may be any catalog language, picked or not', () => {
		const r = deriveLangConfig({ langs: ['lg-eng'], appLangDefault: 'lg-nep' });
		expect(r.errors).toEqual([]);
		expect(r.applicationLangsDefault).toBe('lg-nep');
		expect(r.dataLangDefault).toBe('lg-eng');
		expect(r.projectsDefaultLangs).toEqual(['lg-eng']);
	});

	test('a default interface language outside the catalog → error', () => {
		const r = deriveLangConfig({ langs: ['lg-eng'], appLangDefault: 'lg-zzz' });
		expect(r.errors.some((e) => e.includes('lg-zzz'))).toBe(true);
	});
});
