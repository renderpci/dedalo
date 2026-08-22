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

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	dropTestCorpus,
	ensureTestCorpus,
	loadTestCorpus,
	testCorpusResidue,
} from '../../src/core/test_data/test_corpus/ensure.ts';

// The rows this gate reads are the ones it PROVISIONS. It used to sample
// `matrix WHERE id % 37 = 0` — whatever records the ambient database happened
// to hold — and floor the sample at >50: on a suite database built from the
// definitions-only seed that query returns ZERO rows, so the floor measured the
// fixture. The repo-owned corpus is the situation, and its own record count is
// the floor.
beforeAll(async () => {
	await ensureTestCorpus();
});
afterAll(async () => {
	await dropTestCorpus();
	expect(await testCorpusResidue()).toBe(0);
});

/** Every (table, section_tipo, section_id) the corpus declares. */
function corpusRecords(): { table: string; section_tipo: string; section_id: number }[] {
	const rows: { table: string; section_tipo: string; section_id: number }[] = [];
	for (const section of loadTestCorpus()) {
		for (const record of section.records) {
			rows.push({
				table: section.table,
				section_tipo: section.section_tipo,
				section_id: record.section_id,
			});
		}
	}
	return rows;
}

describe('json_codec round-trip against real data (Phase 2 gate)', () => {
	test('parse→stringify→jsonb is canonical-text-identical over every corpus row', async () => {
		const rows = corpusRecords();
		// Non-vacuity: the corpus's OWN size, so an empty or shrunken corpus
		// reddens instead of passing on nothing.
		expect(rows.length).toBeGreaterThan(100);

		let checkedColumns = 0;
		const failures: string[] = [];

		for (const { table, section_tipo, section_id } of rows) {
			const record = await readMatrixRecord(table, section_tipo, section_id);
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
