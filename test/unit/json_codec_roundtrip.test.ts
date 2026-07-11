/**
 * Phase 2 gate (plan A3/A6): byte-compat of the JSON codec against REAL data.
 *
 * Test 1 — codec semantics gate: for a broad sample of real matrix rows, take
 * each jsonb column's canonical text (rawText), run it through the TS side
 * (JSON.parse → JSON.stringify), send it back to Postgres and ask for the
 * canonical text again. If TS parse→stringify lost ANY semantic detail
 * (float trailing zeros, escapes, number precision), the canonical text
 * changes and this fails. This is the detector the json_codec header
 * promises for the int-vs-float hazard.
 *
 * Test 2 — codec guards: the loud-failure contract for JSON-unrepresentable
 * values (undefined / NaN / Infinity).
 */

import { describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';

/** How many rows to sample per table. Broad but fast. */
const SAMPLE_SIZE = 150;

describe('json_codec round-trip against real data (Phase 2 gate)', () => {
	test(`parse→stringify→jsonb is canonical-text-identical over ${SAMPLE_SIZE} real rows`, async () => {
		// Random-ish spread: order by id with a modulo bucket to cross sections.
		const rows = (await sql.unsafe(
			'SELECT section_tipo, section_id FROM matrix WHERE id % 37 = 0 ORDER BY id LIMIT $1',
			[SAMPLE_SIZE],
		)) as { section_tipo: string; section_id: number }[];
		expect(rows.length).toBeGreaterThan(50);

		let checkedColumns = 0;
		const failures: string[] = [];

		for (const { section_tipo, section_id } of rows) {
			const record = await readMatrixRecord('matrix', section_tipo, section_id);
			if (!record) continue;
			for (const column of MATRIX_JSONB_COLUMNS) {
				const originalText = record.rawText[column];
				if (originalText == null) continue;
				checkedColumns++;

				// TS side: decode + re-encode through the codec.
				const reEncoded = encodeForJsonb(JSON.parse(originalText));

				// Postgres side: canonicalize the re-encoded text and compare.
				// ::text::jsonb — Bun would JSON-encode a param bound directly
				// to jsonb (see matrix_write.ts BUN GOTCHA).
				const canonicalRows = (await sql.unsafe('SELECT ($1::text::jsonb)::text AS canonical', [
					reEncoded,
				])) as { canonical: string }[];
				const canonical = canonicalRows[0]?.canonical;

				if (canonical !== originalText) {
					failures.push(
						`${section_tipo}/${section_id}.${column}: canonical text changed after TS round-trip`,
					);
				}
			}
		}

		// Coverage honesty: make sure the sweep actually exercised data.
		expect(checkedColumns).toBeGreaterThan(200);
		expect(failures).toEqual([]);
	}, 60000);

	test('codec rejects JSON-unrepresentable values loudly', () => {
		expect(() => encodeForJsonb(undefined)).toThrow(/undefined/);
		expect(() => encodeForJsonb({ a: undefined })).toThrow(/undefined property/);
		expect(() => encodeForJsonb([1, undefined, 3])).toThrow(/undefined array item/);
		expect(() => encodeForJsonb(Number.NaN)).toThrow(/non-finite/);
		expect(() => encodeForJsonb({ deep: [{ x: Number.POSITIVE_INFINITY }] })).toThrow(/non-finite/);
		expect(() => encodeForJsonb({ fn: () => 1 })).toThrow(/unencodable function/);
		// And the happy path stays happy, [] vs {} preserved.
		expect(String(encodeForJsonb({ empty_list: [], empty_obj: {} }))).toBe(
			'{"empty_list":[],"empty_obj":{}}',
		);
	});
});
