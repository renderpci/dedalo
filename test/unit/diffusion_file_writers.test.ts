/**
 * Tabular file writers (csv/json/markdown) + shared file infrastructure —
 * P3 slice-1 gates (DIFFUSION_PLAN P3; DIFFUSION_SPEC §4.3):
 *
 * - csv: RFC4180 quoting matrix (comma/quote/newline/utf8/null), header
 *   order with excludeColumn omitted, streamed temp finalized by atomic
 *   rename (no .tmp-* survivors), same-run removeRecords filtering, the
 *   honest no-write warning, multi-file zip;
 * - json: NDJSON lines parse and carry only plan columns, meta sidecar,
 *   removal line-filter;
 * - markdown: ONE file per section_id grouping every lang, the EXACT
 *   delete-side name grammar (`{section_tipo}_{section_id}.md` — kept in
 *   lockstep with diffusion_delete.ts/PHP get_record_file_path), unlink
 *   idempotency, zip;
 * - shared: abort() leaves no temps, PKZIP structure of created archives,
 *   registry resolution + UnknownDiffusionFormatError.
 *
 * ALL paths live under a per-process temp root injected via the documented
 * DEDALO_DIFFUSION_FILES_ROOT override (files.ts) — the real media tree is
 * NEVER touched.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import { csvField, csvWriter } from '../../src/diffusion/writers/csv.ts';
import { atomicWriteFile, createZip, recordFileName } from '../../src/diffusion/writers/files.ts';
import { jsonWriter } from '../../src/diffusion/writers/json.ts';
import { markdownWriter, renderMarkdownRecord } from '../../src/diffusion/writers/markdown.ts';
import {
	UnknownDiffusionFormatError,
	getDiffusionWriter,
} from '../../src/diffusion/writers/registry.ts';

const ROOT = `${tmpdir()}/dedalo_ts_diffusion_file_writers_${process.pid}`;
let savedRoot: string | undefined;

beforeAll(() => {
	savedRoot = process.env.DEDALO_DIFFUSION_FILES_ROOT;
	process.env.DEDALO_DIFFUSION_FILES_ROOT = ROOT;
	mkdirSync(ROOT, { recursive: true });
});

afterAll(() => {
	if (savedRoot !== undefined) process.env.DEDALO_DIFFUSION_FILES_ROOT = savedRoot;
	// biome-ignore lint/performance/noDelete: assigning undefined would leave the string 'undefined' in process.env
	else delete process.env.DEDALO_DIFFUSION_FILES_ROOT;
	rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures

function field(columnName: string, excludeColumn = false): FieldPlan {
	return {
		id: `fwt${columnName}`,
		columnName,
		sourceChain: [],
		transform: [],
		column: { fieldModel: 'field_text' },
		policy: {},
		excludeColumn,
	};
}

function section(tableName: string, sectionTipo: string, fields: FieldPlan[]): SectionPlan {
	return { sectionTipo, tableName, tableTipo: `${sectionTipo}_table`, fields };
}

function plan(format: string, sections: SectionPlan[], serviceName = 'testsvc'): PublicationPlan {
	return {
		planId: `filewriters_test_${format}`,
		elementTipo: 'fwtest1',
		format,
		serviceName,
		target: { kind: 'files', serviceName },
		sections,
		recursion: { maxLevels: 2 },
		langPolicy: { langs: ['lg-eng', 'lg-spa'], mainLang: 'lg-eng' },
		warnings: [],
	};
}

function row(
	sectionId: number | string,
	lang: string | null,
	columns: Record<string, string | null>,
): ProjectedRow {
	return { sectionId, lang, columns };
}

/** No stray temp artifacts under a directory (atomic-rename proof). */
function tempFilesIn(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((name) => name.includes('.tmp-'));
}

/** Minimal PKZIP structural read: entry names + central-directory count. */
function readZipStructure(zipPath: string): { names: string[]; count: number } {
	const bytes = readFileSync(zipPath);
	// local file header signature at byte 0
	expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
	// end of central directory
	let eocd = -1;
	for (let index = bytes.length - 22; index >= 0; index--) {
		if (bytes.readUInt32LE(index) === 0x06054b50) {
			eocd = index;
			break;
		}
	}
	expect(eocd).toBeGreaterThanOrEqual(0);
	const count = bytes.readUInt16LE(eocd + 10);
	const cdSize = bytes.readUInt32LE(eocd + 12);
	const cdOffset = bytes.readUInt32LE(eocd + 16);
	// walk the central directory records
	const names: string[] = [];
	let cursor = cdOffset;
	while (cursor < cdOffset + cdSize) {
		expect(bytes.readUInt32LE(cursor)).toBe(0x02014b50);
		const nameLength = bytes.readUInt16LE(cursor + 28);
		const extraLength = bytes.readUInt16LE(cursor + 30);
		const commentLength = bytes.readUInt16LE(cursor + 32);
		names.push(bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf-8'));
		cursor += 46 + nameLength + extraLength + commentLength;
	}
	expect(names.length).toBe(count);
	return { names, count };
}

// ---------------------------------------------------------------- registry

describe('writer registry (spec §4.3: unknown format is LOUD)', () => {
	test('csv/json/markdown resolve to their writers', () => {
		expect(getDiffusionWriter('csv').format).toBe('csv');
		expect(getDiffusionWriter('json').format).toBe('json');
		expect(getDiffusionWriter('markdown').format).toBe('markdown');
	});

	test('unknown format throws UnknownDiffusionFormatError', () => {
		expect(() => getDiffusionWriter('carrier-pigeon')).toThrow(UnknownDiffusionFormatError);
	});
});

// --------------------------------------------------------------------- csv

describe('csv writer', () => {
	test('csvField: RFC4180 quoting matrix', () => {
		expect(csvField('plain')).toBe('plain');
		expect(csvField('a,b')).toBe('"a,b"');
		expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
		expect(csvField('line1\nline2')).toBe('"line1\nline2"');
		expect(csvField('cr\rlf')).toBe('"cr\rlf"');
		expect(csvField('daño λόγος 例')).toBe('daño λόγος 例'); // utf8 passes bare
		expect(csvField('')).toBe('');
	});

	test('streamed file: header order, excludeColumn omitted, quoting, no BOM, no temps', async () => {
		const sectionPlan = section('objects', 'fwt5', [
			field('name'),
			field('hidden', true), // resolution-only: MUST NOT reach the file
			field('notes'),
		]);
		const session = await csvWriter.open(plan('csv', [sectionPlan], 'svc_basic'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { name: 'comma, inc', hidden: 'NEVER', notes: 'a "quoted" word' }),
			row(1, 'lg-spa', { name: 'línea\nrota', hidden: 'NEVER', notes: null }),
		]);
		const summary = await session.close();

		const dir = `${ROOT}/csv/svc_basic`;
		const content = readFileSync(`${dir}/objects.csv`, 'utf-8');
		expect(content.charCodeAt(0)).not.toBe(0xfeff); // no BOM
		expect(content).toBe(
			'section_id,lang,name,notes\n' +
				'1,lg-eng,"comma, inc","a ""quoted"" word"\n' +
				'1,lg-spa,"línea\nrota",\n',
		);
		expect(content).not.toContain('NEVER');
		expect(tempFilesIn(dir)).toEqual([]);
		expect(summary.tables).toEqual([
			{ table_name: 'objects', records_affected: 2, records_count: 2 },
		]);
		expect(summary.errors).toEqual([]);
	});

	test('same-run removeRecords filters rows out at finalize (quoted newlines survive)', async () => {
		const sectionPlan = section('things', 'fwt6', [field('name')]);
		const session = await csvWriter.open(plan('csv', [sectionPlan], 'svc_remove'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { name: 'keep\nme' }), // embedded newline: boundary detection test
			row(2, 'lg-eng', { name: 'drop me' }),
			row(3, 'lg-eng', { name: 'keep, too' }),
		]);
		await session.removeRecords(sectionPlan, [2]);
		const summary = await session.close();

		const content = readFileSync(`${ROOT}/csv/svc_remove/things.csv`, 'utf-8');
		expect(content).toBe('section_id,lang,name\n1,lg-eng,"keep\nme"\n3,lg-eng,"keep, too"\n');
		expect(summary.tables).toEqual([
			{ table_name: 'things', records_affected: 3, records_count: 2 },
		]);
		expect(tempFilesIn(`${ROOT}/csv/svc_remove`)).toEqual([]);
	});

	test('removeRecords without a same-run write is an honest warning no-op', async () => {
		const sectionPlan = section('ghosts', 'fwt7', [field('name')]);
		const session = await csvWriter.open(plan('csv', [sectionPlan], 'svc_warn'));
		await session.ensureSchema();
		const result = await session.removeRecords(sectionPlan, [9]);
		expect(result).toEqual({ written: 0, deleted: 0 });
		const summary = await session.close();
		expect(summary.errors.length).toBe(1);
		expect(summary.errors[0]).toContain('full-export');
		expect(existsSync(`${ROOT}/csv/svc_warn/ghosts.csv`)).toBe(false);
	});

	test('two sections → two csvs + a structurally valid zip', async () => {
		const sectionA = section('alpha', 'fwt8', [field('name')]);
		const sectionB = section('beta', 'fwt9', [field('name')]);
		const session = await csvWriter.open(plan('csv', [sectionA, sectionB], 'svc_zip'));
		await session.ensureSchema();
		await session.writeRows(sectionA, [row(1, 'lg-eng', { name: 'a' })]);
		await session.writeRows(sectionB, [row(1, 'lg-eng', { name: 'b' })]);
		await session.close();

		const zip = readZipStructure(`${ROOT}/csv/svc_zip/diffusion_csv.zip`);
		expect(zip.count).toBe(2);
		expect(zip.names.sort()).toEqual(['alpha.csv', 'beta.csv']);
	});

	test('abort removes the streamed temp and never lands a final file', async () => {
		const sectionPlan = section('aborted', 'fwt10', [field('name')]);
		const session = await csvWriter.open(plan('csv', [sectionPlan], 'svc_abort'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(1, 'lg-eng', { name: 'gone' })]);
		await session.abort();
		const dir = `${ROOT}/csv/svc_abort`;
		expect(tempFilesIn(dir)).toEqual([]);
		expect(existsSync(`${dir}/aborted.csv`)).toBe(false);
	});
});

// -------------------------------------------------------------------- json

describe('json writer', () => {
	test('NDJSON lines parse, plan columns only, meta sidecar, no temps', async () => {
		const sectionPlan = section('objects', 'fwt11', [field('name'), field('secret', true)]);
		const session = await jsonWriter.open(plan('json', [sectionPlan], 'svc_json'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { name: 'first', secret: 'NEVER', stray: 'NEVER' }),
			row(1, 'lg-spa', { name: null }),
		]);
		const summary = await session.close();

		const dir = `${ROOT}/json/svc_json`;
		const lines = readFileSync(`${dir}/objects.ndjson`, 'utf-8').trim().split('\n');
		expect(lines.length).toBe(2);
		const first = JSON.parse(lines[0] as string);
		expect(first).toEqual({ section_id: 1, lang: 'lg-eng', columns: { name: 'first' } });
		const second = JSON.parse(lines[1] as string);
		expect(second).toEqual({ section_id: 1, lang: 'lg-spa', columns: { name: null } });

		const meta = JSON.parse(readFileSync(`${dir}/objects.meta.json`, 'utf-8'));
		expect(meta.table_name).toBe('objects');
		expect(meta.section_tipo).toBe('fwt11');
		expect(meta.columns).toEqual(['name']); // excludeColumn omitted here too
		expect(meta.langs).toEqual(['lg-eng', 'lg-spa']);
		expect(meta.records_count).toBe(2);
		expect(tempFilesIn(dir)).toEqual([]);
		expect(summary.tables).toEqual([
			{ table_name: 'objects', records_affected: 2, records_count: 2 },
		]);
	});

	test('same-run removeRecords drops the record lines; counts land in meta + summary', async () => {
		const sectionPlan = section('things', 'fwt12', [field('name')]);
		const session = await jsonWriter.open(plan('json', [sectionPlan], 'svc_json_rm'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { name: 'keep' }),
			row(2, 'lg-eng', { name: 'drop' }),
		]);
		await session.removeRecords(sectionPlan, [2]);
		const summary = await session.close();

		const dir = `${ROOT}/json/svc_json_rm`;
		const lines = readFileSync(`${dir}/things.ndjson`, 'utf-8').trim().split('\n');
		expect(lines.length).toBe(1);
		expect(JSON.parse(lines[0] as string).section_id).toBe(1);
		const meta = JSON.parse(readFileSync(`${dir}/things.meta.json`, 'utf-8'));
		expect(meta.records_count).toBe(1);
		expect(meta.records_removed).toBe(1);
		expect(summary.tables).toEqual([
			{ table_name: 'things', records_affected: 2, records_count: 1 },
		]);
	});

	test('removeRecords without a same-run write warns (full-export stance)', async () => {
		const sectionPlan = section('ghosts', 'fwt13', [field('name')]);
		const session = await jsonWriter.open(plan('json', [sectionPlan], 'svc_json_warn'));
		await session.ensureSchema();
		await session.removeRecords(sectionPlan, [5]);
		const summary = await session.close();
		expect(summary.errors.length).toBe(1);
		expect(summary.errors[0]).toContain('full-export');
	});

	test('abort removes temps, lands nothing', async () => {
		const sectionPlan = section('aborted', 'fwt14', [field('name')]);
		const session = await jsonWriter.open(plan('json', [sectionPlan], 'svc_json_abort'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(1, 'lg-eng', { name: 'gone' })]);
		await session.abort();
		const dir = `${ROOT}/json/svc_json_abort`;
		expect(tempFilesIn(dir)).toEqual([]);
		expect(existsSync(`${dir}/aborted.ndjson`)).toBe(false);
		expect(existsSync(`${dir}/aborted.meta.json`)).toBe(false);
	});
});

// ---------------------------------------------------------------- markdown

describe('markdown writer', () => {
	test('per-record grouping: one .md per section_id with every lang, delete-side name grammar', async () => {
		const sectionPlan = section('objects', 'fwt20', [field('name'), field('notes')]);
		const session = await markdownWriter.open(plan('markdown', [sectionPlan], 'svc_md'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(7, 'lg-eng', { name: 'Chair', notes: null }),
			row(7, 'lg-spa', { name: 'Silla', notes: 'nota' }),
			row(8, 'lg-eng', { name: 'Table', notes: '' }),
			row(8, 'lg-spa', { name: 'Mesa', notes: null }),
		]);
		const summary = await session.close();

		const dir = `${ROOT}/markdown/svc_md`;
		// EXACT delete-side grammar: {section_tipo}_{section_id}.md
		// (diffusion_delete.ts resolvePublishedFilePath / PHP get_record_file_path)
		expect(recordFileName('fwt20', 7, 'md')).toBe('fwt20_7.md');
		const doc = readFileSync(`${dir}/fwt20_7.md`, 'utf-8');
		expect(existsSync(`${dir}/fwt20_8.md`)).toBe(true);

		expect(doc.startsWith('---\n')).toBe(true);
		expect(doc).toContain('section_tipo: "fwt20"');
		expect(doc).toContain('section_id: "7"');
		expect(doc).toContain('diffusion_element: "fwtest1"');
		expect(doc).toContain('# objects');
		expect(doc).toContain('## lg-eng');
		expect(doc).toContain('## lg-spa');
		expect(doc).toContain('**name**: Chair');
		expect(doc).toContain('**name**: Silla');
		expect(doc).toContain('**notes**: nota');
		// null/empty columns omitted (compact documents)
		expect(doc.match(/\*\*notes\*\*/g)?.length).toBe(1);
		// determinism: no wall-clock anywhere (ledgered divergence from PHP)
		expect(doc).not.toMatch(/20\d\d-/);

		expect(summary.tables).toEqual([
			{ table_name: 'objects', records_affected: 2, records_count: 4 },
		]);
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('renderMarkdownRecord neutralizes structure-breaking values (PHP sanitize_md_value)', () => {
		const sectionPlan = section('objects', 'fwt21', [field('name')]);
		const doc = renderMarkdownRecord(plan('markdown', [sectionPlan]), sectionPlan, 1, [
			row(1, 'lg-eng', { name: '# fake header\n---\nrest' }),
		]);
		expect(doc).toContain('\\# fake header');
		expect(doc).toContain('\\-\\-\\-');
	});

	test('removeRecords unlinks; missing file is idempotent success', async () => {
		const sectionPlan = section('objects', 'fwt22', [field('name')]);
		const session = await markdownWriter.open(plan('markdown', [sectionPlan], 'svc_md_rm'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [row(3, 'lg-eng', { name: 'gone soon' })]);

		const first = await session.removeRecords(sectionPlan, [3]);
		expect(first).toEqual({ written: 0, deleted: 1 });
		expect(existsSync(`${ROOT}/markdown/svc_md_rm/fwt22_3.md`)).toBe(false);

		// second removal: nothing there — idempotent success, zero deletions
		const second = await session.removeRecords(sectionPlan, [3, 99]);
		expect(second).toEqual({ written: 0, deleted: 0 });

		// the removed record never reaches the zip; run wrote nothing else
		const summary = await session.close();
		expect(existsSync(`${ROOT}/markdown/svc_md_rm/diffusion_md.zip`)).toBe(false);
		expect(summary.errors).toEqual([]);
	});

	test('close zips the run files (ZIP only, no merged document — PHP parity)', async () => {
		const sectionPlan = section('objects', 'fwt23', [field('name')]);
		const session = await markdownWriter.open(plan('markdown', [sectionPlan], 'svc_md_zip'));
		await session.ensureSchema();
		await session.writeRows(sectionPlan, [
			row(1, 'lg-eng', { name: 'one' }),
			row(2, 'lg-eng', { name: 'two' }),
		]);
		await session.close();

		const dir = `${ROOT}/markdown/svc_md_zip`;
		const zip = readZipStructure(`${dir}/diffusion_md.zip`);
		expect(zip.names.sort()).toEqual(['fwt23_1.md', 'fwt23_2.md']);
		// no merged .md beyond the per-record files + zip
		expect(readdirSync(dir).sort()).toEqual(['diffusion_md.zip', 'fwt23_1.md', 'fwt23_2.md']);
	});
});

// ------------------------------------------------------------ shared infra

describe('shared file infrastructure', () => {
	test('atomicWriteFile creates parents, leaves no temp', () => {
		const target = `${ROOT}/infra/deep/nested/file.txt`;
		atomicWriteFile(target, 'payload');
		expect(readFileSync(target, 'utf-8')).toBe('payload');
		expect(tempFilesIn(`${ROOT}/infra/deep/nested`)).toEqual([]);
	});

	test('createZip: valid PKZIP with flat basename entries; skips missing inputs', async () => {
		const dir = `${ROOT}/infra/zip`;
		mkdirSync(dir, { recursive: true });
		writeFileSync(`${dir}/one.txt`, 'first');
		writeFileSync(`${dir}/two.txt`, 'second');
		await createZip([`${dir}/one.txt`, `${dir}/two.txt`, `${dir}/missing.txt`], `${dir}/out.zip`);
		const zip = readZipStructure(`${dir}/out.zip`);
		expect(zip.names.sort()).toEqual(['one.txt', 'two.txt']);
		expect(tempFilesIn(dir)).toEqual([]);
	});

	test('createZip throws when no valid entries remain', async () => {
		const dir = `${ROOT}/infra/zip_empty`;
		mkdirSync(dir, { recursive: true });
		await expect(createZip([`${dir}/nope.txt`], `${dir}/out.zip`)).rejects.toThrow(
			'no valid files',
		);
	});
});
