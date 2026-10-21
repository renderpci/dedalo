/**
 * NATIVE GATE — the seed compiler serializes matrix JSONB through THE one
 * serializer (cross-ops:r0 S3: "seed compiler serializes matrix JSONB with raw
 * JSON.stringify instead of encodeForJsonb").
 *
 * src/core/install/seed_build.ts writes the canonical records (users, projects,
 * profiles) into every install's seed as `$seed$<json>$seed$::jsonb` literals.
 * A raw JSON.stringify silently DROPS an undefined key, turns an undefined
 * array slot or NaN/Infinity into null — a record altered without a word, in
 * every installation. encodeForJsonb (src/core/db/json_codec.ts) refuses each
 * of them; the outcome here: an unfaithful value refuses the compile, a
 * faithful one is emitted unchanged, and the real canonical records compile.
 */

import { describe, expect, test } from 'bun:test';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { jsonbLiteral, seedDataSql } from '../../src/core/install/seed_build.ts';
import { SEED_RECORDS } from '../../src/core/install/seed_sources.ts';

function refusal(value: unknown): unknown {
	try {
		jsonbLiteral(value);
	} catch (error) {
		return error;
	}
	return null;
}

describe('seed jsonbLiteral', () => {
	test('a value JSON cannot carry faithfully refuses the compile (never silently altered)', () => {
		for (const unfaithful of [
			{ dd1: { value: 'kept', lost: undefined } },
			[1, undefined, 3],
			{ n: Number.NaN },
			{ n: Number.POSITIVE_INFINITY },
			{ big: 1n },
		]) {
			expect(isDedaloError(refusal(unfaithful)), JSON.stringify(String(unfaithful))).toBe(true);
		}
	});

	test('a faithful value is emitted exactly; an absent column is SQL NULL', () => {
		expect(jsonbLiteral(undefined)).toBe('NULL');
		expect(jsonbLiteral({ a: 'x', b: [1, null] })).toBe(
			'$seed${"a":"x","b":[1,null]}$seed$::jsonb',
		);
		expect(jsonbLiteral(null)).toBe('$seed$null$seed$::jsonb');
	});

	test('the delimiter inside a value is still refused', () => {
		expect(isDedaloError(refusal({ a: 'x$seed$y' }))).toBe(true);
	});

	test('the real canonical records compile through it', () => {
		expect(SEED_RECORDS.length).toBeGreaterThan(0);
		const sql = seedDataSql({
			tables: [],
			registryPath: '/tmp/registry.copy',
			releaseDate: '2026-10-21 00:00:00',
		});
		expect(sql.match(/^INSERT INTO "matrix_/gm)?.length).toBe(SEED_RECORDS.length);
	});
});
