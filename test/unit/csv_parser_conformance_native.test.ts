/**
 * CSV PARSER CONFORMANCE gate (DATA-04 / DATA-21 / DATA-22, audit 2026-08-26).
 *
 * The CSV import door is the one place where a curator hands the engine bytes
 * that no schema validates, and until 2026-08-27 the reader mis-read three of
 * them silently:
 *
 *  - a `"` ANYWHERE in a field opened an enclosure, so `12" disc` absorbed the
 *    delimiter, the row terminator and the whole REMAINDER OF THE FILE into one
 *    cell (the record got the file tail as a value, its other mapped columns hit
 *    the explicit CLEAR branch, and every later record was never imported);
 *  - `Alfonso X "el Sabio"` parsed with the right row and column count, no clear
 *    and no skip — and simply DELETED the quote characters from the stored value;
 *  - the same file's rows could disagree with its header and every value after
 *    the mismatch was written into the WRONG component.
 *
 * WHAT THIS GATE PINS. RFC-4180 leaves the interesting positions undefined, so
 * "RFC-compliant" is not an assertion. The frozen oracle is:
 * `tool_common::read_csv_file_as_array` — `fgetcsv($f, 0, ';', '"', '"')` + a BOM
 * strip on row 1 + `trim()` on every cell. Every expectation in FIXTURES below
 * was MEASURED by running that exact code on PHP 8.5.4 against these exact bytes
 * (2026-08-27), never inferred from the RFC or from what a reader "should" do.
 * The parser was additionally verified by DIFFERENTIAL EXECUTION against the same
 * fgetcsv code over 9,029 further inputs — 29 hand-picked positions and 9,000
 * pseudo-random strings over a CSV-metacharacter alphabet (quotes, delimiters,
 * CR, LF, tabs, NBSP, multi-byte) — with 0 divergences.
 *
 * CENSUS: TOTAL over the fixture table — FIXTURE_COUNT is asserted, so a row
 * cannot be quietly dropped, and every row is asserted in one loop.
 *
 * THE DELIBERATE DIVERGENCES (WC-2026-08-27-csv-ingest-refusals) are asserted
 * separately, below the table: fgetcsv IMPORTED a ragged file and an unterminated
 * enclosure; the ingest door refuses both, because a shape we cannot trust cannot
 * be mapped to components without writing values into the wrong ones.
 *
 * AND THE RECORD-ID GRAMMAR — which, since 2026-08-30, has ONE door. DATA-22 was
 * not a CSV defect but a key-reading one, and the MARC21 door read its
 * `field_to_section_id` with the same `Number.parseInt`, so this file held a
 * differential over the two copies of the four-line reader. DATA-08 then removed
 * the MARC copy entirely: that door's value is a foreign control number, resolved
 * against the section's code component, and marc21.ts reads no address at all.
 * The differential is therefore gone, and what stands in its place — over the very
 * same corpus — is the MARC door's own law: no cell becomes a record address.
 * `parseRecordIdCell` is now the CSV `section_id` COLUMN's alone, and is asserted
 * through `planCsvImport` (the door that reads it) rather than imported here.
 *
 * TIER: needs the suite DB (the planner's conform facets and the duplicate-id
 * case drive the real tool against matrix_test).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	assertCsvStructure,
	type CsvColumn,
	parseCsvDetailed,
	phpTrim,
	planCsvImport,
} from '../../src/core/tools/import_csv.ts';
import type { ImportFileReport } from '../../src/core/tools/import_wire.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
// The MARC door carries NO record-id reader any more (DATA-08): its
// `field_to_section_id` is a foreign identifier, and this file pins that it never
// becomes an address — see "the MARC door: an identifier is carried, never cast".
import { applyMarcMap, type MarcRecord } from '../../src/core/tools/marc21.ts';
// The SECOND implementation of PHP's trim(). It cannot be imported by the CSV
// planner itself (a core -> diffusion edge that boundary_seam_tripwire refuses),
// so the two copies are held equal HERE — see "one law, two implementations".
import { phpTrim as phpTrimDiffusion } from '../../src/diffusion/parsers/php_string.ts';
import { mustGet } from '../helpers/assert.ts';

/** One measured position: the bytes in, and what the frozen fgetcsv answered. */
interface CsvConformanceFixture {
	name: string;
	/** What makes this position interesting — the RFC does not decide it. */
	why: string;
	input: string;
	rows: string[][];
	/** The row (1-based) whose enclosure never closed, as the reader reports it. */
	unterminatedEnclosureRow?: number;
}

/**
 * Do not edit an expectation without RE-MEASURING it against the frozen reader:
 * write the inputs to a file, run them through
 * `fgetcsv($f, 0, ';', '\"', '\"')` + the BOM strip + `trim()` on PHP, and diff.
 * That is how every row here was produced (PHP 8.5.4, 2026-08-27).
 */
const CSV_CONFORMANCE_FIXTURES: readonly CsvConformanceFixture[] = [
	{
		name: 'mid-field quote',
		why: 'THE DATA-04 REGRESSION: a quote that is not at the field start is DATA, not an enclosure',
		input: 'section_id;test52;test17\n1;12" disc;keep this\n2;second;more\n3;third;last\n',
		rows: [
			['section_id', 'test52', 'test17'],
			['1', '12" disc', 'keep this'],
			['2', 'second', 'more'],
			['3', 'third', 'last'],
		],
	},
	{
		name: 'even quote pair mid-field',
		why: 'the silent half of DATA-04: the quotes are part of the heritage value and must survive',
		input: 'id;a;b\n1;Alfonso X "el Sabio";x\n2;two;y\n',
		rows: [
			['id', 'a', 'b'],
			['1', 'Alfonso X "el Sabio"', 'x'],
			['2', 'two', 'y'],
		],
	},
	{
		name: 'enclosed field: embedded delimiter + doubled quote',
		why: 'the only quoting the RFC does define, and the shape our own exporter writes',
		input: 'name;note\n"a;b";"say ""hi"""\n',
		rows: [
			['name', 'note'],
			['a;b', 'say "hi"'],
		],
	},
	{
		name: 'enclosed field spanning a newline',
		why: 'a text_area value is multi-line; the row terminator inside an enclosure is data',
		input: 'x\n"line1\nline2"\n',
		rows: [['x'], ['line1\nline2']],
	},
	{
		name: 'CRLF row terminator',
		why: 'a Windows-authored file must parse to the same rows as a Unix one',
		input: 'a;b\r\n1;2\r\n',
		rows: [
			['a', 'b'],
			['1', '2'],
		],
	},
	{
		name: 'CRLF INSIDE an enclosure is kept verbatim',
		why: 'the previous reader folded every CRLF to LF before parsing, rewriting the value',
		input: 'a;b\r\n1;"x\r\ny"\r\n',
		rows: [
			['a', 'b'],
			['1', 'x\r\ny'],
		],
	},
	{
		name: 'empty trailing field',
		why: 'an empty last cell is a CLEAR instruction, so it must exist, not vanish',
		input: 'a;b;c\n1;2;\n',
		rows: [
			['a', 'b', 'c'],
			['1', '2', ''],
		],
	},
	{
		name: 'characters after a closing quote',
		why: 'RFC-undefined; fgetcsv appends them and drops the quote',
		input: 'a;b\n"q"tail;2\n',
		rows: [
			['a', 'b'],
			['qtail', '2'],
		],
	},
	{
		name: 'lone quote at the end of an unenclosed field',
		why: 'RFC-undefined; the quote is data (inches, a citation mark)',
		input: 'a;b\n1;end"\n',
		rows: [
			['a', 'b'],
			['1', 'end"'],
		],
	},
	{
		name: 'unterminated enclosure absorbs the file tail',
		why: 'fgetcsv does this too — pinned here, and REFUSED at the door (see below)',
		input: 'a;b\n1;"unterminated\n2;x\n',
		rows: [
			['a', 'b'],
			['1', 'unterminated\n2;x'],
		],
		unterminatedEnclosureRow: 2,
	},
	{
		name: 'blanks before an enclosure',
		why: 'php_fgetcsv skips isspace() before the enclosure, so this IS an enclosed field',
		input: 'a;b\n1; "q;x" \n',
		rows: [
			['a', 'b'],
			['1', 'q;x'],
		],
	},
	{
		name: 'BOM on the first row is stripped',
		why: 'our own export now writes one (DATA-09); the header must still match a tipo',
		input: '\uFEFFa;b\n1;2\n',
		rows: [
			['a', 'b'],
			['1', '2'],
		],
	},
	{
		name: 'BOM on a later row is DATA',
		why: 'PHP strips it on row 1 only — a U+FEFF inside a value is the value',
		input: 'a;b\n\uFEFF1;2\n',
		rows: [
			['a', 'b'],
			['\uFEFF1', '2'],
		],
	},
	{
		name: 'blank line in the middle',
		why: 'one empty cell, not a row of the header width — the door tolerates it',
		input: 'a;b\n1;2\n\n3;4\n',
		rows: [['a', 'b'], ['1', '2'], [''], ['3', '4']],
	},
	{
		name: 'lone CR is not a row terminator',
		why: 'the frozen reader read lines by LF, so an old-Mac file is ONE row',
		input: 'a;b\r1;2\r',
		rows: [['a', 'b\r1', '2']],
	},
	{
		name: 'no final newline',
		why: 'the last row must not be dropped',
		input: 'a;b\n1;2',
		rows: [
			['a', 'b'],
			['1', '2'],
		],
	},
	{
		name: 'triple quotes around a quoted value',
		why: 'the doubled-quote escape inside an enclosure, at both ends',
		input: 'a;b\n1;"""x"""\n',
		rows: [
			['a', 'b'],
			['1', '"x"'],
		],
	},
	{
		name: 'doubled quotes in an UNENCLOSED field stay doubled',
		why: 'no enclosure was opened, so nothing is unescaped',
		input: 'a;b\n1;he said ""hi""\n',
		rows: [
			['a', 'b'],
			['1', 'he said ""hi""'],
		],
	},
	{
		name: 'NBSP is not trimmed',
		why: "PHP's trim() is 6 ASCII characters; JS String.trim() would eat this value's NBSP",
		input: 'a;b\n1;\u00A0Alfonso\u00A0\n',
		rows: [
			['a', 'b'],
			['1', '\u00A0Alfonso\u00A0'],
		],
	},
	{
		name: 'ASCII whitespace IS trimmed',
		why: 'the frozen reader trims every cell; the planner must not have to',
		input: 'a;b\n  x  ;  y  \n',
		rows: [
			['a', 'b'],
			['x', 'y'],
		],
	},
	{
		name: 'empty enclosed field',
		why: 'distinct from an absent field only in the bytes; both are the empty cell',
		input: 'a;b\n"";2\n',
		rows: [
			['a', 'b'],
			['', '2'],
		],
	},
	{
		name: 'a file that is one quote character',
		why: 'fgetcsv answers one row of one empty cell — an empty answer would lose a row',
		input: '"',
		rows: [['']],
		unterminatedEnclosureRow: 1,
	},
	{
		name: 'empty file',
		why: 'no rows at all (the caller ledgers the read error)',
		input: '',
		rows: [],
	},
	{
		name: 'header only',
		why: 'a file ending on its row terminator has no phantom trailing row',
		input: 'a;b\n',
		rows: [['a', 'b']],
	},
	{
		name: 'blanks before an enclosure: tab, CR, vertical tab, form feed',
		why: 'php_fgetcsv skips isspace() before the enclosure, and isspace() is SIX characters — one narrowing of that charlist and this is an unenclosed field of the wrong width',
		input: 'a;b\n1;\t\r\v\f"q;x"\n',
		rows: [
			['a', 'b'],
			['1', 'q;x'],
		],
	},
	{
		name: 'a cell whose edges are NUL / vertical tab / tab / CR',
		why: 'PHP\'s trim() charlist is not "whitespace": it trims NUL and \\x0B, and a planner that re-trims with String.trim() would eat a different set',
		input: 'a;b\n\0\v\t\rx\r\t\v\0;y\n',
		rows: [
			['a', 'b'],
			['x', 'y'],
		],
	},
	{
		name: 'form feed OPENS an enclosure but is NOT trimmed',
		why: 'the two charlists are DIFFERENT SETS — \\f is isspace() and is not in trim() — so neither can be written in terms of the other',
		input: 'a;b\n\fx\f;y\n',
		rows: [
			['a', 'b'],
			['\fx\f', 'y'],
		],
	},
	{
		name: 'ragged rows parse as they are',
		why: "fgetcsv returns them; the REFUSAL is the door's job, not the reader's",
		input: 'a;b;c\n1;2\n3;4;5;6\n',
		rows: [
			['a', 'b', 'c'],
			['1', '2'],
			['3', '4', '5', '6'],
		],
	},
];

/** CENSUS: the table is TOTAL over the positions above — a dropped row fails here. */
const FIXTURE_COUNT = 28;

describe('parseCsv conformance — the frozen fgetcsv is the pinned expectation', () => {
	test(`the fixture table is complete (${FIXTURE_COUNT} measured positions)`, () => {
		expect(CSV_CONFORMANCE_FIXTURES).toHaveLength(FIXTURE_COUNT);
		expect(new Set(CSV_CONFORMANCE_FIXTURES.map((f) => f.name)).size).toBe(FIXTURE_COUNT);
		// Every fixture states WHY its position is interesting: the table is a
		// contract to read, not a pile of strings.
		for (const fixture of CSV_CONFORMANCE_FIXTURES) expect(fixture.why.length).toBeGreaterThan(20);
	});

	for (const fixture of CSV_CONFORMANCE_FIXTURES) {
		test(`${fixture.name}`, () => {
			const parsed = parseCsvDetailed(fixture.input);
			expect(parsed.rows).toEqual(fixture.rows);
			expect(parsed.unterminatedEnclosureRow).toBe(fixture.unterminatedEnclosureRow ?? null);
		});
	}
});

describe('the ingest door REFUSES a shape it cannot map (WC-2026-08-27-csv-ingest-refusals)', () => {
	test('a row whose width disagrees with the header refuses, naming the row', () => {
		const parsed = parseCsvDetailed('a;b;c\n1;2;3\n4;5\n');
		expect(() => assertCsvStructure(parsed, 'ragged.csv')).toThrow(/row 3 has 2 columns/);
	});

	test('an unterminated enclosure refuses instead of importing the file tail', () => {
		const parsed = parseCsvDetailed('section_id;test52\n1;"open\n2;second\n');
		expect(() => assertCsvStructure(parsed, 'unclosed.csv')).toThrow(
			/row 2 opens a quoted field that is never closed/,
		);
	});

	test('a blank line is NOT a width violation (a trailing newline must import)', () => {
		const parsed = parseCsvDetailed('a;b\n1;2\n\n3;4\n');
		expect(() => assertCsvStructure(parsed, 'blank.csv')).not.toThrow();
	});

	test('a well-formed file passes untouched', () => {
		const parsed = parseCsvDetailed('a;b\n"x;y";2\n');
		expect(() => assertCsvStructure(parsed, 'fine.csv')).not.toThrow();
	});
});

const SECTION = 'test3';
const TEXT = 'test52';
const columns: (CsvColumn | null)[] = [
	{ tipo: 'section_id', model: 'component_section_id', columnName: 'section_id', lang: 'lg-nolan' },
	{ tipo: TEXT, model: 'component_input_text', columnName: TEXT, lang: 'lg-nolan' },
];

describe('row identity: a key we cannot read is refused, never guessed (DATA-22)', () => {
	test('a digit-prefixed key does NOT resolve to the leading digits', async () => {
		const plan = await planCsvImport([['12abc', 'a value']], columns, SECTION);
		expect(plan[0]?.sectionId).toBeNull();
		expect(plan[0]?.keyError).toContain("'12abc'");
	});

	test('a decimal key is refused (it named no record)', async () => {
		const plan = await planCsvImport([['1.5', 'a value']], columns, SECTION);
		expect(plan[0]?.sectionId).toBeNull();
		expect(plan[0]?.keyError).not.toBeNull();
	});

	/**
	 * THE RESIDUAL. The first fix read the cell with strict `Number()`, which does
	 * refuse '12abc' — but `Number` reads every numeric LITERAL JavaScript knows,
	 * and each of these is a positive safe integer, so each silently resolved to A
	 * RECORD THE OPERATOR NEVER NAMED. `wouldHaveBeen` is the record it hit,
	 * measured 2026-08-27; the premise is asserted below, so this table cannot
	 * quietly become a list of values that were never dangerous.
	 */
	const NUMERIC_BUT_NOT_A_RECORD_ID: readonly { cell: string; wouldHaveBeen: number }[] = [
		{ cell: '0x10', wouldHaveBeen: 16 },
		{ cell: '0b101', wouldHaveBeen: 5 },
		{ cell: '0o17', wouldHaveBeen: 15 },
		{ cell: '1e3', wouldHaveBeen: 1000 },
		{ cell: '+12', wouldHaveBeen: 12 },
		{ cell: '12.', wouldHaveBeen: 12 },
	];

	test('a numeric LITERAL that is not a decimal id is refused, naming the cell', async () => {
		for (const { cell, wouldHaveBeen } of NUMERIC_BUT_NOT_A_RECORD_ID) {
			// The premise: every one of these passes the OLD guard.
			expect(Number(cell)).toBe(wouldHaveBeen);
			expect(Number.isSafeInteger(Number(cell))).toBe(true);
			expect(Number(cell)).toBeGreaterThan(0);

			const plan = await planCsvImport([[cell, 'a value']], columns, SECTION);
			expect(plan[0]?.sectionId).toBeNull();
			expect(plan[0]?.keyError).toContain(`'${cell}'`);
		}
	});

	test('a digit run too long to be an exact integer is refused, not rounded', async () => {
		// Number('99999999999999999999') is 1e20 — finite, positive, and NOT the id
		// the cell names. The grammar accepts it; the arithmetic guard does not.
		const plan = await planCsvImport([['99999999999999999999', 'a value']], columns, SECTION);
		expect(plan[0]?.sectionId).toBeNull();
		expect(plan[0]?.keyError).not.toBeNull();
	});

	test('the accepted grammar is exactly a run of decimal digits', async () => {
		// Leading zeros are digits: '007' is record 7, as the frozen (int) cast read it.
		const padded = await planCsvImport([['007', 'a value']], columns, SECTION);
		expect(padded[0]?.sectionId).toBe(7);
		expect(padded[0]?.keyError).toBeNull();
		// Surrounding PHP-trimmed blanks are the reader's, not the id's.
		const spaced = await planCsvImport([['\t 42 \r', 'a value']], columns, SECTION);
		expect(spaced[0]?.sectionId).toBe(42);
	});

	test('a clean id still resolves, and an EMPTY key is not an error', async () => {
		const clean = await planCsvImport([['7', 'a value']], columns, SECTION);
		expect(clean[0]?.sectionId).toBe(7);
		expect(clean[0]?.keyError).toBeNull();
		const empty = await planCsvImport([['', 'a value']], columns, SECTION);
		expect(empty[0]?.sectionId).toBeNull();
		expect(empty[0]?.keyError).toBeNull();
	});

	test('the value the even-quote case used to mutilate arrives intact at the conform', async () => {
		const plan = await planCsvImport([['7', 'Alfonso X "el Sabio"']], columns, SECTION);
		expect(plan[0]?.columns[0]?.conform.result).toEqual([{ value: 'Alfonso X "el Sabio"' }]);
	});
});

/**
 * THE MARC DOOR NO LONGER READS AN ADDRESS AT ALL (DATA-08, closed 2026-08-30).
 *
 * THIS BLOCK USED TO ASSERT THE OPPOSITE, and the history is the point. DATA-22
 * closed the TRUNCATION corner here on 2026-08-27: `applyMarcMap` read
 * `field_to_section_id` with `Number.parseInt`, so a `907$a` of '12abc' wrote the
 * record over record 12, and the fix refused every cell the old reader had
 * invented a record out of. What it left standing was the larger defect
 * underneath — a cell of '900743' was still USED AS A section_id, so a library
 * control number addressed record 900743 of the section, whatever curated record
 * lived there, and `saveComponentData`'s upsert branch minted one when it did
 * not exist. The assertion `applyMarcMap(marcRecord('900743'), [], ID_SPEC)
 * .sectionId === 900743` pinned that as if it were the rule.
 *
 * The identifier is now carried VERBATIM as `code`, and the ADDRESS is resolved
 * at the tool door against the section's code component (`findSectionIdByCode`,
 * src/core/tools/import_code_lookup.ts) — which is what the frozen
 * `resolve_target_section` / `get_section_id_from_code` always did.
 *
 * SO THE DIFFERENTIAL ABOVE HAS LOST ITS SECOND COPY. There is no record-id
 * grammar left in marc21.ts to hold equal to the CSV planner's: the digits
 * grammar belongs to the CSV `section_id` COLUMN, which genuinely is a Dédalo
 * address, and the MARC door reads no address at all. What is pinned here
 * instead, over the SAME corpus, is the property that replaced it: no cell —
 * id-shaped or not — comes back as a record address.
 */
describe('the MARC door: an identifier is carried, never cast', () => {
	/** One record whose 907$a carries `id`. Built, not parsed: the value is the subject. */
	function marcRecord(id: string): MarcRecord {
		return {
			leader: '00000nam a2200000n a4500',
			fields: [
				{ tag: '907', indicator1: ' ', indicator2: ' ', subfields: [{ code: 'a', value: id }] },
			],
		};
	}
	const ID_SPEC = { field: '907', subfield: 'a' };

	/** A deterministic corpus of ID-SHAPED cells (a seeded LCG: a failure is reproducible). */
	function idCorpus(): string[] {
		const inputs = [
			'',
			' ',
			'0',
			'7',
			'007',
			'12',
			'12abc',
			'abc12',
			'1e3',
			'0x10',
			'0b101',
			'0o17',
			'+12',
			'-5',
			'12.',
			'12.5',
			'1 2',
			'REC-1',
			'ocm12345678',
			'.b12345678',
			'9007199254740991',
			'9007199254740993',
			'99999999999999999999',
			'\u00b912',
			'١٢',
		];
		const alphabet = ['0', '1', '9', 'a', 'x', '.', '-', '+', 'e', ' ', '\t', '\u00a0'];
		let seed = 20260827;
		const next = (): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed;
		};
		for (let i = 0; i < 3000; i++) {
			let value = '';
			const length = next() % 8;
			for (let c = 0; c < length; c++) value += alphabet[next() % alphabet.length] as string;
			inputs.push(value);
		}
		return inputs;
	}

	const ID_INPUTS = idCorpus();

	test('NO cell of the corpus comes back as a record address', () => {
		const addresses: string[] = [];
		for (const input of ID_INPUTS) {
			const mapped = applyMarcMap(marcRecord(input), [], ID_SPEC);
			// The whole answer, for every input: the trimmed cell, or null when the
			// record names none. Nothing numeric, nothing derived.
			const expected = input.trim() === '' ? null : input.trim();
			if (mapped.code !== expected) addresses.push(JSON.stringify(input));
			// And the field that used to carry the address is GONE, not merely
			// unset: a caller cannot read one back by habit.
			if ('sectionId' in mapped) addresses.push(`sectionId on ${JSON.stringify(input)}`);
		}
		expect(addresses).toEqual([]);
		// A census, quoted by the WC entry: a shrunk corpus is red, not quiet.
		expect(ID_INPUTS.length).toBe(3025);
	});

	/**
	 * Each of these is a cell the OLD readers acted on — `wouldHaveBeen` is the
	 * record `Number.parseInt` addressed (DATA-08 for the digit runs, which the
	 * DATA-22 fix left alone; DATA-22's own refusal population for the rest), so
	 * this cannot quietly become a list of values that were never dangerous.
	 */
	const MARC_IDS_THE_OLD_READERS_ACTED_ON: readonly { cell: string; wouldHaveBeen: number }[] = [
		{ cell: '900743', wouldHaveBeen: 900743 },
		{ cell: '007', wouldHaveBeen: 7 },
		{ cell: '42', wouldHaveBeen: 42 },
		{ cell: '12abc', wouldHaveBeen: 12 },
		{ cell: '1e3', wouldHaveBeen: 1 },
		{ cell: '12.5', wouldHaveBeen: 12 },
		{ cell: '0x10', wouldHaveBeen: 0 },
		{ cell: '-5', wouldHaveBeen: -5 },
	];

	test('a cell the old readers acted on is now carried verbatim, and refuses nothing', () => {
		for (const { cell, wouldHaveBeen } of MARC_IDS_THE_OLD_READERS_ACTED_ON) {
			// The premise: this cell used to reach a record write (or, after
			// DATA-22, a refusal) purely because a cast happened.
			expect(Number.parseInt(cell, 10)).toBe(wouldHaveBeen);
			// Now nothing casts, so nothing is dangerous and nothing is refused:
			// the value travels to the code lookup exactly as the file wrote it.
			expect(applyMarcMap(marcRecord(cell), [], ID_SPEC).code).toBe(cell);
		}
	});

	test('a blank, missing or unconfigured id field means the record names none', () => {
		// MARC pads its fields; the padding is the format's, never part of the id.
		expect(applyMarcMap(marcRecord('  .b900743 '), [], ID_SPEC).code).toBe('.b900743');
		// The spec points at a field this record does not carry.
		expect(applyMarcMap(marcRecord('900743'), [], { field: '001' }).code).toBeNull();
		// Present but blank.
		expect(applyMarcMap(marcRecord('   '), [], ID_SPEC).code).toBeNull();
		// And no spec at all (the tool config carries no field_to_section_id).
		expect(applyMarcMap(marcRecord('900743'), []).code).toBeNull();
	});
});

/**
 * ONE LAW, TWO IMPLEMENTATIONS — pinned equal until they can be one.
 *
 * `src/core/tools/import_csv.ts` and `src/diffusion/parsers/php_string.ts` both
 * export `phpTrim` with PHP's charlist. The planner CANNOT import the diffusion
 * one: that is a new non-facade core -> diffusion edge and
 * `test/unit/boundary_seam_tripwire.test.ts` refuses it (the allowed direction is
 * diffusion -> core). The durable fix is the `src/core/db/sql_identifier.ts`
 * precedent — move the leaf module INTO core and let diffusion import it downhill
 * — which touches files outside this change. Until then the two copies are held
 * byte-equal by execution rather than by hope: they agree today, and two
 * implementations of one law do not stay agreeing on their own.
 */
describe('phpTrim: one law, two implementations, no drift', () => {
	/** The characters the two charlists disagree about, plus ordinary data. */
	const TRIM_ALPHABET = [
		' ',
		'\t',
		'\n',
		'\r',
		'\0',
		'\v',
		'\f',
		'\u00A0',
		'\uFEFF',
		'\u2028',
		'\u3000',
		'x',
		'\u00e9',
		'\u4e2d',
	];

	/** A deterministic corpus — a seeded LCG, so a failure is reproducible. */
	function corpus(): string[] {
		const inputs: string[] = [''];
		// Every code point up to U+0400, at both edges and in the middle.
		for (let code = 0; code <= 0x400; code++) {
			const ch = String.fromCharCode(code);
			inputs.push(ch, `${ch}x`, `x${ch}`, `${ch}x${ch}`, `${ch}${ch}x y${ch}${ch}`);
		}
		let seed = 20260827;
		const next = (): number => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed;
		};
		for (let i = 0; i < 4000; i++) {
			let value = '';
			const length = next() % 12;
			for (let c = 0; c < length; c++) {
				value += TRIM_ALPHABET[next() % TRIM_ALPHABET.length] as string;
			}
			inputs.push(value);
		}
		return inputs;
	}

	const INPUTS = corpus();

	test('the two implementations answer identically over the whole corpus', () => {
		const divergences = INPUTS.filter((input) => phpTrim(input) !== phpTrimDiffusion(input));
		expect(divergences.map((input) => JSON.stringify(input))).toEqual([]);
		// A corpus that proved nothing would also report zero divergences: the size
		// is a CENSUS (the WC entry quotes it), so a shrunk corpus is red, not quiet.
		expect(INPUTS.length).toBe(9126);
	});

	test('the corpus actually exercises the PHP charlist (not a String.trim() alias)', () => {
		// If it did not, the agreement above would be an agreement about nothing.
		const differsFromJs = INPUTS.filter((input) => phpTrim(input) !== input.trim());
		expect(differsFromJs.length).toBeGreaterThan(0);
		// The two named cases the charlist exists for.
		expect(phpTrim('\u00A0Alfonso\u00A0')).toBe('\u00A0Alfonso\u00A0');
		expect(phpTrim('\0\u000bx\u000b\0')).toBe('x');
		expect(phpTrim('\fx\f')).toBe('\fx\f');
	});
});

// --- the write half: one file, the same section_id twice ---------------------
const USER = 987674;
const DUP_ID = 900742;
/** The id a REFUSED file names — it must never come into existence. */
const REFUSED_ID = 900745;
const CSV = 'csv_conformance_gate.csv';
const dir = resolve(config.media.rootPath ?? '', 'import/files', String(USER));
const bulkProcessIds: number[] = [];

afterAll(async () => {
	rmSync(dir, { recursive: true, force: true });
	await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		DUP_ID,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		DUP_ID,
	]);
	for (const id of bulkProcessIds) {
		await sql.unsafe(`DELETE FROM matrix_notes WHERE section_tipo = 'dd800' AND section_id = $1`, [
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
});

async function importCsv(csv: string): Promise<ImportFileReport> {
	mkdirSync(dir, { recursive: true });
	writeFileSync(resolve(dir, CSV), csv);
	const loaded = await getLoadedTool('tool_import_dedalo_csv');
	const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
		principal: await resolvePrincipal(-1),
		userId: USER,
		background: false,
		options: {
			time_machine_save: false,
			files: [
				{
					file: CSV,
					section_tipo: SECTION,
					bulk_process_label: 'csv conformance gate',
					ar_columns_map: [
						{ tipo: 'section_id', model: 'section_id' },
						{ tipo: TEXT, model: 'component_input_text', checked: true, map_to: TEXT },
					],
				},
			],
		},
	});
	const report = (res.data as { files: ImportFileReport[] }).files[0] as ImportFileReport;
	if (report.bulk_process_id !== null) bulkProcessIds.push(report.bulk_process_id);
	return report;
}

describe('the DOOR refuses the file, not merely the validator', () => {
	// The refusal has to be wired INTO the ingest door: a validator nobody calls
	// is exactly the shape of defect this remediation exists to remove.
	test('a ragged file is refused by import_files, and no record is written', async () => {
		const report = await importCsv(`section_id;${TEXT}\n${REFUSED_ID};a value\n${REFUSED_ID}\n`);
		expect(report.ok).toBe(false);
		expect(report.errors.join(' ')).toMatch(/row 3 has 1 columns but the header has 2/);
		expect(report.created).toEqual([]);
		const rows = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, REFUSED_ID],
		)) as { section_id: number }[];
		expect(rows).toEqual([]);
	});

	test('an unterminated enclosure is refused by import_files, and no record is written', async () => {
		const report = await importCsv(
			`section_id;${TEXT}\n${REFUSED_ID};"never closed\n${REFUSED_ID};second\n`,
		);
		expect(report.ok).toBe(false);
		expect(report.errors.join(' ')).toMatch(/opens a quoted field that is never closed/);
		expect(report.created).toEqual([]);
		const rows = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, REFUSED_ID],
		)) as { section_id: number }[];
		expect(rows).toEqual([]);
	});
});

/** The validate_import per-file report (the preflight's answer for one file). */
interface ValidateFileReport {
	ok: boolean;
	errors: string[];
	notices: string[];
	failed: { msg: string; row?: number }[];
	rows_sampled: number;
}

async function validateCsv(csv: string): Promise<ValidateFileReport> {
	mkdirSync(dir, { recursive: true });
	writeFileSync(resolve(dir, CSV), csv);
	const loaded = await getLoadedTool('tool_import_dedalo_csv');
	const res = await mustGet(loaded!.module.apiActions.validate_import, 'validate_import').handler({
		principal: await resolvePrincipal(-1),
		userId: USER,
		background: false,
		options: {
			files: [
				{
					file: CSV,
					section_tipo: SECTION,
					ar_columns_map: [
						{ tipo: 'section_id', model: 'section_id' },
						{ tipo: TEXT, model: 'component_input_text', checked: true, map_to: TEXT },
					],
				},
			],
		},
	});
	return (res.data as { files: ValidateFileReport[] }).files[0] as ValidateFileReport;
}

/**
 * THE PREFLIGHT SEES WHAT THE DOOR SEES (the composition half of the fix).
 *
 * validate_import is the only preflight an operator has, and "validated clean,
 * then imported nothing" is the worst answer it can give: it moves the discovery
 * of a broken file from before the run to after it. Both refusal classes are
 * asserted through the REAL action, not through the helpers underneath it — a
 * refusal the door makes and the preflight cannot see is exactly the defect.
 */
describe('validate_import surfaces every refusal the import would make', () => {
	test('a section_id cell that is not a record id is reported, per row', async () => {
		const report = await validateCsv(`section_id;${TEXT}\n0x10;a value\n`);
		expect(report.ok).toBe(false);
		expect(report.failed.map((issue) => issue.msg).join(' ')).toContain("'0x10'");
		// Named by the CSV row number the operator has to go and look at.
		expect(report.failed[0]?.row).toBe(2);
		// A skipped row is not a FILE error: the map itself is fine.
		expect(report.errors).toEqual([]);
	});

	test("a ragged file is refused by the preflight, with the door's own sentence", async () => {
		const report = await validateCsv(`section_id;${TEXT}\n1;a value\n2\n`);
		expect(report.ok).toBe(false);
		expect(report.errors.join(' ')).toMatch(/row 3 has 1 columns but the header has 2/);
	});

	test('an unterminated enclosure is refused by the preflight too', async () => {
		const report = await validateCsv(`section_id;${TEXT}\n1;"never closed\n2;second\n`);
		expect(report.ok).toBe(false);
		expect(report.errors.join(' ')).toMatch(/opens a quoted field that is never closed/);
	});

	test('a clean file validates clean — the assertions above are not vacuous', async () => {
		const report = await validateCsv(`section_id;${TEXT}\n900746;a value\n`);
		expect(report.errors).toEqual([]);
		expect(report.failed).toEqual([]);
		expect(report.ok).toBe(true);
	});
});

describe('the same section_id twice in one file (DATA-21)', () => {
	test('the second row is an UPDATE, and the record holds the last row it was given', async () => {
		const report = await importCsv(
			`section_id;${TEXT}\n${DUP_ID};first pass\n${DUP_ID};second pass\n`,
		);
		expect(report.failed).toEqual([]);
		// The defect: BOTH rows were reported created, so the report claimed two
		// records where one exists — and the second row's values had silently
		// replaced the first row's.
		expect(report.created).toEqual([DUP_ID]);
		expect(report.updated).toEqual([DUP_ID]);

		const rows = (await sql.unsafe(
			`SELECT string -> '${TEXT}' AS value FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, DUP_ID],
		)) as { value: { value?: string }[] | null }[];
		expect(rows[0]?.value?.[0]?.value).toBe('second pass');
	});
});
