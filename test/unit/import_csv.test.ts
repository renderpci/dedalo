/**
 * CSV import gate: parseCsv (delimiter, doubled-quote, quoted newlines) +
 * planCsvImport (column-map matching, section_id resolution, per-cell conform incl.
 * the raw-export round-trip). Pure — no DB; the tool module executes the plan.
 */
// MIGRATED TO THE GENERIC `test` TLD, 2026-08-19: every install tipo this gate
// spelled is now its generic twin (sections on the `test` TLD, storing in
// matrix_test). A pure rename — the tipo is an identifier in a path, a filename
// or a locator here, so no corpus and no DB round-trip were added.

import { describe, expect, test } from 'bun:test';
import {
	analyzeCsv,
	type CsvColumn,
	parseCsv,
	planCsvImport,
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
	// The mapper's "Sample data" cell is the first non-empty value per column of
	// `sample_data`. A preview that carries the header row shows every column's
	// own NAME as its sample (the reported bug, present since the initial TS
	// commit, pinned by a copy-of-the-implementation "oracle" this replaced).
	// The header travels as `header`; the preview is DATA rows only (PHP parity).

	test('the preview is the data rows, never the header', () => {
		const csv = 'section_id;title;tags\n1;Hello;["a","b"]\n2;World;{"k":1}\n';
		const out = analyzeCsv(csv)!;
		expect(out.header).toEqual(['section_id', 'title', 'tags']);
		expect(out.sample_data).toEqual([
			['1', 'Hello', '["a","b"]'],
			['2', 'World', '{"k":1}'],
		]);
		expect(out.sample_data).not.toContainEqual(out.header);
		expect(out.n_records).toBe(2);
		expect(out.n_columns).toBe(3);
		expect(out.sample_data_errors).toEqual([]);
	});

	test('a header-only file has no preview and no records', () => {
		const out = analyzeCsv('section_id;title\n')!;
		expect(out.header).toEqual(['section_id', 'title']);
		expect(out.sample_data).toEqual([]);
		expect(out.n_records).toBe(0);
		expect(out.n_columns).toBe(2);
	});

	test('12 data rows → the preview is exactly data rows 1..10 (file rows 2..11)', () => {
		const lines = ['section_id;title'];
		for (let i = 1; i <= 12; i++) lines.push(`${i};t${i}`);
		const out = analyzeCsv(lines.join('\n'))!;
		expect(out.n_records).toBe(12);
		expect(out.sample_data).toHaveLength(10);
		expect(out.sample_data.map((row) => row[0])).toEqual([
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
			'10',
		]);
	});

	test('flags a data row with a malformed JSON cell (sample_data_errors)', () => {
		// Delimiter is ';' and the parser is quote-aware, so use quote-free JSON
		// arrays: '[1,2]' is one valid-JSON cell; '[1,2' is malformed.
		const csv = 'title;tags\nok;[1,2]\nbad;[1,2\n';
		expect(analyzeCsv(csv)!.sample_data_errors).toEqual([['bad', '[1,2']]);
	});

	test('a header cell that looks like malformed JSON is a column name, not flagged', () => {
		const out = analyzeCsv('[x;title\n1;ok\n')!;
		expect(out.header).toEqual(['[x', 'title']);
		expect(out.sample_data_errors).toEqual([]);
	});

	test('U+003B escape is un-escaped in the preview but non-JSON cells are not error-flagged', () => {
		const csv = 'a;b\nx;plainU+003Bvalue\n';
		const out = analyzeCsv(csv)!;
		expect(out.sample_data).toEqual([['x', 'plain;value']]);
		expect(out.sample_data_errors).toEqual([]);
	});

	test('empty / headerless file returns null (read error ledgered by caller)', () => {
		expect(analyzeCsv('')).toBeNull();
	});
});

describe('planCsvImport', () => {
	const columns: (CsvColumn | null)[] = [
		{ tipo: 'test102', model: 'component_section_id', columnName: 'test102', lang: 'lg-nolan' },
		{ tipo: 'test52', model: 'component_input_text', columnName: 'test52', lang: 'lg-nolan' },
		{ tipo: 'test88', model: 'component_relation_related', columnName: 'test88', lang: 'lg-nolan' },
	];

	test('resolves section_id, conforms other cells, round-trips wrapped datos', async () => {
		const wrappedText = JSON.stringify({ dedalo_data: [{ value: 'hi', lang: 'lg-eng', id: 1 }] });
		const wrappedRel = JSON.stringify({ dedalo_data: [{ section_tipo: 'test3', section_id: 9 }] });
		const plan = await planCsvImport([['7', wrappedText, wrappedRel]], columns, 'test3');
		expect(plan).toHaveLength(1);
		expect(plan[0]?.sectionId).toBe(7);
		// section_id is NOT emitted as a conformed column (used for matching only).
		expect(plan[0]?.columns.map((c) => c.tipo)).toEqual(['test52', 'test88']);
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'hi', lang: 'lg-eng', id: 1 }]);
		// A locator that arrives without its relation `type` / `from_component_tipo`
		// gets them filled from the component's ontology — an incomplete locator is
		// unusable, and PHP's conform completes it the same way.
		expect(plan[0]?.columns[1]?.conform.result).toEqual([
			{
				section_tipo: 'test3',
				section_id: 9,
				type: 'dd151',
				from_component_tipo: 'test88',
			},
		]);
	});

	test('empty section_id cell → new record (null)', async () => {
		const plan = await planCsvImport([['', 'hello', '']], columns, 'test3');
		expect(plan[0]?.sectionId).toBeNull();
		// flat scalar → {value}; empty relation cell → clear (null)
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'hello' }]);
		expect(plan[0]?.columns[1]?.conform.result).toBeNull();
	});

	test('unmatched columns (null) are skipped', async () => {
		const cols: (CsvColumn | null)[] = [
			null,
			{ tipo: 'test52', model: 'component_input_text', columnName: 'test52', lang: 'lg-nolan' },
		];
		const plan = await planCsvImport([['ignored', 'kept']], cols, 'test3');
		expect(plan[0]?.columns).toHaveLength(1);
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'kept' }]);
	});

	// import_mode plumbing (the tool server parses + gates the wire field; the
	// planner only CARRIES it to the executor). Absent = 'replace', the
	// historical behaviour — a planner that dropped the field would silently
	// turn every append column back into a destructive replace.
	test("mode defaults to 'replace' when the column declares none", async () => {
		const plan = await planCsvImport([['7', 'hello', '']], columns, 'test3');
		expect(plan[0]?.columns.map((c) => c.mode)).toEqual(['replace', 'replace']);
	});

	test('a column mode reaches its PlannedColumn, per column', async () => {
		const cols: (CsvColumn | null)[] = [
			{ tipo: 'test102', model: 'component_section_id', columnName: 'test102', lang: 'lg-nolan' },
			{
				tipo: 'test52',
				model: 'component_input_text',
				columnName: 'test52',
				lang: 'lg-nolan',
				mode: 'append',
			},
			{
				tipo: 'test88',
				model: 'component_relation_related',
				columnName: 'test88',
				lang: 'lg-nolan',
				mode: 'replace',
			},
		];
		const plan = await planCsvImport(
			[
				['7', 'a', ''],
				['8', 'b', ''],
			],
			cols,
			'test3',
		);
		for (const record of plan) {
			expect(record.columns.map((c) => [c.tipo, c.mode])).toEqual([
				['test52', 'append'],
				['test88', 'replace'],
			]);
		}
		// The mode does not alter the conform: the same cell conforms identically.
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'a' }]);
	});
});
