/**
 * KERNEL GATE — section_id intify (WC-2026-08-10-section-id-int-canonical).
 *
 * Pins the pure sweep kernel: the shared conversion rule (vector file — the
 * SAME vectors the v6 PHP step self-checks against), nesting, external skip,
 * finding classes, purge discipline, string-scalar non-descent (D18),
 * idempotence, and section_id_key handling.
 */
// BINDS INSTALL TLDs: numisdata, oh, rsc, zenon — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import {
	canonicalizeStoredSectionId,
	isConvertibleSectionIdString,
} from '../../src/core/concepts/section_id.ts';
import {
	type IntifyFindingClass,
	intifySectionIdsInValue,
} from '../../src/core/update/transform/section_id_intify.ts';
import vectors from './fixtures/section_id_conversion_vectors.json';

const NO_EXTERNAL = { externalTipos: new Set<string>() };

interface Vector {
	input: string;
	convertible: boolean;
	output?: number;
	class?: string;
}

describe('the shared conversion rule (vector file, both runtimes)', () => {
	for (const vector of (vectors as { vectors: Vector[] }).vectors) {
		test(`'${vector.input}' → ${vector.convertible ? vector.output : vector.class}`, () => {
			// The concept-side predicate agrees with the vector…
			expect(isConvertibleSectionIdString(vector.input)).toBe(vector.convertible);
			// …the writer-side canonicalizer agrees…
			expect(canonicalizeStoredSectionId(vector.input)).toEqual(
				vector.convertible ? (vector.output as number) : vector.input,
			);
			// …and the kernel agrees, including the finding class.
			const value: Record<string, unknown> = { section_tipo: 'oh1', section_id: vector.input };
			const result = intifySectionIdsInValue(value, NO_EXTERNAL);
			if (vector.convertible) {
				expect(value.section_id).toBe(vector.output as number);
				expect(result.converted).toBe(1);
				expect(result.findings).toHaveLength(0);
			} else {
				expect(value.section_id).toBe(vector.input);
				expect(result.converted).toBe(0);
				expect(result.findings).toHaveLength(1);
				expect(result.findings[0]?.class).toBe(vector.class as IntifyFindingClass);
			}
		});
	}

	test('the v6 package carries a byte-identical copy of the vector file', async () => {
		// Self-contained-package rule: the v6 step cannot reference this repo, so
		// it ships its own copy — this assertion is the anti-drift tripwire. The
		// v6 tree is a sibling checkout on dev machines; absent → skip (CI of the
		// v7 repo alone cannot see it).
		const v6Copy = Bun.file(
			'../../v6/master_dedalo/core/area_maintenance/widgets/close_v6_prepare_v7/run/lib/section_id_conversion_vectors.json',
		);
		if (!(await v6Copy.exists())) return;
		const v7Copy = Bun.file('test/unit/fixtures/section_id_conversion_vectors.json');
		expect(await v6Copy.text()).toBe(await v7Copy.text());
	});
});

describe('walk shape', () => {
	test('converts at arbitrary nesting depth and across all address keys', () => {
		// biome-ignore format: fixture shape mirrors stored jsonb
		const value = {
			rsc197: [
				{
					section_tipo: 'oh1',
					section_id: '7' as unknown,
					section_tipo_key: 'rsc176',
					section_id_key: '12' as unknown,
					subdata: { entries: [{ section_tipo: 'dd64', section_id: '1' as unknown }] },
				},
			],
			meta: { parent_section_id: '3' as unknown, section_tipo: 'es1' },
		};
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(value.rsc197[0]?.section_id).toBe(7);
		expect(value.rsc197[0]?.section_id_key).toBe(12);
		expect(value.rsc197[0]?.subdata.entries[0]?.section_id).toBe(1);
		expect(value.meta.parent_section_id).toBe(3);
		expect(result.converted).toBe(4);
		expect(result.changed).toBe(true);
	});

	test('already-canonical data is a no-op (idempotence)', () => {
		const value = { rsc197: [{ section_tipo: 'oh1', section_id: 7 }] };
		const before = JSON.stringify(value);
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.findings).toHaveLength(0);
		expect(JSON.stringify(value)).toBe(before);
	});

	test('second run over converted data reports zero (idempotence, full cycle)', () => {
		const value = { rsc197: [{ section_tipo: 'oh1', section_id: '7' }] };
		expect(intifySectionIdsInValue(value, NO_EXTERNAL).converted).toBe(1);
		const second = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);
	});

	test('string scalars are NEVER descended into (D18 — inline tag markers)', () => {
		// A text value carrying serialized locator JSON must survive byte-for-byte.
		const marker = '[data:{"section_id":"7","section_tipo":"rsc370"}]';
		const value = { oh24: [{ value: marker, lang: 'lg-eng' }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(value.oh24[0]?.value).toBe(marker);
	});

	test('a TIPO-LESS section_id is user data, not a locator — untouched, no finding', () => {
		// The locator law (locator_rewrite.ts): a locator carries section_tipo +
		// section_id. A component_json value whose user JSON happens to hold a
		// 'section_id' key must survive byte-for-byte — converting it would be a
		// semantic mutation of arbitrary user data.
		const value = { oh26: [{ value: { config: { section_id: '7', mode: 'x' } } }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.findings).toHaveLength(0);
		expect(value.oh26[0]?.value.config.section_id).toBe('7');
	});

	test('null section_id (record metadata shape) is tallied, never touched', () => {
		const value = { section_id: null, section_tipo: 'oh1' };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.findings[0]?.class).toBe('null-value');
		expect(value.section_id).toBeNull();
	});
});

describe('external skip (D15)', () => {
	const EXTERNAL = { externalTipos: new Set(['zenon1']) };

	test('zero-padded remote id on an external tipo is untouched', () => {
		const value = { rsc368: [{ section_tipo: 'zenon1', section_id: '001338683' as unknown }] };
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value.rsc368[0]?.section_id).toBe('001338683');
		expect(result.changed).toBe(false);
		expect(result.findings[0]?.class).toBe('external-skip');
	});

	test('a CONVERTIBLE string on an external tipo CONVERTS (S0 rule: an address-shaped value is an address)', () => {
		// True remote ids are never convertible (zenon pads, wikidata is opaque);
		// tipos carrying legacy api_config residue (rsc205) hold REAL records
		// whose locators must sweep like any other. Adversarial round 2026-08-10.
		const value = { rsc368: [{ section_tipo: 'zenon1', section_id: '1338683' as unknown }] };
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value.rsc368[0]?.section_id).toBe(1338683);
		expect(result.converted).toBe(1);
	});

	test('the same value on a NON-external tipo converts', () => {
		const value = { rsc368: [{ section_tipo: 'oh1', section_id: '1338683' as unknown }] };
		expect(intifySectionIdsInValue(value, EXTERNAL).converted).toBe(1);
		expect(value.rsc368[0]?.section_id).toBe(1338683);
	});

	test('leading zeros on a NON-external tipo are an integrity finding, never cast', () => {
		const value = { rsc368: [{ section_tipo: 'oh1', section_id: '007' as unknown }] };
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value.rsc368[0]?.section_id).toBe('007');
		expect(result.findings[0]?.class).toBe('leading-zero');
	});
});

describe('purge classes (D17 — operator-adjudicated element deletion)', () => {
	test('purges ONLY array elements of the requested classes', () => {
		const value: { numisdata30: { section_tipo: string; section_id: unknown }[] } = {
			numisdata30: [
				{ section_tipo: 'numisdata6', section_id: '' }, // empty → purge
				{ section_tipo: 'numisdata6', section_id: '5' }, // convertible → keep
				{ section_tipo: 'dd128', section_id: 'null' }, // null-literal → NOT requested
			],
		};
		const result = intifySectionIdsInValue(value, {
			externalTipos: new Set(),
			purgeClasses: new Set(['empty']),
		});
		expect(value.numisdata30).toHaveLength(2);
		expect(value.numisdata30[0]?.section_id).toBe(5);
		expect(value.numisdata30[1]?.section_id).toBe('null');
		expect(result.purged).toBe(1);
		expect(result.converted).toBe(1);
		// the null-literal is still reported (it was not purged)
		expect(result.findings.some((finding) => finding.class === 'null-literal')).toBe(true);
	});

	test('without purgeClasses nothing is ever removed', () => {
		const value = { numisdata30: [{ section_tipo: 'numisdata6', section_id: '' }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(value.numisdata30).toHaveLength(1);
		expect(result.purged).toBe(0);
	});

	test('a keyed (non-array-element) junk object is reported, never removed', () => {
		const value = { key: { section_tipo: 'numisdata6', section_id: '' } };
		const result = intifySectionIdsInValue(value, {
			externalTipos: new Set(),
			purgeClasses: new Set(['empty']),
		});
		expect(value.key).toBeDefined();
		expect(result.purged).toBe(0);
		expect(result.findings[0]?.class).toBe('empty');
	});
});
