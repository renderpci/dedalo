/**
 * R2 drive gate: RDF/Zotero field-map application + import, scratch-twin against
 * the real DB. applyRdfMap is pure-tested; then a Zotero RDF export + a synthetic
 * field-map is imported into a DISPOSABLE record (deleted after), closing the
 * Zotero/RDF map-application drives.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { importMappedRecords } from '../../src/core/tools/import_execute.ts';
import { type RdfMapEntry, applyRdfMap, parseRdfXml } from '../../src/core/tools/rdf_xml.ts';

const SECTION = 'ich135';
const INPUT_TEXT = 'ich137';
const USER = -1;

const ZOTERO = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:z="http://www.zotero.org/namespaces/export#">
  <z:Item rdf:about="urn:item:1">
    <dc:title>Zotero Imported Title</dc:title>
  </z:Item>
</rdf:RDF>`;

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

describe('applyRdfMap (pure)', () => {
	test('maps subject predicates → component fields', () => {
		const { subjects } = parseRdfXml(ZOTERO);
		const map: RdfMapEntry[] = [{ predicate: 'dc:title', component_tipo: INPUT_TEXT }];
		expect(applyRdfMap(subjects, map)).toEqual([
			{
				sectionId: null,
				fields: [{ component_tipo: INPUT_TEXT, values: ['Zotero Imported Title'] }],
			},
		]);
	});
	test('subjects with no mapped predicate are dropped', () => {
		const { subjects } = parseRdfXml(ZOTERO);
		expect(
			applyRdfMap(subjects, [{ predicate: 'dc:creator', component_tipo: INPUT_TEXT }]),
		).toEqual([]);
	});
});

describe('Zotero import drive (scratch-twin, real DB)', () => {
	test.if(dbAvailable)('mapped Zotero subject → created record with the mapped value', async () => {
		const { subjects } = parseRdfXml(ZOTERO);
		const mapped = applyRdfMap(subjects, [{ predicate: 'dc:title', component_tipo: INPUT_TEXT }]);
		const report = await importMappedRecords(mapped, SECTION, USER);
		createdIds.push(...report.createdIds);
		expect(report.created).toBe(1);
		const newId = report.createdIds[0]!;
		const table = await getMatrixTableFromTipo(SECTION);
		const stored =
			readComponentItems(
				(await readMatrixRecord(table!, SECTION, newId))!,
				INPUT_TEXT,
				'component_input_text',
			) ?? [];
		expect(stored).toContainEqual(expect.objectContaining({ value: 'Zotero Imported Title' }));
	});
});
