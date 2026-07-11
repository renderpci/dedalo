/**
 * R2 gate: the from-scratch MARC21 / ISO 2709 parser (tool_import_marc21, no
 * 3rd-party lib). A synthetic record (control field 001 + data field 245 with
 * indicators and subfields) is assembled in the transmission format and parsed
 * back; multi-record splitting is checked. The config-driven Dédalo mapping is
 * ledgered.
 */

import { describe, expect, test } from 'bun:test';
import { parseMarc, parseMarcRecord, splitMarcRecords } from '../../src/core/tools/marc21.ts';

const FT = '\x1e'; // field terminator
const SD = '\x1f'; // subfield delimiter
const RT = '\x1d'; // record terminator

interface FieldSpec {
	tag: string;
	value?: string;
	ind1?: string;
	ind2?: string;
	subfields?: [string, string][];
}

/** Assemble a valid ISO 2709 record from field specs. */
function buildMarc(fields: FieldSpec[]): Uint8Array {
	const bodies = fields.map((f) => {
		if (f.value !== undefined) return `${f.value}${FT}`;
		const subs = (f.subfields ?? []).map(([code, val]) => `${SD}${code}${val}`).join('');
		return `${f.ind1 ?? ' '}${f.ind2 ?? ' '}${subs}${FT}`;
	});
	let directory = '';
	let start = 0;
	for (let i = 0; i < fields.length; i++) {
		const len = new TextEncoder().encode(bodies[i]!).length;
		directory += fields[i]!.tag + String(len).padStart(4, '0') + String(start).padStart(5, '0');
		start += len;
	}
	directory += FT;
	const baseAddress = 24 + directory.length;
	const data = bodies.join('') + RT;
	const recordLength = baseAddress + new TextEncoder().encode(data).length;
	const leader = `${String(recordLength).padStart(5, '0')}nam a22${String(baseAddress).padStart(5, '0')}n a4500`;
	return new TextEncoder().encode(leader + directory + data);
}

describe('MARC21 parser', () => {
	test('parses control field + data field with indicators and subfields', () => {
		const bytes = buildMarc([
			{ tag: '001', value: '12345' },
			{
				tag: '245',
				ind1: '1',
				ind2: '0',
				subfields: [
					['a', 'The Title'],
					['c', 'An Author'],
				],
			},
		]);
		const record = parseMarcRecord(bytes);
		expect(record.leader.length).toBe(24);
		const control = record.fields.find((f) => f.tag === '001');
		expect(control?.value).toBe('12345');
		const title = record.fields.find((f) => f.tag === '245');
		expect(title?.indicator1).toBe('1');
		expect(title?.indicator2).toBe('0');
		expect(title?.subfields).toEqual([
			{ code: 'a', value: 'The Title' },
			{ code: 'c', value: 'An Author' },
		]);
	});

	test('splits and parses a multi-record stream', () => {
		const r1 = buildMarc([{ tag: '001', value: 'A1' }]);
		const r2 = buildMarc([{ tag: '001', value: 'B2' }]);
		const stream = new Uint8Array([...r1, ...r2]);
		expect(splitMarcRecords(stream)).toHaveLength(2);
		const { records, errors } = parseMarc(stream);
		expect(errors).toHaveLength(0);
		expect(records.map((r) => r.fields[0]?.value)).toEqual(['A1', 'B2']);
	});

	test('malformed record → collected error, not a crash', () => {
		// Pinned contract: a <24-byte fragment is FILTERED by the splitter (no record, no error).
		const { records, errors } = parseMarc(new TextEncoder().encode(`garbage${RT}`));
		expect(records).toHaveLength(0);
		expect(errors).toHaveLength(0);

		// Pinned contract: a >=24-byte garbage record survives the splitter and is
		// REPORTED as exactly one collected leader error (not a throw).
		const long = parseMarc(new TextEncoder().encode('x'.repeat(30) + RT));
		expect(long.records).toHaveLength(0);
		expect(long.errors).toHaveLength(1);
		expect(long.errors[0]).toMatch(/invalid base address/);
	});
});
