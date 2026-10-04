/**
 * KERNEL GATE — section_id intify (WC-2026-08-10-section-id-int-canonical).
 *
 * Pins the pure sweep kernel: the shared conversion rule (vector file — the
 * SAME vectors the v6 PHP step self-checks against), nesting, external skip,
 * finding classes, purge discipline, string-scalar non-descent (D18),
 * idempotence, and section_id_key handling.
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	canonicalizeStoredSectionId,
	isConvertibleSectionIdString,
} from '../../src/core/concepts/section_id.ts';
import {
	type IntifyFindingClass,
	intifySectionIdsInValue,
} from '../../src/core/update/transform/section_id_intify.ts';
import vectors from './fixtures/section_id_conversion_vectors.json';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Seed-shipped ontology, spelled out of the install-TLD census's token grammar. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

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
			const value: Record<string, unknown> = { section_tipo: 'test6813', section_id: vector.input };
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
});

// ── THE V6 COPY ANTI-DRIFT TRIPWIRE ─────────────────────────────────────────
// Self-contained-package rule: the v6 step cannot reference this repo, so it
// ships its OWN copy of the vector file. The detector is one pure function over
// two paths; it runs twice through the SAME code — against a situation BUILT in
// a scratch dir (identical, drifted, missing: runs on every host), and against
// the real sibling v6 checkout where one exists (a dev machine; a clone of the
// v7 repo alone cannot see it — a named skip, never a silent pass).

const V7_VECTORS = join(REPO_ROOT, 'test/unit/fixtures/section_id_conversion_vectors.json');
const V6_VECTORS = join(
	REPO_ROOT,
	'../../v6/master_dedalo/core/area_maintenance/widgets/close_v6_prepare_v7/run/lib/section_id_conversion_vectors.json',
);

type CopyVerdict = 'identical' | 'drift' | 'absent';

/** The v6 copy against the v7 source, byte for byte. */
function vectorCopyVerdict(v6Path: string, v7Path: string): CopyVerdict {
	if (!existsSync(v6Path)) return 'absent';
	return readFileSync(v6Path).equals(readFileSync(v7Path)) ? 'identical' : 'drift';
}

describe('the v6 copy of the vector file (anti-drift)', () => {
	const scratch = mkdtempSync(join(tmpdir(), 'dd-intify-vectors-'));
	afterAll(() => rmSync(scratch, { recursive: true, force: true }));
	const source = readFileSync(V7_VECTORS);

	test('BUILT SITUATION: a byte-identical copy passes', () => {
		const copy = join(scratch, 'identical.json');
		writeFileSync(copy, source);
		expect(source.length).toBeGreaterThan(100);
		expect(vectorCopyVerdict(copy, V7_VECTORS)).toBe('identical');
	});

	test('BUILT SITUATION: a one-byte drift (whitespace included) is caught', () => {
		const flipped = join(scratch, 'flipped.json');
		writeFileSync(
			flipped,
			source.toString('utf8').replace('"convertible": true', '"convertible": false'),
		);
		expect(vectorCopyVerdict(flipped, V7_VECTORS)).toBe('drift');
		const trailing = join(scratch, 'trailing.json');
		writeFileSync(trailing, Buffer.concat([source, Buffer.from('\n')]));
		expect(vectorCopyVerdict(trailing, V7_VECTORS)).toBe('drift');
	});

	test('BUILT SITUATION: a missing copy reads as absent, never as identical', () => {
		expect(vectorCopyVerdict(join(scratch, 'never_written.json'), V7_VECTORS)).toBe('absent');
	});

	const v6Present = existsSync(V6_VECTORS);
	// ONE registration: a pass where the sibling exists, a skip that names why where it does not.
	test.skipIf(!v6Present)(
		v6Present
			? 'the real v6 package carries a byte-identical copy'
			: 'SKIPPED — the sibling v6 checkout (../../v6/master_dedalo) is absent on this host; the built-situation legs above still prove the detector',
		() => {
			expect(vectorCopyVerdict(V6_VECTORS, V7_VECTORS)).toBe('identical');
		},
	);
});

describe('walk shape', () => {
	test('converts at arbitrary nesting depth and across all address keys', () => {
		// biome-ignore format: fixture shape mirrors stored jsonb
		const value = {
			[seed('rsc', 197)]: [
				{
					section_tipo: 'test6813',
					section_id: '7' as unknown,
					section_tipo_key: seed('rsc', 176),
					section_id_key: '12' as unknown,
					subdata: { entries: [{ section_tipo: 'dd64', section_id: '1' as unknown }] },
				},
			],
			meta: { parent_section_id: '3' as unknown, section_tipo: 'test2827' },
		};
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(value[seed('rsc', 197)][0]?.section_id).toBe(7);
		expect(value[seed('rsc', 197)][0]?.section_id_key).toBe(12);
		expect(value[seed('rsc', 197)][0]?.subdata.entries[0]?.section_id).toBe(1);
		expect(value.meta.parent_section_id).toBe(3);
		expect(result.converted).toBe(4);
		expect(result.changed).toBe(true);
	});

	test('already-canonical data is a no-op (idempotence)', () => {
		const value = { [seed('rsc', 197)]: [{ section_tipo: 'test6813', section_id: 7 }] };
		const before = JSON.stringify(value);
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.findings).toHaveLength(0);
		expect(JSON.stringify(value)).toBe(before);
	});

	test('second run over converted data reports zero (idempotence, full cycle)', () => {
		const value = { [seed('rsc', 197)]: [{ section_tipo: 'test6813', section_id: '7' }] };
		expect(intifySectionIdsInValue(value, NO_EXTERNAL).converted).toBe(1);
		const second = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);
	});

	test('string scalars are NEVER descended into (D18 — inline tag markers)', () => {
		// A text value carrying serialized locator JSON must survive byte-for-byte.
		const marker = `[data:{"section_id":"7","section_tipo":"${seed('rsc', 370)}"}]`;
		const value = { test6836: [{ value: marker, lang: 'lg-eng' }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(value.test6836[0]?.value).toBe(marker);
	});

	test('a TIPO-LESS section_id is user data, not a locator — untouched, no finding', () => {
		// The locator law (locator_rewrite.ts): a locator carries section_tipo +
		// section_id. A component_json value whose user JSON happens to hold a
		// 'section_id' key must survive byte-for-byte — converting it would be a
		// semantic mutation of arbitrary user data.
		const value = { test6838: [{ value: { config: { section_id: '7', mode: 'x' } } }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.findings).toHaveLength(0);
		expect(value.test6838[0]?.value.config.section_id).toBe('7');
	});

	test('null section_id (record metadata shape) is tallied, never touched', () => {
		const value = { section_id: null, section_tipo: 'test6813' };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(result.changed).toBe(false);
		expect(result.findings[0]?.class).toBe('null-value');
		expect(value.section_id).toBeNull();
	});
});

describe('external skip (D15)', () => {
	const EXTERNAL = { externalTipos: new Set(['test7342']) };

	test('zero-padded remote id on an external tipo is untouched', () => {
		const value = {
			[seed('rsc', 368)]: [{ section_tipo: 'test7342', section_id: '001338683' as unknown }],
		};
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value[seed('rsc', 368)][0]?.section_id).toBe('001338683');
		expect(result.changed).toBe(false);
		expect(result.findings[0]?.class).toBe('external-skip');
	});

	test('a CONVERTIBLE string on an external tipo CONVERTS (S0 rule: an address-shaped value is an address)', () => {
		// True remote ids are never convertible (zenon pads, wikidata is opaque);
		// tipos carrying legacy api_config residue (rsc205) hold REAL records
		// whose locators must sweep like any other. Adversarial round 2026-08-10.
		const value = {
			[seed('rsc', 368)]: [{ section_tipo: 'test7342', section_id: '1338683' as unknown }],
		};
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value[seed('rsc', 368)][0]?.section_id).toBe(1338683);
		expect(result.converted).toBe(1);
	});

	test('the same value on a NON-external tipo converts', () => {
		const value = {
			[seed('rsc', 368)]: [{ section_tipo: 'test6813', section_id: '1338683' as unknown }],
		};
		expect(intifySectionIdsInValue(value, EXTERNAL).converted).toBe(1);
		expect(value[seed('rsc', 368)][0]?.section_id).toBe(1338683);
	});

	test('leading zeros on a NON-external tipo are an integrity finding, never cast', () => {
		const value = {
			[seed('rsc', 368)]: [{ section_tipo: 'test6813', section_id: '007' as unknown }],
		};
		const result = intifySectionIdsInValue(value, EXTERNAL);
		expect(value[seed('rsc', 368)][0]?.section_id).toBe('007');
		expect(result.findings[0]?.class).toBe('leading-zero');
	});
});

describe('purge classes (D17 — operator-adjudicated element deletion)', () => {
	test('purges ONLY array elements of the requested classes', () => {
		const value: { test6113: { section_tipo: string; section_id: unknown }[] } = {
			test6113: [
				{ section_tipo: 'testmint1', section_id: '' }, // empty → purge
				{ section_tipo: 'testmint1', section_id: '5' }, // convertible → keep
				{ section_tipo: 'dd128', section_id: 'null' }, // null-literal → NOT requested
			],
		};
		const result = intifySectionIdsInValue(value, {
			externalTipos: new Set(),
			purgeClasses: new Set(['empty']),
		});
		expect(value.test6113).toHaveLength(2);
		expect(value.test6113[0]?.section_id).toBe(5);
		expect(value.test6113[1]?.section_id).toBe('null');
		expect(result.purged).toBe(1);
		expect(result.converted).toBe(1);
		// the null-literal is still reported (it was not purged)
		expect(result.findings.some((finding) => finding.class === 'null-literal')).toBe(true);
	});

	test('without purgeClasses nothing is ever removed', () => {
		const value = { test6113: [{ section_tipo: 'testmint1', section_id: '' }] };
		const result = intifySectionIdsInValue(value, NO_EXTERNAL);
		expect(value.test6113).toHaveLength(1);
		expect(result.purged).toBe(0);
	});

	test('a keyed (non-array-element) junk object is reported, never removed', () => {
		const value = { key: { section_tipo: 'testmint1', section_id: '' } };
		const result = intifySectionIdsInValue(value, {
			externalTipos: new Set(),
			purgeClasses: new Set(['empty']),
		});
		expect(value.key).toBeDefined();
		expect(result.purged).toBe(0);
		expect(result.findings[0]?.class).toBe('empty');
	});
});
