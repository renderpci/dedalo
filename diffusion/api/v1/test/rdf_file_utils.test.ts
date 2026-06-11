/**
 * RDF_FILE_UTILS TESTS
 * merge_rdf_parts: consolidation of per-record RDF/XML documents into a
 * single document (used to build the merged download after RDF diffusion).
 */

import { describe, test, expect } from 'bun:test';
import { merge_rdf_parts } from '../lib/rdf_file_utils';

const RDF_A = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:nmo="http://nomisma.org/ontology#">
  <nmo:Coin rdf:about="http://example.org/coin/1"><nmo:hasAxis>6</nmo:hasAxis></nmo:Coin>
</rdf:RDF>`;

const RDF_B = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:nmo="http://nomisma.org/ontology#">
  <nmo:Coin rdf:about="http://example.org/coin/2"><nmo:hasAxis>12</nmo:hasAxis></nmo:Coin>
</rdf:RDF>`;

describe('merge_rdf_parts', () => {

	test('empty input produces empty string', () => {
		expect(merge_rdf_parts([])).toBe('');
		expect(merge_rdf_parts(['', '   '])).toBe('');
	});

	test('single part is returned untouched', () => {
		expect(merge_rdf_parts([RDF_A])).toBe(RDF_A);
	});

	test('multiple parts merge into one document with both resources', () => {
		const merged = merge_rdf_parts([RDF_A, RDF_B]);

		expect(merged).toContain('<?xml version="1.0" encoding="utf-8"?>');
		expect(merged).toContain('coin/1');
		expect(merged).toContain('coin/2');
		// single opening tag, single closing tag
		expect(merged.match(/<rdf:RDF/g)?.length).toBe(1);
		expect(merged.match(/<\/rdf:RDF>/g)?.length).toBe(1);
	});
});

import { merge_xml_parts } from '../lib/rdf_file_utils';

const XML_A = `<?xml version="1.0" encoding="utf-8"?>
<records xmlns="http://example.org/ns">
  <record id="1"><title>One</title></record>
</records>`;

const XML_B = `<?xml version="1.0" encoding="utf-8"?>
<records xmlns="http://example.org/ns">
  <record id="2"><title>Two</title></record>
</records>`;

describe('merge_xml_parts', () => {

	test('empty input produces empty string', () => {
		expect(merge_xml_parts([])).toBe('');
		expect(merge_xml_parts(['', '  '])).toBe('');
	});

	test('single part is returned untouched', () => {
		expect(merge_xml_parts([XML_A])).toBe(XML_A);
	});

	test('multiple parts merge under the first root (attrs preserved)', () => {
		const merged = merge_xml_parts([XML_A, XML_B]);

		expect(merged).toContain('<?xml version="1.0" encoding="utf-8"?>');
		expect(merged).toContain('<records xmlns="http://example.org/ns">');
		expect(merged).toContain('<record id="1">');
		expect(merged).toContain('<record id="2">');
		expect(merged.match(/<records/g)?.length).toBe(1);
		expect(merged.match(/<\/records>/g)?.length).toBe(1);
	});
});
