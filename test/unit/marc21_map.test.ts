/**
 * R2 drive gate: MARC21 map application + import, scratch-twin against the real
 * DB. extractMarcValues/applyMarcMap are pure-tested; then a synthetic MARC record
 * + a synthetic marc21_map is imported into a DISPOSABLE record (deleted after),
 * closing the "marc21_map→section import drive".
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { importMappedRecords } from '../../src/core/tools/import_execute.ts';
import {
	type MarcMapEntry,
	applyMarcMap,
	extractMarcValues,
	parseMarcRecord,
} from '../../src/core/tools/marc21.ts';

const SECTION = 'ich135';
const INPUT_TEXT = 'ich137';
const USER = -1;
const FT = '\x1e';
const SD = '\x1f';
const RT = '\x1d';

function buildMarc(
	fields: {
		tag: string;
		value?: string;
		ind1?: string;
		ind2?: string;
		subs?: [string, string][];
	}[],
): Uint8Array {
	const bodies = fields.map((f) =>
		f.value !== undefined
			? `${f.value}${FT}`
			: `${f.ind1 ?? ' '}${f.ind2 ?? ' '}${(f.subs ?? []).map(([c, v]) => `${SD}${c}${v}`).join('')}${FT}`,
	);
	let directory = '';
	let start = 0;
	fields.forEach((f, i) => {
		const len = new TextEncoder().encode(bodies[i]!).length;
		directory += f.tag + String(len).padStart(4, '0') + String(start).padStart(5, '0');
		start += len;
	});
	directory += FT;
	const baseAddress = 24 + directory.length;
	const data = bodies.join('') + RT;
	const recordLength = baseAddress + new TextEncoder().encode(data).length;
	const leader = `${String(recordLength).padStart(5, '0')}nam a22${String(baseAddress).padStart(5, '0')}n a4500`;
	return new TextEncoder().encode(leader + directory + data);
}

// Probe DB availability NARROWLY (ontology lookup only, import_drive.test.ts
// pattern) at module load so test.if can consume it: a DB-less machine REPORTS
// the drive as skipped, while a thrown regression inside the drive body FAILS
// instead of silently returning.
const dbAvailable = await getMatrixTableFromTipo(SECTION)
	.then((table) => table !== null)
	.catch(() => false);

const createdIds: number[] = [];
afterAll(async () => {
	for (const id of createdIds) {
		try {
			await deleteSectionRecord(SECTION, id, USER);
		} catch {
			/* best-effort */
		}
	}
});

describe('MARC21 map application (pure)', () => {
	const record = parseMarcRecord(
		buildMarc([
			{ tag: '001', value: 'REC-1' },
			{
				tag: '245',
				ind1: '1',
				ind2: '0',
				subs: [
					['a', 'The Title'],
					['c', 'An Author'],
				],
			},
		]),
	);

	test('extractMarcValues by subfield / joined / control field', () => {
		expect(extractMarcValues(record, { field: '245', subfield: 'a' })).toEqual(['The Title']);
		expect(extractMarcValues(record, { field: '245' })).toEqual(['The Title An Author']);
		expect(extractMarcValues(record, { field: '001' })).toEqual(['REC-1']);
	});

	test('applyMarcMap resolves fields + section_id', () => {
		const map: MarcMapEntry[] = [{ component_tipo: INPUT_TEXT, field: '245', subfield: 'a' }];
		const mapped = applyMarcMap(record, map, { field: '001' });
		expect(mapped.fields).toEqual([{ component_tipo: INPUT_TEXT, values: ['The Title'] }]);
		// section_id from control field '001' is non-numeric → null (create new)
		expect(mapped.sectionId).toBeNull();
	});
});

describe('MARC21 import drive (scratch-twin, real DB)', () => {
	test.if(dbAvailable)(
		'mapped MARC record → created section record with the mapped value',
		async () => {
			const record = parseMarcRecord(
				buildMarc([{ tag: '245', ind1: '1', ind2: '0', subs: [['a', 'MARC Imported Title']] }]),
			);
			const mapped = applyMarcMap(record, [
				{ component_tipo: INPUT_TEXT, field: '245', subfield: 'a' },
			]);
			const created = await importMappedRecords([mapped], SECTION, USER);
			createdIds.push(...created.createdIds);
			expect(created.created).toBe(1);
			const newId = created.createdIds[0]!;
			const table = await getMatrixTableFromTipo(SECTION);
			const stored =
				readComponentItems(
					(await readMatrixRecord(table!, SECTION, newId))!,
					INPUT_TEXT,
					'component_input_text',
				) ?? [];
			expect(stored).toContainEqual(expect.objectContaining({ value: 'MARC Imported Title' }));
		},
	);
});
