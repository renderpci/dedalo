/**
 * Tier-1 backlog gate — the two from-scratch IMPORT PARSERS' branch families
 * (coverage plan §4.1.9). The happy paths are already pinned by rdf_xml.test.ts
 * and marc21.test.ts; what was ungated is everything an operator's REAL file
 * hits: prologs, doctypes, truncated markup, entity forms, and MARC directories
 * whose entries lie about where a field is.
 *
 * Operator-visible failure each family prevents:
 *  - parseXml: a Zotero/RDF export whose prolog or DOCTYPE is parsed as an
 *    ELEMENT (or whose truncated tail invents an empty tag) yields phantom
 *    subjects, so the import creates junk records; a lost entity decode silently
 *    corrupts every title carrying '&' or a numeric character reference.
 *  - parseMarcRecord: a directory entry pointing outside the record, or a
 *    non-numeric tag, must be SKIPPED — without the guards the import either
 *    throws on a whole batch or ingests garbage bytes as a bibliographic value.
 *
 * Pure: no DB, no fixture, no filesystem.
 */
// BINDS INSTALL TLDs: marc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { parseMarcRecord } from '../../src/core/tools/marc21.ts';
import { parseXml, type XmlNode } from '../../src/core/tools/rdf_xml.ts';

const el = (node: XmlNode | string | undefined): XmlNode => {
	if (typeof node !== 'object') throw new Error(`expected an element, got ${String(node)}`);
	return node;
};
const tags = (node: XmlNode): string[] =>
	node.children.filter((c): c is XmlNode => typeof c === 'object').map((c) => c.tag);

describe('parseXml — non-element constructs and truncated markup (§4.1.9)', () => {
	test('prolog, DOCTYPE and comments are SKIPPED, never turned into elements', () => {
		const doc = parseXml('<?xml version="1.0"?><!DOCTYPE rdf SYSTEM "x.dtd"><!-- note --><a/>');
		expect(doc.children).toHaveLength(1);
		expect(el(doc.children[0]).tag).toBe('a');
	});

	test('a truncated tag ends the parse — it never becomes an empty-named element', () => {
		// '<a' has no '>': the reader must stop, not slice a tag out of the tail.
		expect(parseXml('<a').children).toHaveLength(0);
		// The same for a truncated comment / PI / doctype: consumed to EOF, no node.
		expect(parseXml('<b/><!-- unterminated').children.map((c) => el(c).tag)).toEqual(['b']);
		expect(parseXml('<b/><?pi unterminated').children.map((c) => el(c).tag)).toEqual(['b']);
		expect(parseXml('<b/><!ENTITY unterminated').children.map((c) => el(c).tag)).toEqual(['b']);
	});

	test('a closing tag pops exactly one level — following text belongs to the parent', () => {
		const doc = parseXml('<a><b>x</b>y</a>');
		const a = el(doc.children[0]);
		expect(tags(a)).toEqual(['b']);
		expect(el(a.children[0]).children).toEqual(['x']);
		expect(a.children[1]).toBe('y'); // 'y' is a's text, NOT b's
	});

	test('a self-closing element does not swallow its siblings', () => {
		const a = el(parseXml('<a><c self="y"/><d>x</d></a>').children[0]);
		expect(tags(a)).toEqual(['c', 'd']);
		expect(el(a.children[0]).children).toHaveLength(0);
	});

	test('entities decode in TEXT and in ATTRIBUTE values; an unknown entity is left verbatim', () => {
		const a = el(parseXml('<a t="&#65;&amp;&#x42;&nope;">&lt;x&gt; &quot;&apos;</a>').children[0]);
		expect(a.attrs.t).toBe('A&B&nope;'); // decimal, named, hex, unknown-passthrough
		expect(a.children[0]).toBe('<x> "\'');
	});

	test('attribute grammar: single quotes, colon/dot/dash names, spaces around =', () => {
		const a = el(parseXml('<rdf:Description rdf:about = \'urn:x\' dc.k-2="v"/>').children[0]);
		expect(a.tag).toBe('rdf:Description');
		expect(a.attrs['rdf:about']).toBe('urn:x');
		expect(a.attrs['dc.k-2']).toBe('v');
	});

	test('whitespace-only text between elements is dropped; real text is trimmed', () => {
		const a = el(parseXml('<a>\n\t<b/>\n  hello \n</a>').children[0]);
		expect(a.children).toHaveLength(2);
		expect(a.children[1]).toBe('hello');
	});
});

// ---------------------------------------------------------------- MARC21 ----

const FT = '\x1e';
const SD = '\x1f';

/** Assemble an ISO 2709 record, optionally with a HAND-WRITTEN directory (the point of these cases). */
function marc(
	bodies: string[],
	directoryEntries: string[],
	overrideBaseAddress?: number,
): Uint8Array {
	const directory = `${directoryEntries.join('')}${FT}`;
	const baseAddress = overrideBaseAddress ?? 24 + directory.length;
	const data = bodies.join('');
	const leader = `00000nam a22${String(baseAddress).padStart(5, '0')}n a4500`;
	return new TextEncoder().encode(leader + directory + data);
}

/** A directory entry: tag(3) + length(4) + start(5). */
const entry = (tag: string, length: number, start: number): string =>
	tag + String(length).padStart(4, '0') + String(start).padStart(5, '0');

describe('parseMarcRecord — malformed leader/directory families (§4.1.9)', () => {
	test('a record shorter than the 24-byte leader throws the LEADER error', () => {
		expect(() => parseMarcRecord(new TextEncoder().encode('too short'))).toThrow(/24-byte leader/);
	});

	test('a base address that is not INSIDE the record is refused (both bounds)', () => {
		const body = `12345${FT}`;
		// baseAddress === 24: a directory of zero length is not a record.
		expect(() => parseMarcRecord(marc([body], [entry('001', body.length, 0)], 24))).toThrow(
			/invalid base address/,
		);
		// baseAddress past the end of the buffer.
		expect(() => parseMarcRecord(marc([body], [entry('001', body.length, 0)], 99999))).toThrow(
			/invalid base address/,
		);
	});

	test('a directory entry with a non-numeric tag is SKIPPED, the rest still parses', () => {
		const a = `AAA${FT}`;
		const b = `BBB${FT}`;
		const record = parseMarcRecord(
			marc([a, b], [entry('AB1', a.length, 0), entry('001', b.length, a.length)]),
		);
		expect(record.fields.map((f) => f.tag)).toEqual(['001']);
		expect(record.fields[0]?.value).toBe('BBB');
	});

	test('a directory entry running past the end of the record is SKIPPED, not decoded', () => {
		const a = `AAA${FT}`;
		const record = parseMarcRecord(
			marc([a], [entry('001', a.length, 0), entry('245', 9999, a.length)]),
		);
		expect(record.fields.map((f) => f.tag)).toEqual(['001']);
	});

	test("the control/data boundary is '010': 009 is a raw value, 010 has indicators", () => {
		const nine = `raw009${FT}`;
		const ten = `12${SD}aSub${FT}`;
		const record = parseMarcRecord(
			marc([nine, ten], [entry('009', nine.length, 0), entry('010', ten.length, nine.length)]),
		);
		const f009 = record.fields.find((f) => f.tag === '009');
		expect(f009?.value).toBe('raw009');
		expect(f009?.subfields).toBeUndefined();
		const f010 = record.fields.find((f) => f.tag === '010');
		expect(f010?.value).toBeUndefined();
		expect(f010?.indicator1).toBe('1');
		expect(f010?.indicator2).toBe('2');
		expect(f010?.subfields).toEqual([{ code: 'a', value: 'Sub' }]);
	});

	test('a data field with an EMPTY body yields blank indicators, not empty strings', () => {
		const empty = FT; // terminator only → zero payload bytes after the strip
		const record = parseMarcRecord(marc([empty], [entry('245', empty.length, 0)]));
		const field = record.fields[0];
		expect(field?.indicator1).toBe(' ');
		expect(field?.indicator2).toBe(' ');
		expect(field?.subfields).toEqual([]);
	});
});
