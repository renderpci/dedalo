/**
 * CANONICAL JSON — the ONE structural-equality / digest form
 * (src/core/concepts/canonical_json.ts).
 *
 * Pins the output, not the spelling: three private copies (append_merge,
 * ai/agent/change_plan, archive/manifest) were consolidated into it on
 * 2026-09-27, and two of them feed PERSISTED digests (the archive
 * `ontology.digest`, the change-plan hash). A change to this text for any JSON
 * value breaks the verification of every artefact already written — so the
 * exact text of a representative value is pinned here, byte for byte.
 *
 * HERMETIC: pure functions, no DB.
 */

import { describe, expect, test } from 'bun:test';
import { ontologyDigest } from '../../src/core/archive/manifest.ts';
import { canonicalEquals, canonicalJson } from '../../src/core/concepts/canonical_json.ts';
import type { DdOntologyRow } from '../../src/core/db/dd_ontology.ts';

/**
 * The archive digest's ORIGINAL implementation (manifest.ts before the
 * consolidation), kept verbatim as the reference the shared one must equal on
 * every JSON-derived value — the only kind the archive ever digests.
 */
function legacyArchiveCanonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(legacyArchiveCanonical).join(',')}]`;
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return `{${keys
		.map(
			(k) =>
				`${JSON.stringify(k)}:${legacyArchiveCanonical((value as Record<string, unknown>)[k])}`,
		)
		.join(',')}}`;
}

const SAMPLE = {
	zeta: [3, { b: 'x', a: null }, 'ñ'],
	alpha: { nested: { y: 1.5, x: true }, empty: {}, list: [] },
	é: 'accent key',
	B: 'upper sorts before lower',
};

describe('canonicalJson', () => {
	test('exact text: keys sorted at every depth, no whitespace', () => {
		expect(canonicalJson(SAMPLE)).toBe(
			'{"B":"upper sorts before lower","alpha":{"empty":{},"list":[],"nested":{"x":true,"y":1.5}},' +
				'"zeta":[3,{"a":null,"b":"x"},"ñ"],"é":"accent key"}',
		);
	});

	test('equals the archive digest’s original form on JSON values (a persisted format)', () => {
		const values: unknown[] = [
			SAMPLE,
			null,
			0,
			'text',
			[],
			{},
			[[{ c: [1, { e: 2, d: 1 }] }]],
			JSON.parse('{"__proto__": {"k": 1}, "a": 2}'),
			// Integer-like keys: a JS object enumerates them FIRST in numeric
			// order, so a re-materialized "sorted" object cannot hold this order.
			JSON.parse('{"10":1,"9":2,"$and":3,"a":4}'),
			JSON.parse('[{"b":{"2":"x","10":"y","-x":0}}]'),
		];
		for (const value of values) expect(canonicalJson(value)).toBe(legacyArchiveCanonical(value));
		const row: DdOntologyRow = {
			tipo: 'test3',
			parent: 'test1',
			term: { 'lg-spa': 'Prueba', 'lg-eng': 'Test' },
			model: 'section',
			order_number: 1,
			relations: [{ tipo: 'test24' }],
			tld: 'test',
			properties: { z: 1, a: { d: [2, 1], c: null }, map: JSON.parse('{"10":1,"9":2,"$and":3}') },
			model_tipo: 'dd6',
			is_model: false,
			is_translatable: false,
			is_main: false,
			propiedades: null,
		};
		const expected = new Bun.CryptoHasher('sha256')
			.update(legacyArchiveCanonical([row]))
			.digest('hex');
		expect(ontologyDigest([row])).toBe(expected);
	});

	test('integer-like keys emit in code-unit order, not JS enumeration order', () => {
		expect(canonicalJson(JSON.parse('{"10":1,"9":2,"$and":3,"a":4}'))).toBe(
			'{"$and":3,"10":1,"9":2,"a":4}',
		);
	});

	test('a key named __proto__ stays a KEY (never a prototype swap)', () => {
		expect(canonicalJson(JSON.parse('{"__proto__": {"k": 1}}'))).toBe('{"__proto__":{"k":1}}');
	});

	test('JSON.stringify semantics: toJSON honoured, undefined property omitted, undefined slot null', () => {
		expect(canonicalJson({ when: new Date('2026-09-27T10:00:00.000Z') })).toBe(
			'{"when":"2026-09-27T10:00:00.000Z"}',
		);
		expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
		expect(canonicalJson([undefined, 1])).toBe('[null,1]');
	});

	test('absence is distinct: top-level undefined is never null nor []', () => {
		expect(canonicalJson(undefined)).toBe('undefined');
		expect(canonicalEquals(undefined, null)).toBe(false);
		expect(canonicalEquals(undefined, [])).toBe(false);
		expect(canonicalEquals(null, [])).toBe(false);
	});

	test('key order never matters; array order always does', () => {
		expect(canonicalEquals({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
		expect(canonicalEquals([1, 2], [2, 1])).toBe(false);
	});
});
