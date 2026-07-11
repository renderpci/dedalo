/**
 * R2 gate: the from-scratch RDF/XML parser (tool_import_rdf + tool_import_zotero,
 * no 3rd-party lib). Parses XML (attrs, nesting, self-close, comments, entities)
 * and extracts RDF subjects/properties (rdf:about, typed nodes, rdf:resource refs,
 * literals) — the Zotero/RDF bibliographic subset.
 */

import { describe, expect, test } from 'bun:test';
import { parseRdfXml, parseXml } from '../../src/core/tools/rdf_xml.ts';

describe('parseXml', () => {
	test('elements, attributes, nested text, self-closing, comments, entities', () => {
		const doc = parseXml(
			'<?xml version="1.0"?><a x="1"><!-- c --><b>hi &amp; bye</b><c self="y"/></a>',
		);
		const a = doc.children[0];
		expect(typeof a === 'object' && a.tag).toBe('a');
		if (typeof a !== 'object') throw new Error('a'); // excludes string nodes AND undefined
		expect(a.attrs.x).toBe('1');
		const b = a.children.find((n) => typeof n === 'object' && n.tag === 'b');
		expect(typeof b === 'object' && (b as { children: unknown[] }).children[0]).toBe('hi & bye');
		const c = a.children.find((n) => typeof n === 'object' && n.tag === 'c');
		expect(typeof c === 'object' && (c as { attrs: Record<string, string> }).attrs.self).toBe('y');
	});
});

describe('parseRdfXml', () => {
	const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:bib="http://purl.org/net/biblio#">
  <bib:Book rdf:about="urn:book:1">
    <dc:title>The Title</dc:title>
    <dc:creator rdf:resource="urn:person:9"/>
  </bib:Book>
  <rdf:Description rdf:about="urn:person:9">
    <dc:name>An Author</dc:name>
  </rdf:Description>
</rdf:RDF>`;

	test('extracts typed nodes, about URIs, literals, and resource references', () => {
		const { subjects } = parseRdfXml(rdf);
		expect(subjects).toHaveLength(2);

		const book = subjects[0]!;
		expect(book.about).toBe('urn:book:1');
		expect(book.type).toBe('bib:Book');
		const title = book.properties.find((p) => p.predicate === 'dc:title');
		expect(title?.value).toBe('The Title');
		const creator = book.properties.find((p) => p.predicate === 'dc:creator');
		expect(creator?.resource).toBe('urn:person:9');
		expect(creator?.value).toBeNull();

		const person = subjects[1]!;
		expect(person.about).toBe('urn:person:9');
		expect(person.type).toBeNull(); // rdf:Description without rdf:type
		expect(person.properties.find((p) => p.predicate === 'dc:name')?.value).toBe('An Author');
	});

	test('empty / non-RDF input yields no subjects (no crash)', () => {
		expect(parseRdfXml('<html><body>nope</body></html>').subjects).toEqual([]);
	});
});
