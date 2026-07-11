/**
 * CSV import gate: parseCsv (delimiter, doubled-quote, quoted newlines) +
 * planCsvImport (column-map matching, section_id resolution, per-cell conform incl.
 * the raw-export round-trip). Pure — no DB; the tool module executes the plan.
 */

import { describe, expect, test } from 'bun:test';
import {
	type CsvColumn,
	analyzeCsv,
	parseCsv,
	planCsvImport,
	unescapeCell,
} from '../../src/core/tools/import_csv.ts';

describe('parseCsv', () => {
	test('splits on ; and rows on newline', () => {
		expect(parseCsv('a;b;c\n1;2;3')).toEqual([
			['a', 'b', 'c'],
			['1', '2', '3'],
		]);
	});
	test('quoted field with embedded delimiter + doubled-quote escape', () => {
		expect(parseCsv('name;note\n"a;b";"say ""hi"""')).toEqual([
			['name', 'note'],
			['a;b', 'say "hi"'],
		]);
	});
	test('quoted field spanning a newline', () => {
		expect(parseCsv('x\n"line1\nline2"')).toEqual([['x'], ['line1\nline2']]);
	});
});

describe('analyzeCsv (get_csv_files summary, off-loop)', () => {
	// The summary must equal the OLD inline computation getCsvFiles ran on-loop.
	function inlineAnalyze(text: string) {
		const rows = parseCsv(text);
		const header = rows[0];
		if (header === undefined || header.length === 0) return null;
		const sample_data = rows.slice(0, 10).map((row) => row.map(unescapeCell));
		const sample_data_errors: string[][] = [];
		for (const line of rows) {
			let bad = false;
			for (const raw of line) {
				const value = unescapeCell(raw);
				if (value === '' || (!value.startsWith('[') && !value.startsWith('{'))) continue;
				try {
					JSON.parse(value);
				} catch {
					bad = true;
					break;
				}
			}
			if (bad) sample_data_errors.push(line);
		}
		return {
			header,
			n_records: Math.max(0, rows.length - 1),
			n_columns: header.length,
			sample_data,
			sample_data_errors,
		};
	}

	test('matches the inline computation, incl. n_records/n_columns + sample preview', () => {
		const csv = 'title;tags\nHello;["a","b"]\nWorld;{"k":1}\n';
		expect(analyzeCsv(csv)).toEqual(inlineAnalyze(csv));
	});

	test('flags a row with a malformed JSON cell (sample_data_errors)', () => {
		// Delimiter is ';' and the parser is quote-aware, so use quote-free JSON
		// arrays: '[1,2]' is one valid-JSON cell; '[1,2' is malformed.
		const csv = 'title;tags\nok;[1,2]\nbad;[1,2\n';
		const out = analyzeCsv(csv)!;
		expect(out.sample_data_errors).toEqual([['bad', '[1,2']]);
		expect(out).toEqual(inlineAnalyze(csv)!);
	});

	test('U+003B escape is un-escaped in the preview but non-JSON cells are not error-flagged', () => {
		const csv = 'a;b\nx;plainU+003Bvalue\n';
		const out = analyzeCsv(csv)!;
		expect(out.sample_data).toEqual([
			['a', 'b'],
			['x', 'plain;value'],
		]);
		expect(out.sample_data_errors).toEqual([]);
	});

	test('empty / headerless file returns null (read error ledgered by caller)', () => {
		expect(analyzeCsv('')).toBeNull();
	});
});

describe('planCsvImport', () => {
	const columns: (CsvColumn | null)[] = [
		{ tipo: 'test102', model: 'component_section_id', columnName: 'test102' },
		{ tipo: 'test52', model: 'component_input_text', columnName: 'test52' },
		{ tipo: 'test88', model: 'component_relation_related', columnName: 'test88' },
	];

	test('resolves section_id, conforms other cells, round-trips wrapped datos', () => {
		const wrappedText = JSON.stringify({ dedalo_data: [{ value: 'hi', lang: 'lg-eng', id: 1 }] });
		const wrappedRel = JSON.stringify({ dedalo_data: [{ section_tipo: 'rsc197', section_id: 9 }] });
		const plan = planCsvImport([['7', wrappedText, wrappedRel]], columns);
		expect(plan).toHaveLength(1);
		expect(plan[0]?.sectionId).toBe(7);
		// section_id is NOT emitted as a conformed column (used for matching only).
		expect(plan[0]?.columns.map((c) => c.tipo)).toEqual(['test52', 'test88']);
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'hi', lang: 'lg-eng', id: 1 }]);
		expect(plan[0]?.columns[1]?.conform.result).toEqual([
			{ section_tipo: 'rsc197', section_id: 9 },
		]);
	});

	test('empty section_id cell → new record (null)', () => {
		const plan = planCsvImport([['', 'hello', '']], columns);
		expect(plan[0]?.sectionId).toBeNull();
		// flat scalar → {value}; empty relation cell → clear (null)
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'hello' }]);
		expect(plan[0]?.columns[1]?.conform.result).toBeNull();
	});

	test('unmatched columns (null) are skipped', () => {
		const cols: (CsvColumn | null)[] = [
			null,
			{ tipo: 'test52', model: 'component_input_text', columnName: 'test52' },
		];
		const plan = planCsvImport([['ignored', 'kept']], cols);
		expect(plan[0]?.columns).toHaveLength(1);
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'kept' }]);
	});
});
