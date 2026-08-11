/**
 * IMPORT EXECUTOR refusal gate (src/core/tools/import_execute.ts) — the write
 * half of the MARC21 / Zotero / RDF import path, driven against the REAL DB on a
 * SCRATCH record (created and removed here; the canonical test3 playground rows
 * are never touched).
 *
 * THE DISTINCTION THIS GATE EXISTS FOR. Two conform outcomes look identical to
 * the executor and mean opposite things:
 *
 *   - REFUSED (conform.errors) — the cell was never readable. The refusal text
 *     promises "the existing value was left untouched", so NOTHING may be
 *     written for that field.
 *   - EXPLICIT EMPTY (result null, no errors) — the source said "no value".
 *     That IS the import's clear, and it must still clear.
 *
 * Before this gate both paths reached `set_data []`: a refused geolocation cell
 * reported an error AND deleted the record's stored coordinate. Conform-level
 * tests cannot see it — only a write can.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { importMappedRecords } from '../../src/core/tools/import_execute.ts';

const SECTION = 'test3';
const GEO = 'test100'; // component_geolocation under test45 → test3
const USER = 987671;
const ID = 900701; // far outside the canonical test3 ids
const TABLE = 'matrix_test';

/** The seeded coordinate: ordinary data, nothing special about it. */
const SEEDED = { lat: 41.3874, lon: 2.1686, zoom: 16, alt: 0 };

let ready = false;

/** Seed the coordinate and return it AS STORED (the save mints the item id). */
async function seedGeo(): Promise<unknown[]> {
	await saveComponentData({
		componentTipo: GEO,
		sectionTipo: SECTION,
		sectionId: ID,
		lang: 'lg-nolan',
		changedData: [{ action: 'set_data', id: null, value: [{ ...SEEDED }] }],
		userId: USER,
	});
	const stored = await storedGeo();
	expect(stored).toEqual([expect.objectContaining(SEEDED)]);
	return stored;
}

async function storedGeo(): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(SECTION);
	const record = await readMatrixRecord(table!, SECTION, ID);
	return readComponentItems(record!, GEO, 'component_geolocation') ?? [];
}

/** Drive the executor over ONE field of the scratch record. */
function runImport(values: string[]) {
	return importMappedRecords(
		[{ sectionId: ID, fields: [{ component_tipo: GEO, values }] }],
		SECTION,
		USER,
	);
}

beforeAll(async () => {
	try {
		await createSectionRecord(SECTION, USER, new Date(), ID, { conflictTolerant: true });
		ready = true;
	} catch {
		ready = false; // DB unavailable → the tests below skip
	}
});

afterAll(async () => {
	if (!ready) return;
	await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION,
		ID,
	]);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`, [
		SECTION,
		ID,
	]);
});

describe('a REFUSED cell never touches the stored value', () => {
	test('a malformed geolocation cell is reported and the coordinate SURVIVES', async () => {
		if (!ready) return;
		const before = await seedGeo();
		// {latitude, longitude} — a wrong-named pair: refused, never a silent clear.
		const report = await runImport(['[{"latitude":41.3,"longitude":2.1}]']);

		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]).toMatchObject({
			section_id: ID,
			component_tipo: GEO,
			msg: expect.stringContaining('IGNORED: malformed data.'),
		});
		// The whole point: the record is byte-for-byte as it was.
		expect(await storedGeo()).toEqual(before);
	});

	test('a flat non-coordinate cell ("north, 2.1") likewise leaves it intact', async () => {
		if (!ready) return;
		const before = await seedGeo();
		const report = await runImport(['north, 2.1']);
		expect(report.failed[0]?.msg).toContain('Non numeric value');
		expect(await storedGeo()).toEqual(before);
	});

	test('a field with one good and one refused value writes NOTHING, and says so', async () => {
		if (!ready) return;
		const before = await seedGeo();
		const report = await runImport(['0, 0', '[{"latitude":41.3,"longitude":2.1}]']);

		// set_data is a whole-value replacement, so a partial group is a value the
		// source never expressed. The field is skipped — and the drop is reported.
		expect(await storedGeo()).toEqual(before);
		expect(report.failed).toHaveLength(2);
		expect(report.failed.map((f) => f.msg).join('\n')).toContain(
			'the field was NOT written — one of its values was refused',
		);
	});
});

describe('an EXPLICIT EMPTY still clears — that is a real user intent', () => {
	test('an empty cell removes the stored coordinate', async () => {
		if (!ready) return;
		await seedGeo();

		const report = await runImport(['']);
		expect(report.failed).toHaveLength(0);
		expect(report.updated).toBe(1);
		expect(await storedGeo()).toHaveLength(0);
	});

	test('a source that STATES no location (lat/lon present and blank) also clears', async () => {
		if (!ready) return;
		await seedGeo();
		const report = await runImport(['[{"lat":"","lon":""}]']);
		expect(report.failed).toHaveLength(0);
		expect(await storedGeo()).toHaveLength(0);
	});
});
