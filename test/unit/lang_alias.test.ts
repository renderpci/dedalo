/**
 * LANGUAGE-EQUIVALENCE GATE (Català === Valencià, DEDALO_LANG_EQUIVALENCES).
 *
 * v6 PHP hardcoded this as scattered branches (lang::get_label_lang and the
 * vlca→'ca' alpha-2 case). v7 declares the classes ONCE in config and consumes
 * them through resolve/lang_alias.ts. Three behaviours are load-bearing:
 *
 *   1. TRANSLATIONS are directional: vlca reads the Catalan term/label —
 *      never the reverse — because nothing is authored in vlca. Before this,
 *      a Valencian interface fell through resolveLabel's first-non-empty scan
 *      and showed an ARBITRARY language for ontology-derived titles.
 *   2. DATA fallback is symmetric: a transcript that exists only in Valencian
 *      is what a Catalan menu shows (and vice versa), BEFORE the install
 *      default gets a say.
 *   3. Languages outside every class behave exactly as before.
 */
// BINDS INSTALL TLDs: rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { resolveLabel } from '../../src/core/ontology/labels.ts';
import { resolveComponentValue } from '../../src/core/resolve/component_data.ts';
import { equivalentLangsOf, translationLangOf } from '../../src/core/resolve/lang_alias.ts';
import { getAlpha2FromCode } from '../../src/core/resolve/lang_names.ts';

describe('the declared classes (catalog default)', () => {
	test('cat/vlca ship as one class', () => {
		expect(config.lang.equivalences).toEqual([['lg-cat', 'lg-vlca']]);
	});

	test('translationLangOf is DIRECTIONAL: vlca reads cat, cat reads nothing', () => {
		expect(translationLangOf('lg-vlca')).toBe('lg-cat');
		expect(translationLangOf('lg-cat')).toBeNull(); // already the source
		expect(translationLangOf('lg-eng')).toBeNull();
	});

	test('equivalentLangsOf is SYMMETRIC', () => {
		expect(equivalentLangsOf('lg-vlca')).toEqual(['lg-cat']);
		expect(equivalentLangsOf('lg-cat')).toEqual(['lg-vlca']);
		expect(equivalentLangsOf('lg-spa')).toEqual([]);
	});

	test('coherence: class members share the ISO 639-1 code', () => {
		for (const group of config.lang.equivalences) {
			const codes = new Set(group.map((lang) => getAlpha2FromCode(lang)));
			expect(codes.size).toBe(1);
		}
	});
});

describe('ontology labels (PHP lang::get_label_lang semantics)', () => {
	const term = { 'lg-spa': 'Título', 'lg-cat': 'Títol', 'lg-eng': 'Title' };

	test('a Valencian interface reads the Catalan term, not an arbitrary one', () => {
		expect(resolveLabel(term, 'lg-vlca')).toBe('Títol');
	});

	test('direct hits and non-members are untouched', () => {
		expect(resolveLabel(term, 'lg-cat')).toBe('Títol');
		expect(resolveLabel(term, 'lg-eng')).toBe('Title');
		// No entry for the requested lang and no equivalence → first non-empty,
		// exactly as before.
		expect(resolveLabel(term, 'lg-fra')).toBe('Título');
	});
});

describe('data fallback (symmetric — better than PHP, by design)', () => {
	/** A record whose rsc36 transcript exists ONLY in Valencian. */
	function recordWith(lang: string): MatrixRecord {
		return {
			sectionTipo: 'rsc167',
			sectionId: 1,
			columns: {
				string: { rsc36: [{ id: 1, value: '<p>Text</p>', lang }] },
			},
		} as unknown as MatrixRecord;
	}

	test('a Catalan menu sees the Valencian-only transcript as its FIRST fallback', async () => {
		const { value, fallbackValue } = await resolveComponentValue(
			recordWith('lg-vlca'),
			'rsc36',
			'component_text_area',
			'lg-cat',
		);
		expect(value).toBeNull(); // the slice itself stays strict
		expect(fallbackValue).toEqual([{ id: 1, value: '<p>Text</p>', lang: 'lg-vlca' }]);
	});

	test('and the other direction too', async () => {
		const { fallbackValue } = await resolveComponentValue(
			recordWith('lg-cat'),
			'rsc36',
			'component_text_area',
			'lg-vlca',
		);
		expect(fallbackValue).toEqual([{ id: 1, value: '<p>Text</p>', lang: 'lg-cat' }]);
	});

	test('the equivalent WINS over the install default when both exist', async () => {
		const record = {
			sectionTipo: 'rsc167',
			sectionId: 1,
			columns: {
				string: {
					rsc36: [
						{ id: 1, value: '<p>Default-lang text</p>', lang: config.lang.dataLangDefault },
						{ id: 1, value: '<p>Valencian text</p>', lang: 'lg-vlca' },
					],
				},
			},
		} as unknown as MatrixRecord;

		const { fallbackValue } = await resolveComponentValue(
			record,
			'rsc36',
			'component_text_area',
			'lg-cat',
		);
		expect(fallbackValue).toEqual([{ id: 1, value: '<p>Valencian text</p>', lang: 'lg-vlca' }]);
	});

	test('a non-member lang keeps the old chain untouched', async () => {
		const { fallbackValue } = await resolveComponentValue(
			recordWith(config.lang.dataLangDefault),
			'rsc36',
			'component_text_area',
			'lg-eng',
		);
		expect(fallbackValue).toEqual([
			{ id: 1, value: '<p>Text</p>', lang: config.lang.dataLangDefault },
		]);
	});
});
