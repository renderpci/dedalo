/**
 * INT-CLEAN COPY ROWS (src/core/install/copy_section_ids.ts —
 * WC-2026-10-21-seed-and-thesaurus-int-clean). The seed compiler's sources and a
 * thesaurus import's files are PHP-era COPY text carrying record addresses in the
 * repealed STRING form; the codec turns every CONVERTIBLE one into the int form
 * through the sweep's own kernel, and changes NOTHING else:
 *  - a convertible string converts (any tipo — the kernel's rule), an external-shaped
 *    or junk value stays verbatim, a tipo-less `section_id` (user JSON) is untouched;
 *  - a field whose numbers would not survive a JS round trip (`40.0`, > 2^53) is KEPT
 *    verbatim and counted, never silently altered;
 *  - a row without a string address is passed through byte for byte;
 *  - streaming: a row split across chunks and a last row without its newline; rows
 *    without the address key leave as the very bytes that came in (an invalid UTF-8
 *    byte and a BOM included — never decoded); the key found wherever a chunk boundary
 *    cuts it (every chunk size 1..13 agrees with the row codec).
 * Pure (no database).
 */

import { describe, expect, test } from 'bun:test';
import { decodeCopyField, encodeCopyField, splitCopyRow } from '../../src/core/db/copy_text.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import {
	canonicalCopyChunks,
	canonicalCopyRow,
	jsonbColumnIndexes,
	newCopySectionIdTally,
	numbersSurviveJs,
} from '../../src/core/install/copy_section_ids.ts';

const INDEXES = jsonbColumnIndexes(MATRIX_COPY_COLUMNS);
const RELATION = MATRIX_COPY_COLUMNS.indexOf('relation');
const DATA = MATRIX_COPY_COLUMNS.indexOf('data');

/** A COPY row (MATRIX_COPY_COLUMNS order) with `relation` / `data` jsonb text. */
function row(relation: string | null, data: string | null = '{"label": "x"}'): string {
	const fields: (string | null)[] = MATRIX_COPY_COLUMNS.map(() => null);
	fields[0] = '7';
	fields[1] = 'zzcsi1';
	fields[DATA] = data;
	fields[RELATION] = relation;
	return fields.map(encodeCopyField).join('\t');
}

function relationOf(line: string): unknown {
	return JSON.parse(String(decodeCopyField(line.split('\t')[RELATION] as string)));
}

describe('canonicalCopyRow', () => {
	test('convertible string addresses become ints; nothing else in the row moves', () => {
		const tally = newCopySectionIdTally();
		const line = row(
			'{"dd197": [{"id": 1, "type": "dd151", "section_id": "-1", "section_tipo": "dd128"}], "hierarchy36": [{"section_id": "12", "section_tipo": "zzcsi1", "section_id_key": "3", "section_tipo_key": "zzcsi1", "parent_section_id": "4"}]}',
		);
		const out = canonicalCopyRow(line, INDEXES, tally);
		expect(relationOf(out)).toEqual({
			dd197: [{ id: 1, type: 'dd151', section_id: -1, section_tipo: 'dd128' }],
			hierarchy36: [
				{
					section_id: 12,
					section_tipo: 'zzcsi1',
					section_id_key: 3,
					section_tipo_key: 'zzcsi1',
					parent_section_id: 4,
				},
			],
		});
		expect(tally).toEqual({ rows: 1, converted: 4, kept: 0 });
		// Every other field byte for byte.
		const before = splitCopyRow(line);
		const after = splitCopyRow(out);
		expect(after.length).toBe(before.length);
		after.forEach((field, index) => {
			if (index !== RELATION) expect(field).toBe(before[index] as string | null);
		});
	});

	test('non-convertible values stay verbatim (external id, junk, leading zero); a tipo-less section_id is user data', () => {
		const tally = newCopySectionIdTally();
		const relation =
			'{"a": [{"section_id": "001338683", "section_tipo": "zzcsix1"}, {"section_id": "self", "section_tipo": "x1"}, {"section_id": "", "section_tipo": "x1"}], "b": [{"section_id": "5"}]}';
		const line = row(relation);
		expect(canonicalCopyRow(line, INDEXES, tally)).toBe(line);
		expect(tally).toEqual({ rows: 0, converted: 0, kept: 0 });
	});

	test('a field whose numbers would not survive JavaScript is KEPT verbatim and counted', () => {
		for (const lossy of ['40.0', '12345678901234567890', '-0']) {
			const tally = newCopySectionIdTally();
			const line = row(`{"g": ${lossy}, "r": [{"section_id": "2", "section_tipo": "dd64"}]}`);
			expect(canonicalCopyRow(line, INDEXES, tally), lossy).toBe(line);
			expect(tally, lossy).toEqual({ rows: 0, converted: 0, kept: 1 });
		}
	});

	test('a row with no string address is the same string (no parse)', () => {
		const tally = newCopySectionIdTally();
		const line = row('{"r": [{"section_id": 2, "section_tipo": "dd64"}]}', '{"n": 40.0}');
		expect(canonicalCopyRow(line, INDEXES, tally)).toBe(line);
		expect(tally.rows).toBe(0);
	});

	test('escaped COPY text (backslashes, tabs, newlines inside strings) round-trips', () => {
		const tally = newCopySectionIdTally();
		const text = 'a\\b\tc\nd "q"';
		const line = row(JSON.stringify({ t: text, r: [{ section_id: '9', section_tipo: 'zzcsi1' }] }));
		const out = canonicalCopyRow(line, INDEXES, tally);
		expect(relationOf(out)).toEqual({ t: text, r: [{ section_id: 9, section_tipo: 'zzcsi1' }] });
		expect(out.split('\t').length).toBe(MATRIX_COPY_COLUMNS.length);
		expect(out).not.toContain('\n');
	});
});

describe('numbersSurviveJs', () => {
	test('exact for the shapes jsonb prints', () => {
		expect(numbersSurviveJs('{"a": 1, "b": -2, "c": 1.5, "d": [0, 3e0]}')).toBe(false); // 3e0 prints 3
		expect(numbersSurviveJs('{"a": 1, "b": -2, "c": 1.5, "d": [0]}')).toBe(true);
		expect(numbersSurviveJs('{"a": "40.0 inside a string", "b": "\\"9.10\\""}')).toBe(true);
		expect(numbersSurviveJs('[40.10]')).toBe(false);
		expect(numbersSurviveJs('[9007199254740993]')).toBe(false);
	});
});

describe('canonicalCopyChunks (streaming)', () => {
	test('a row split across chunks, and a last row without its newline', async () => {
		const first = row('{"r": [{"section_id": "1", "section_tipo": "dd64"}]}');
		const second = row('{"r": [{"section_id": "2", "section_tipo": "dd64"}]}');
		const text = `${first}\n${second}`; // no trailing newline
		const bytes = new TextEncoder().encode(text);
		async function* chunks() {
			for (let at = 0; at < bytes.length; at += 7) yield bytes.slice(at, at + 7);
		}
		const tally = newCopySectionIdTally();
		let out = '';
		for await (const chunk of canonicalCopyChunks(chunks(), INDEXES, tally)) {
			out += new TextDecoder().decode(chunk);
		}
		expect(out.endsWith('\n')).toBe(true);
		const lines = out.slice(0, -1).split('\n');
		expect(lines.map(relationOf)).toEqual([
			{ r: [{ section_id: 1, section_tipo: 'dd64' }] },
			{ r: [{ section_id: 2, section_tipo: 'dd64' }] },
		]);
		expect(tally).toEqual({ rows: 2, converted: 2, kept: 0 });
	});
});

/** Every chunk `canonicalCopyChunks` yields over `bytes` cut every `size` bytes, joined. */
async function streamed(bytes: Uint8Array, size: number, tally = newCopySectionIdTally()) {
	async function* chunks() {
		for (let at = 0; at < bytes.length; at += size) yield bytes.slice(at, at + size);
	}
	const parts: Uint8Array[] = [];
	for await (const chunk of canonicalCopyChunks(chunks(), INDEXES, tally)) parts.push(chunk);
	return Buffer.concat(parts);
}

describe('canonicalCopyChunks (byte fidelity, W4 seed-import)', () => {
	test('rows without the address key pass through byte for byte (invalid UTF-8, BOM)', async () => {
		const text = Buffer.from(`${row('{"r": [{"tipo": "dd64"}]}')}\n${row(null)}\n`);
		const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text, Buffer.from([0xff, 0x0a])]);
		for (const size of [1, 5, 16_384]) {
			const tally = newCopySectionIdTally();
			expect(Buffer.compare(await streamed(bytes, size, tally), bytes), `size ${size}`).toBe(0);
			expect(tally).toEqual({ rows: 0, converted: 0, kept: 0 });
		}
	});

	test('the key is found wherever a chunk boundary cuts it', async () => {
		const lines = [
			row('{"r": [{"section_id": "3", "section_tipo": "dd64"}]}'),
			row('{"r": [{"tipo": "dd64"}]}'),
			row(null, '{"label": "x", "p": [{"parent_section_id": "8", "section_tipo": "dd64"}]}'),
			row('{"r": [{"section_id_key": "5", "section_tipo_key": "dd64"}]}'),
		];
		const bytes = Buffer.from(`${lines.join('\n')}\n`);
		const reference = newCopySectionIdTally();
		const expected = `${lines.map((line) => canonicalCopyRow(line, INDEXES, reference)).join('\n')}\n`;
		expect(reference.converted).toBeGreaterThanOrEqual(3);
		for (let size = 1; size <= 13; size++) {
			const tally = newCopySectionIdTally();
			expect((await streamed(bytes, size, tally)).toString('utf8'), `size ${size}`).toBe(expected);
			expect(tally, `size ${size}`).toEqual(reference);
		}
	});
});
