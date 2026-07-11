/**
 * Byte-parity pins for phpPrettyJsonEncode (parser.ts) — the encoder for the
 * dd_ontology.propiedades TEXT column, which MUST equal PHP
 * json_encode($v, JSON_PRETTY_PRINT). PHP's default flags (only PRETTY set)
 * escape forward slashes (\/) and non-ASCII (\uXXXX), indent 4 spaces, and put
 * ": " after object keys. Empty object/array collapse to {} / [].
 */

import { describe, expect, test } from 'bun:test';
import { phpPrettyJsonEncode } from '../../src/core/ontology/parser.ts';

describe('phpPrettyJsonEncode (PHP JSON_PRETTY_PRINT byte format)', () => {
	test('4-space indent + ": " after keys', () => {
		expect(phpPrettyJsonEncode({ a: 1, b: 2 })).toBe('{\n    "a": 1,\n    "b": 2\n}');
	});

	test('escapes forward slashes as \\/', () => {
		expect(phpPrettyJsonEncode({ url: 'a/b' })).toBe('{\n    "url": "a\\/b"\n}');
	});

	test('escapes non-ASCII as \\uXXXX', () => {
		// á = U+00E1, é = U+00E9
		expect(phpPrettyJsonEncode('áé')).toBe('"\\u00e1\\u00e9"');
	});

	test('empty object and array collapse', () => {
		expect(phpPrettyJsonEncode({})).toBe('{}');
		expect(phpPrettyJsonEncode([])).toBe('[]');
		expect(phpPrettyJsonEncode({ a: {} })).toBe('{\n    "a": {}\n}');
	});

	test('nested indentation accumulates', () => {
		expect(phpPrettyJsonEncode({ a: { b: [1, 2] } })).toBe(
			'{\n    "a": {\n        "b": [\n            1,\n            2\n        ]\n    }\n}',
		);
	});

	test('control chars use short escapes', () => {
		expect(phpPrettyJsonEncode('a\nb\tc')).toBe('"a\\nb\\tc"');
	});

	test('scalars and null', () => {
		expect(phpPrettyJsonEncode(null)).toBe('null');
		expect(phpPrettyJsonEncode(true)).toBe('true');
		expect(phpPrettyJsonEncode(42)).toBe('42');
		expect(phpPrettyJsonEncode('x')).toBe('"x"');
	});

	test('array of objects', () => {
		expect(phpPrettyJsonEncode([{ x: 1 }])).toBe('[\n    {\n        "x": 1\n    }\n]');
	});
});
