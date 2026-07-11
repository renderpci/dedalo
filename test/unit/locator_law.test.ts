/**
 * LOCATOR LAW — exhaustive unit gate for the locator equality/lookup contract
 * (RELATIONS_SPEC.md §3, gate 5).
 *
 * PHP oracle: core/common/class.locator.php —
 *   compare_locators        :956  (strict per-property; section_id loose;
 *                                  empty properties = union compare)
 *   in_array_locator        :1031 (KEY-based, default 5-field predicate)
 *   build_locator_lookup_key :1099 ('_'-joined, missing -> '')
 *
 * These are pure functions; every rule PHP applies is pinned here, including
 * the deliberate asymmetries between the strict compare path and the
 * stringified key path. Relation add/remove/dedup integrity depends on them.
 */

import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_LOCATOR_KEY_PROPERTIES,
	LOCATOR_KEY_DELIMITER,
	type Locator,
	buildLocatorLookupKey,
	compareLocators,
	getTermIdFromLocator,
	isLocatorInArray,
	locatorSchema,
} from '../../src/core/concepts/locator.ts';

const loc = (fields: Record<string, unknown>): Locator => fields as Locator;

describe('compareLocators — explicit property list', () => {
	test('equal on the requested properties', () => {
		const a = loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd151' });
		const b = loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd151', extra: 'x' });
		expect(compareLocators(a, b, ['section_tipo', 'section_id', 'type'])).toBe(true);
	});

	test('section_id compares LOOSELY: int 7 == "7"', () => {
		const a = loc({ section_tipo: 'numisdata3', section_id: 7 });
		const b = loc({ section_tipo: 'numisdata3', section_id: '7' });
		expect(compareLocators(a, b, ['section_tipo', 'section_id'])).toBe(true);
	});

	test('section_id numeric-string pair compares numerically: "7" == "07" (PHP 8 rule)', () => {
		const a = loc({ section_tipo: 's', section_id: '07' });
		const b = loc({ section_tipo: 's', section_id: '7' });
		expect(compareLocators(a, b, ['section_id'])).toBe(true);
	});

	test('section_id non-numeric strings compare as strings', () => {
		const a = loc({ section_id: 'abc' });
		const b = loc({ section_id: 'abd' });
		expect(compareLocators(a, b, ['section_id'])).toBe(false);
		expect(compareLocators(a, loc({ section_id: 'abc' }), ['section_id'])).toBe(true);
	});

	test('every OTHER property compares STRICTLY: tag_id 5 vs "5" is not equal', () => {
		const a = loc({ section_tipo: 's', section_id: 1, tag_id: 5 });
		const b = loc({ section_tipo: 's', section_id: 1, tag_id: '5' });
		expect(compareLocators(a, b, ['section_tipo', 'section_id', 'tag_id'])).toBe(false);
	});

	test('property missing on BOTH sides is skipped (still equal)', () => {
		const a = loc({ section_tipo: 's', section_id: 1 });
		const b = loc({ section_tipo: 's', section_id: 1 });
		expect(compareLocators(a, b, ['section_tipo', 'section_id', 'type'])).toBe(true);
	});

	test('property present on exactly ONE side is a mismatch', () => {
		const a = loc({ section_tipo: 's', section_id: 1, type: 'dd151' });
		const b = loc({ section_tipo: 's', section_id: 1 });
		expect(compareLocators(a, b, ['section_tipo', 'section_id', 'type'])).toBe(false);
	});

	test('present-with-undefined counts as PRESENT (mismatch against missing)', () => {
		// PHP property_exists() semantics: a null-valued property exists.
		const a = loc({ section_tipo: 's', section_id: 1, type: undefined });
		const b = loc({ section_tipo: 's', section_id: 1 });
		expect(compareLocators(a, b, ['type'])).toBe(false);
	});
});

describe('compareLocators — empty properties = union compare', () => {
	test('identical locators are equal', () => {
		const a = loc({ section_tipo: 's', section_id: 1, type: 'dd151' });
		const b = loc({ section_tipo: 's', section_id: 1, type: 'dd151' });
		expect(compareLocators(a, b)).toBe(true);
	});

	test('any extra property on either side breaks full equality', () => {
		const a = loc({ section_tipo: 's', section_id: 1 });
		const b = loc({ section_tipo: 's', section_id: 1, from_component_tipo: 'x1' });
		expect(compareLocators(a, b)).toBe(false);
		expect(compareLocators(b, a)).toBe(false);
	});

	test('excludeProperties removes fields from the union compare', () => {
		const a = loc({ section_tipo: 's', section_id: 1, paginated_key: 0 });
		const b = loc({ section_tipo: 's', section_id: 1, paginated_key: 3 });
		expect(compareLocators(a, b)).toBe(false);
		expect(compareLocators(a, b, [], ['paginated_key'])).toBe(true);
	});

	test('union compare still applies loose section_id', () => {
		const a = loc({ section_tipo: 's', section_id: '15657' });
		const b = loc({ section_tipo: 's', section_id: 15657 });
		expect(compareLocators(a, b)).toBe(true);
	});
});

describe('buildLocatorLookupKey', () => {
	test('default predicate is the PHP 5-field set', () => {
		expect(DEFAULT_LOCATOR_KEY_PROPERTIES).toEqual([
			'section_tipo',
			'section_id',
			'type',
			'component_tipo',
			'tag_id',
		]);
	});

	test('joins values with the PHP DELIMITER, missing -> empty string', () => {
		expect(LOCATOR_KEY_DELIMITER).toBe('_');
		const key = buildLocatorLookupKey(
			loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd151' }),
		);
		expect(key).toBe('numisdata3_7_dd151__');
	});

	test('stringifies: 5 and "5" produce the SAME key (looser than compareLocators)', () => {
		const a = buildLocatorLookupKey(loc({ section_tipo: 's', section_id: 1, tag_id: 5 }));
		const b = buildLocatorLookupKey(loc({ section_tipo: 's', section_id: 1, tag_id: '5' }));
		expect(a).toBe(b);
	});

	test('null and missing both become empty parts', () => {
		const a = buildLocatorLookupKey(loc({ section_tipo: 's', section_id: 1, type: null }));
		const b = buildLocatorLookupKey(loc({ section_tipo: 's', section_id: 1 }));
		expect(a).toBe(b);
	});

	test('custom property list is honored in order', () => {
		const key = buildLocatorLookupKey(loc({ section_id: 9, section_tipo: 'rsc197' }), [
			'section_id',
			'section_tipo',
		]);
		expect(key).toBe('9_rsc197');
	});
});

describe('isLocatorInArray', () => {
	const stored = [
		loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd151', from_component_tipo: 'n77' }),
		loc({ section_tipo: 'numisdata3', section_id: 8, type: 'dd151', from_component_tipo: 'n77' }),
	];

	test('finds a member on the default 5-field predicate', () => {
		const needle = loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd151' });
		expect(isLocatorInArray(needle, stored)).toBe(true);
	});

	test('misses when a predicate field differs', () => {
		const needle = loc({ section_tipo: 'numisdata3', section_id: 7, type: 'dd96' });
		expect(isLocatorInArray(needle, stored)).toBe(false);
	});

	test('key-based matching is LOOSE on ids: "7" matches stored 7', () => {
		const needle = loc({ section_tipo: 'numisdata3', section_id: '7', type: 'dd151' });
		expect(isLocatorInArray(needle, stored)).toBe(true);
	});

	test('narrowed predicate broadens the match', () => {
		const needle = loc({ section_tipo: 'numisdata3', section_id: 8 });
		expect(isLocatorInArray(needle, stored, ['section_tipo', 'section_id'])).toBe(true);
	});

	test('empty haystack never matches', () => {
		expect(isLocatorInArray(stored[0] as Locator, [])).toBe(false);
	});
});

describe('locator schema + helpers', () => {
	test('passthrough keeps unmodeled keys (byte-compat)', () => {
		const parsed = locatorSchema.parse({
			section_tipo: 's',
			section_id: 1,
			future_field: 'kept',
		});
		expect((parsed as Record<string, unknown>).future_field).toBe('kept');
	});

	test('legacy dataframe keys parse (read-only BC)', () => {
		const parsed = locatorSchema.parse({
			section_tipo: 's',
			section_id: 1,
			section_id_key: '3',
			section_tipo_key: 'main1',
		});
		expect(parsed.section_id_key).toBe('3');
	});

	test('getTermIdFromLocator', () => {
		expect(getTermIdFromLocator(loc({ section_tipo: 'es1', section_id: 185 }))).toBe('es1_185');
	});
});
