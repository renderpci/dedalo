/**
 * CSV import APPEND mode — TS-NATIVE door gate (plan §7), driven THROUGH the
 * tool's real `import_files` / `validate_import` handlers (and, for the undo,
 * `tool_time_machine`'s bulk revert) against the suite database.
 *
 * Written by an author independent of the code under test: it pins the
 * operator-visible outcomes, not the implementation's spellings.
 *
 *  - portal: append adds the new locator, stored locators stay byte-identical;
 *    re-importing the same file changes nothing and says so per column;
 *  - translatable input_text: a multi-lang cell's translations SHARE one fresh
 *    id; languages the cell does not name stay untouched;
 *  - an empty cell and an empty lang group (`{"lg-spa":[]}`) write NOTHING;
 *  - geolocation: a flat point becomes a Point layer 2, a GeoJSON cell becomes
 *    layer 3; stored layer 1 and the stored centre stay byte-identical;
 *  - text_area: a paragraph is appended; a value carrying an index tag is
 *    refused and the row rolls back;
 *  - dataframe: with the slot column BEFORE its main column, the frame is
 *    re-paired to the main item's FINAL id (not the file id);
 *  - the cap (`data_limit`, refusal code `selection_limit`): exceeding it rolls
 *    the WHOLE row back, including an earlier column's append;
 *  - refusals at the door: image, select, radio_button, the section_id key and
 *    dd199 in append mode refuse the whole file and write NO dd800 record; an
 *    unknown import_mode does the same;
 *  - bulk revert (time machine on) restores the pre-import state — also over
 *    data with NO time-machine history, or STALE history whose newest row a
 *    later TM-off write (a TM-off import, legacy replace frames) left behind:
 *    the append writes a pre-append baseline row whenever that row differs —
 *    but never when that row is the SAME run's (a repeated section_id whose
 *    slice drifted between two appends): the pre-run state lies below it.
 *
 * Scratch surface: test3 records created at runtime (createSectionRecord, the
 * generic `test` TLD playground), one orphan zz scratch node (a capped
 * portal), a per-user import dir under the (marked) test media root. Every
 * record, TM row, dd800 run and the node are swept after; residue asserted.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { isDataframeEntry } from '../../src/core/concepts/subdatum.ts';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { recordTimeMachine } from '../../src/core/db/time_machine.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionData } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import type { ImportFileReport } from '../../src/core/tools/import_wire.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { mustGet } from '../helpers/assert.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const USER = 987671; // this gate's own import dir
const TEXT = 'test52'; // component_input_text, translatable
const TEXT_AREA = 'test17'; // component_text_area, translatable
const PORTAL = 'test80'; // component_portal → test3
const GEO = 'test100'; // component_geolocation
const DATAFRAME = 'test60'; // component_dataframe
const IMAGE = 'test99'; // component_image (media)
const SELECT = 'test91'; // component_select
const RADIO = 'test87'; // component_radio_button
const CREATED_DATE = 'dd199'; // audit tipo, component_date
/** Orphan scratch node: a portal with data_limit 1 targeting test3. */
const CAP_TLD = 'zzcsvap';
const CAPPED = `${CAP_TLD}1`;
/** Orphan scratch node: a NON-translatable component_input_text (one lg-nolan slice). */
const MONO_TEXT = `${CAP_TLD}2`;
/** Orphan scratch node: a component_alias of the translatable input_text (TEXT). */
const TEXT_ALIAS = `${CAP_TLD}3`;
/** Orphan scratch node: a component_alias of the created-date audit tipo. */
const CREATED_DATE_ALIAS = `${CAP_TLD}4`;
/** Orphan scratch node: a translatable input_text MAIN with a real dataframe slot child. */
const FRAMED_MAIN = `${CAP_TLD}5`;
/** Orphan scratch node: the component_dataframe SLOT of FRAMED_MAIN (ontology child). */
const FRAMED_SLOT = `${CAP_TLD}6`;

const dir = resolve(config.media.rootPath ?? '', 'import/files', String(USER));
const created: number[] = [];
const bulkProcessIds: number[] = [];

async function newRecord(): Promise<number> {
	const id = await createSectionRecord(SECTION, -1);
	created.push(id);
	return id;
}

let targetA = 0;
let targetB = 0;
let targetC = 0;

// ---------------------------------------------------------------- helpers

interface ImportOptions {
	file?: string;
	timeMachine?: boolean;
}

async function importCsv(
	csv: string,
	columnsMap: Record<string, unknown>[],
	options: ImportOptions = {},
): Promise<ImportFileReport> {
	const file = options.file ?? 'append_gate.csv';
	writeFileSync(resolve(dir, file), csv);
	const loaded = await getLoadedTool('tool_import_dedalo_csv');
	const res = await mustGet(loaded?.module.apiActions.import_files, 'import_files').handler({
		principal: await resolvePrincipal(-1),
		userId: USER,
		background: false,
		options: {
			time_machine_save: options.timeMachine ?? true,
			files: [
				{ file, section_tipo: SECTION, bulk_process_label: file, ar_columns_map: columnsMap },
			],
		},
	});
	const report = (res.data as { files: ImportFileReport[] }).files[0] as ImportFileReport;
	if (report.bulk_process_id !== null) bulkProcessIds.push(report.bulk_process_id);
	return report;
}

async function validateCsv(
	csv: string,
	columnsMap: Record<string, unknown>[],
	file: string,
): Promise<Record<string, unknown>> {
	writeFileSync(resolve(dir, file), csv);
	const loaded = await getLoadedTool('tool_import_dedalo_csv');
	const res = await mustGet(loaded?.module.apiActions.validate_import, 'validate_import').handler({
		principal: await resolvePrincipal(-1),
		userId: USER,
		background: false,
		options: { files: [{ file, section_tipo: SECTION, ar_columns_map: columnsMap }] },
	});
	return (res.data as { files: Record<string, unknown>[] }).files[0] as Record<string, unknown>;
}

/** A column map entry for `tipo` (header cell = tipo). */
function col(tipo: string, model: string, mode?: string): Record<string, unknown> {
	const entry: Record<string, unknown> = { tipo, model, checked: true, map_to: tipo };
	if (mode !== undefined) entry.import_mode = mode;
	return entry;
}
const KEY = { tipo: 'section_id', model: 'section_id' };

/** CSV-quote a cell (doubling inner quotes). */
const q = (value: string): string => `"${value.replace(/"/g, '""')}"`;

async function stored(sectionId: number, column: string, tipo: string): Promise<unknown[]> {
	const rows = (await sql.unsafe(
		`SELECT ${column}->$3 AS value FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, tipo],
	)) as { value: unknown[] | null }[];
	return rows[0]?.value ?? [];
}

async function seed(sectionId: number, column: string, tipo: string, items: unknown[]) {
	await sql.unsafe(
		`UPDATE ${TABLE}
		 SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($2::text, $3::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $4`,
		[SECTION, tipo, JSON.stringify(items), sectionId],
	);
}

/** Bulk-revert one dd800 run through the real tool action; the revert's own run is swept. */
async function revertRun(bulkId: number | null): Promise<{ skipped: unknown[] }> {
	const response = await toolTimeMachineBulkRevert({
		principal: await resolvePrincipal(-1),
		userId: -1,
		background: false,
		options: { section_tipo: SECTION, bulk_process_id: mustGet(bulkId, 'append run bulk id') },
	} as ToolActionContext);
	const data = response.data as { bulk_process_id: number; skipped: unknown[] };
	bulkProcessIds.push(data.bulk_process_id);
	return data;
}

/** Items sorted by lang then value — the order-free comparison of two stored arrays. */
const byLangValue = (items: unknown[]): unknown[] =>
	[...(items as Record<string, unknown>[])].sort((a, b) =>
		`${String(a.lang)}|${String(a.value)}`.localeCompare(`${String(b.lang)}|${String(b.value)}`),
	);

async function tmRows(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS n FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
		[SECTION, sectionId],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** dd800 runs whose source-file component names `file` (unique per refusal test). */
async function bulkRunsFor(file: string): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_notes
		 WHERE section_tipo = 'dd800' AND string->'dd797' @> $1::text::jsonb`,
		[JSON.stringify([{ value: file }])],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

type Item = Record<string, unknown>;

// ---------------------------------------------------------------- lifecycle

beforeAll(async () => {
	await assertTestDatabase('import_csv_append_native');
	mkdirSync(dir, { recursive: true });
	targetA = await newRecord();
	targetB = await newRecord();
	targetC = await newRecord();
	await deleteTldNodes(CAP_TLD);
	await upsertDdOntologyNode({
		tipo: CAPPED,
		parent: `${CAP_TLD}x`,
		model: 'component_portal',
		tld: CAP_TLD,
		term: { 'lg-spa': 'scratch csv append cap portal' },
		is_model: false,
		is_translatable: false,
		is_main: false,
		properties: {
			data_limit: 1,
			source: {
				request_config: [{ sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] } }],
			},
		},
	});
	await upsertDdOntologyNode({
		tipo: MONO_TEXT,
		parent: `${CAP_TLD}x`,
		model: 'component_input_text',
		tld: CAP_TLD,
		term: { 'lg-spa': 'scratch csv append non-translatable text' },
		is_model: false,
		is_translatable: false,
		is_main: false,
		properties: {},
	});
	await upsertDdOntologyNode({
		tipo: FRAMED_MAIN,
		parent: `${CAP_TLD}x`,
		model: 'component_input_text',
		tld: CAP_TLD,
		term: { 'lg-spa': 'scratch csv append framed main' },
		is_model: false,
		is_translatable: true,
		is_main: false,
		properties: {},
	});
	await upsertDdOntologyNode({
		tipo: FRAMED_SLOT,
		parent: FRAMED_MAIN,
		model: 'component_dataframe',
		tld: CAP_TLD,
		term: { 'lg-spa': 'scratch csv append framed slot' },
		is_model: false,
		is_translatable: false,
		is_main: false,
		properties: {},
	});
	for (const [tipo, target] of [
		[TEXT_ALIAS, TEXT],
		[CREATED_DATE_ALIAS, CREATED_DATE],
	] as const) {
		await upsertDdOntologyNode({
			tipo,
			parent: `${CAP_TLD}x`,
			model: 'component_alias',
			tld: CAP_TLD,
			term: { 'lg-spa': `scratch csv append alias of ${target}` },
			is_model: false,
			is_translatable: false,
			is_main: false,
			properties: { alias_of: target },
		});
	}
	await clearOntologyDerivedCaches();
}, 30000);

afterAll(async () => {
	rmSync(dir, { recursive: true, force: true });
	await deleteTldNodes(CAP_TLD);
	await clearOntologyDerivedCaches();
	for (const id of created) await cleanScratchRecord(SECTION, id, TABLE);
	for (const id of bulkProcessIds) {
		await sql.unsafe(`DELETE FROM matrix_notes WHERE section_tipo = 'dd800' AND section_id = $1`, [
			id,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
	const residue = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_tipo = $1 AND section_id = ANY(string_to_array($2, ',')::int[])`,
		[SECTION, created.join(',')],
	)) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
});

// ---------------------------------------------------------------- portal

describe('portal append', () => {
	test('adds the new locator, keeps the stored one byte-identical; a re-import is a reported no-op', async () => {
		const host = await newRecord();
		const seeded = await importCsv(`section_id;${PORTAL}\n${host};${targetA}\n`, [
			KEY,
			col(PORTAL, 'component_portal'),
		]);
		expect(seeded.failed).toEqual([]);
		const before = (await stored(host, 'relation', PORTAL)) as Item[];
		expect(before).toHaveLength(1);
		expect(before[0]).toMatchObject({ section_tipo: SECTION, section_id: targetA });

		const appended = await importCsv(`section_id;${PORTAL}\n${host};${targetB}\n`, [
			KEY,
			col(PORTAL, 'component_portal', 'append'),
		]);
		expect(appended.failed).toEqual([]);
		expect(appended.errors).toEqual([]);
		expect(appended.warnings).toEqual([]);
		const after = (await stored(host, 'relation', PORTAL)) as Item[];
		expect(after).toHaveLength(2);
		expect(after[0]).toEqual(mustGet(before[0], 'seeded locator'));
		expect(after[1]).toMatchObject({
			section_tipo: SECTION,
			section_id: targetB,
			from_component_tipo: PORTAL,
		});
		expect(after[1]?.id).not.toBe(after[0]?.id);

		// the SAME file again: nothing changes, and the report says so
		const again = await importCsv(`section_id;${PORTAL}\n${host};${targetB}\n`, [
			KEY,
			col(PORTAL, 'component_portal', 'append'),
		]);
		expect(again.failed).toEqual([]);
		expect(again.updated).toEqual([host]);
		expect(again.warnings).toHaveLength(1);
		expect(again.warnings[0]).toMatchObject({
			section_id: host,
			component_tipo: PORTAL,
			msg: '1 already present, not added',
			row: 2,
		});
		expect(await stored(host, 'relation', PORTAL)).toEqual(after);

		// a mixed cell: only the new target is added, both duplicates counted
		const mixed = await importCsv(
			`section_id;${PORTAL}\n${host};${q(`${targetA},${targetB},${targetC}`)}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
		);
		expect(mixed.failed).toEqual([]);
		expect(mixed.warnings.map((w) => w.msg)).toEqual(['2 already present, not added']);
		const final = (await stored(host, 'relation', PORTAL)) as Item[];
		expect(final.slice(0, 2)).toEqual(after);
		expect(final).toHaveLength(3);
		expect(final[2]).toMatchObject({ section_tipo: SECTION, section_id: targetC });
	}, 60000);
});

// ---------------------------------------------------------------- translatable input_text

describe('translatable input_text append', () => {
	test('a multi-lang cell: the translations share ONE fresh id, other languages untouched', async () => {
		const host = await newRecord();
		const seeded = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ 'lg-spa': ['uno'], 'lg-eng': ['one'], 'lg-fra': ['un'] }))}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(seeded.failed).toEqual([]);
		const before = (await stored(host, 'string', TEXT)) as Item[];
		expect(before.map((i) => i.lang).sort()).toEqual(['lg-eng', 'lg-fra', 'lg-spa']);

		const report = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ 'lg-spa': ['dos'], 'lg-eng': ['two'] }))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		expect(report.warnings).toEqual([]);
		const after = (await stored(host, 'string', TEXT)) as Item[];
		expect(after).toHaveLength(5);
		// every stored item survives byte-for-byte (the lg-fra one included)
		for (const item of before) expect(after).toContainEqual(item);
		const dos = mustGet(
			after.find((i) => i.value === 'dos'),
			'appended lg-spa item',
		);
		const two = mustGet(
			after.find((i) => i.value === 'two'),
			'appended lg-eng item',
		);
		expect(dos.lang).toBe('lg-spa');
		expect(two.lang).toBe('lg-eng');
		expect(typeof dos.id).toBe('number');
		// THE LAW: the two translations of one item carry ONE id…
		expect(two.id).toBe(dos.id);
		// …which is fresh: no stored item already carries it
		expect(before.map((i) => i.id)).not.toContain(dos.id);
		// lg-fra was not named by the cell: exactly its seeded item, nothing added
		expect(after.filter((i) => i.lang === 'lg-fra')).toEqual(
			before.filter((i) => i.lang === 'lg-fra'),
		);
	}, 60000);

	test('an empty cell and an empty lang group change NOTHING (no write, no TM row)', async () => {
		const host = await newRecord();
		await importCsv(`section_id;${TEXT}\n${host};kept\n`, [KEY, col(TEXT, 'component_input_text')]);
		const before = await stored(host, 'string', TEXT);
		expect(before).toHaveLength(1);
		const tmBefore = await tmRows(host);
		expect(tmBefore).toBeGreaterThan(0); // the seed wrote one: the count is live

		for (const cell of ['', q(JSON.stringify({ 'lg-spa': [] }))]) {
			const report = await importCsv(`section_id;${TEXT}\n${host};${cell}\n`, [
				KEY,
				col(TEXT, 'component_input_text', 'append'),
			]);
			expect(report.failed).toEqual([]);
			expect(report.errors).toEqual([]);
			expect(report.warnings).toEqual([]);
			expect(await stored(host, 'string', TEXT)).toEqual(before);
			expect(await tmRows(host)).toBe(tmBefore);
		}
	}, 60000);
});

async function metaCounter(sectionId: number, tipo: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT meta->$3 AS value FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, tipo],
	)) as { value: unknown }[];
	return rows[0]?.value ?? null;
}

async function setMetaCounter(sectionId: number, tipo: string, count: number): Promise<void> {
	await sql.unsafe(
		`UPDATE ${TABLE} SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, tipo, JSON.stringify([{ count }])],
	);
}

const langCell = (value: Record<string, string[]>): string => q(JSON.stringify(value));

describe('translations of a partly stored item share its id', () => {
	test('text_area: a first translation takes the id of the stored sibling-language text', async () => {
		const host = await newRecord();
		const spa = { id: 1, lang: 'lg-spa', value: '<p>a</p>' };
		await seed(host, 'string', TEXT_AREA, [spa]);
		const report = await importCsv(
			`section_id;${TEXT_AREA}\n${host};${langCell({ 'lg-eng': ['b'] })}\n`,
			[KEY, col(TEXT_AREA, 'component_text_area', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT_AREA)) as Item[];
		expect(after).toHaveLength(2);
		expect(after[0]).toEqual(spa);
		expect(after[1]).toMatchObject({ id: 1, lang: 'lg-eng', value: '<p>b</p>' });
	}, 60000);

	test('text_area: stored texts with DIFFERENT ids per language — a third language is added, never refused', async () => {
		const host = await newRecord();
		const spa = { id: 5, lang: 'lg-spa', value: '<p>a</p>' };
		const eng = { id: 6, lang: 'lg-eng', value: '<p>b</p>' };
		await seed(host, 'string', TEXT_AREA, [spa, eng]);
		const report = await importCsv(
			`section_id;${TEXT_AREA}\n${host};${langCell({ 'lg-spa': ['x'], 'lg-eng': ['y'], 'lg-fra': ['z'] })}\n`,
			[KEY, col(TEXT_AREA, 'component_text_area', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT_AREA)) as Item[];
		expect(after.find((i) => i.lang === 'lg-spa')).toMatchObject({
			id: 5,
			value: '<p>a</p><p>x</p>',
		});
		expect(after.find((i) => i.lang === 'lg-eng')).toMatchObject({
			id: 6,
			value: '<p>b</p><p>y</p>',
		});
		const fra = mustGet(
			after.find((i) => i.lang === 'lg-fra'),
			'fra text',
		);
		expect(fra.value).toBe('<p>z</p>');
		// a stored text id (a sibling's), never a third one
		expect([5, 6]).toContain(Number(fra.id));
	}, 60000);

	test('text_area: new languages join the stored text id; a cell of only blank texts allocates nothing', async () => {
		const host = await newRecord();
		await seed(host, 'string', TEXT_AREA, [{ id: 4, lang: 'lg-spa', value: '<p>a</p>' }]);
		const report = await importCsv(
			`section_id;${TEXT_AREA}\n${host};${langCell({ 'lg-eng': ['b'], 'lg-fra': ['c'] })}\n`,
			[KEY, col(TEXT_AREA, 'component_text_area', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT_AREA)) as Item[];
		expect(after.map((i) => [i.lang, Number(i.id)])).toEqual([
			['lg-spa', 4],
			['lg-eng', 4],
			['lg-fra', 4],
		]);

		const empty = await newRecord();
		const metaBefore = await metaCounter(empty, TEXT_AREA);
		const blanks = await importCsv(
			`section_id;${TEXT_AREA}\n${empty};${langCell({ 'lg-spa': [''], 'lg-eng': [''] })}\n`,
			[KEY, col(TEXT_AREA, 'component_text_area', 'append')],
		);
		expect(blanks.failed).toEqual([]);
		expect(await stored(empty, 'string', TEXT_AREA)).toEqual([]);
		expect(await metaCounter(empty, TEXT_AREA)).toEqual(metaBefore);
	}, 60000);

	test('input_text: spa a duplicate, eng new → eng takes the stored id; the re-import writes nothing', async () => {
		const host = await newRecord();
		const spa = { id: 5, lang: 'lg-spa', value: 'dos' };
		await seed(host, 'string', TEXT, [spa]);
		const csv = `section_id;${TEXT}\n${host};${langCell({ 'lg-spa': ['dos'], 'lg-eng': ['two'] })}\n`;
		const columns = [KEY, col(TEXT, 'component_input_text', 'append')];
		const report = await importCsv(csv, columns);
		expect(report.failed).toEqual([]);
		expect(report.warnings.map((w) => w.msg)).toEqual(['1 already present, not added']);
		const after = (await stored(host, 'string', TEXT)) as Item[];
		expect(after).toHaveLength(2);
		expect(after[0]).toEqual(spa);
		expect(after[1]).toMatchObject({ id: 5, lang: 'lg-eng', value: 'two' });

		// the SAME file again: no data, no meta counter, no TM row changes
		const metaBefore = await metaCounter(host, TEXT);
		const tmBefore = await tmRows(host);
		const again = await importCsv(csv, columns);
		expect(again.failed).toEqual([]);
		expect(again.warnings.map((w) => w.msg)).toEqual(['2 already present, not added']);
		expect(await stored(host, 'string', TEXT)).toEqual(after);
		expect(await metaCounter(host, TEXT)).toEqual(metaBefore);
		expect(await tmRows(host)).toBe(tmBefore);
	}, 60000);

	test('languages that disagree with the stored item refuse the row (no split ids)', async () => {
		const host = await newRecord();
		const storedItems = [
			{ id: 3, lang: 'lg-spa', value: 'uno' },
			{ id: 3, lang: 'lg-eng', value: 'one' },
		];
		await seed(host, 'string', TEXT, storedItems);
		const report = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-spa': ['uno'], 'lg-eng': ['one (rev)'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.msg).toContain('rolled back');
		expect(report.failed[0]?.msg).toContain('split');
		expect(await stored(host, 'string', TEXT)).toEqual(storedItems);
	}, 60000);

	test('a lagging counter never hands the shared id of a stored item', async () => {
		const host = await newRecord();
		const storedItems = [1, 2, 3, 4, 5].map((id) => ({ id, lang: 'lg-spa', value: `v${id}` }));
		await seed(host, 'string', TEXT, storedItems);
		await setMetaCounter(host, TEXT, 0);
		const report = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-spa': ['x'], 'lg-eng': ['y'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT)) as Item[];
		const x = mustGet(
			after.find((i) => i.value === 'x'),
			'x',
		);
		const y = mustGet(
			after.find((i) => i.value === 'y'),
			'y',
		);
		expect(y.id).toBe(x.id);
		expect(Number(x.id)).toBeGreaterThan(5);
		expect(after.filter((i) => i.id === x.id)).toHaveLength(2);
	}, 60000);
});

// ---------------------------------------------------------------- geolocation

const LAYER_1 = {
	layer_id: 1,
	layer_data: {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				properties: { layer_id: 1 },
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[2.1, 41.3],
							[2.2, 41.3],
							[2.2, 41.4],
							[2.1, 41.3],
						],
					],
				},
			},
		],
	},
	user_layer_name: 'layer_1',
};
const GEO_STORED = { id: 1, lat: 41.38, lon: 2.17, zoom: 12, alt: 16, lib_data: [LAYER_1] };

describe('geolocation append', () => {
	test('a flat point becomes Point layer 2, a GeoJSON cell layer 3; layer 1 + centre byte-identical', async () => {
		const host = await newRecord();
		await seed(host, 'geo', GEO, [GEO_STORED]);

		const flat = await importCsv(`section_id;${GEO}\n${host};${q('40.4168, -3.7038')}\n`, [
			KEY,
			col(GEO, 'component_geolocation', 'append'),
		]);
		expect(flat.failed).toEqual([]);
		expect(flat.errors).toEqual([]);
		let items = (await stored(host, 'geo', GEO)) as Item[];
		expect(items).toHaveLength(1);
		const { lib_data: layers2, ...centre2 } = items[0] as { lib_data: Item[] };
		const { lib_data: _l, ...storedCentre } = GEO_STORED;
		expect(centre2).toEqual(storedCentre);
		expect(layers2).toHaveLength(2);
		expect(layers2[0]).toEqual(LAYER_1);
		expect(layers2[1]).toMatchObject({ layer_id: 2, user_layer_name: 'layer_2' });
		const features2 = (layers2[1]?.layer_data as { features: Item[] }).features;
		expect(features2).toHaveLength(1);
		expect(features2[0]).toMatchObject({
			properties: { layer_id: 2 },
			geometry: { type: 'Point', coordinates: [-3.7038, 40.4168] },
		});

		const collection = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: { type: 'Point', coordinates: [-0.3763, 39.4699] },
				},
			],
		};
		const geojson = await importCsv(
			`section_id;${GEO}\n${host};${q(JSON.stringify(collection))}\n`,
			[KEY, col(GEO, 'component_geolocation', 'append')],
		);
		expect(geojson.failed).toEqual([]);
		items = (await stored(host, 'geo', GEO)) as Item[];
		const { lib_data: layers3, ...centre3 } = items[0] as { lib_data: Item[] };
		// the stored centre is NEVER moved by an append (even though this cell's
		// conform derived a centre from its first Point)
		expect(centre3).toEqual(storedCentre);
		expect(layers3).toHaveLength(3);
		expect(layers3.slice(0, 2)).toEqual(layers2);
		expect(layers3[2]).toMatchObject({ layer_id: 3, user_layer_name: 'layer_3' });
		const features3 = (layers3[2]?.layer_data as { features: Item[] }).features;
		expect(features3[0]?.properties).toEqual({ layer_id: 3 });
	}, 60000);
});

describe('geolocation append over a bare centre', () => {
	test('re-importing the same flat point changes nothing (no duplicate centre layer)', async () => {
		const host = await newRecord();
		const cell = `section_id;${GEO}\n${host};${q('40.4168, -3.7038')}\n`;
		const first = await importCsv(cell, [KEY, col(GEO, 'component_geolocation', 'append')]);
		expect(first.failed).toEqual([]);
		const afterFirst = await stored(host, 'geo', GEO);
		expect(afterFirst).toHaveLength(1);
		const tmBefore = await tmRows(host);

		const again = await importCsv(cell, [KEY, col(GEO, 'component_geolocation', 'append')]);
		expect(again.failed).toEqual([]);
		expect(again.warnings.map((w) => w.msg)).toEqual(['1 already present, not added']);
		expect(await stored(host, 'geo', GEO)).toEqual(afterFirst);
		expect(await tmRows(host)).toBe(tmBefore);
	}, 60000);
});

// ---------------------------------------------------------------- text_area

describe('text_area append', () => {
	test('a paragraph is appended to the stored text of the lang', async () => {
		const host = await newRecord();
		await importCsv(`section_id;${TEXT_AREA}\n${host};first\n`, [
			KEY,
			col(TEXT_AREA, 'component_text_area'),
		]);
		const before = (await stored(host, 'string', TEXT_AREA)) as Item[];
		expect(before).toHaveLength(1);
		const storedValue = String(before[0]?.value);
		expect(storedValue).toContain('first');

		const report = await importCsv(`section_id;${TEXT_AREA}\n${host};second\n`, [
			KEY,
			col(TEXT_AREA, 'component_text_area', 'append'),
		]);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT_AREA)) as Item[];
		expect(after).toHaveLength(1);
		expect(after[0]).toEqual({ ...before[0], value: `${storedValue}<p>second</p>` });
	}, 60000);

	test('a value carrying an index tag is refused; the row rolls back', async () => {
		const host = await newRecord();
		await importCsv(`section_id;${TEXT}\n${host};untouched\n`, [
			KEY,
			col(TEXT, 'component_input_text'),
		]);
		const textBefore = await stored(host, 'string', TEXT);
		const report = await importCsv(
			`section_id;${TEXT};${TEXT_AREA}\n${host};must roll back;see [index-n-1] here\n`,
			[
				KEY,
				col(TEXT, 'component_input_text', 'append'),
				col(TEXT_AREA, 'component_text_area', 'append'),
			],
		);
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.msg).toContain('rolled back');
		expect(report.failed[0]?.msg).toContain('tags');
		expect(report.updated).toEqual([]);
		expect(await stored(host, 'string', TEXT_AREA)).toEqual([]);
		// the EARLIER column's append rolled back with the row
		expect(await stored(host, 'string', TEXT)).toEqual(textBefore);
	}, 60000);
});

// ---------------------------------------------------------------- dataframe

describe('dataframe append — slot column BEFORE its main column', () => {
	test('the frame is re-paired to the main item FINAL id, not the file id', async () => {
		const host = await newRecord();
		// a stored item takes the low ids, so the file's id 1 cannot be the final id
		await importCsv(`section_id;${TEXT}\n${host};seed\n`, [KEY, col(TEXT, 'component_input_text')]);
		const seeded = (await stored(host, 'string', TEXT)) as Item[];

		const frames = [
			{ section_tipo: SECTION, section_id: targetA, main_component_tipo: TEXT, id_key: 1 },
		];
		const main = [{ id: 1, value: 'framed main' }];
		const report = await importCsv(
			`section_id;${DATAFRAME};${TEXT}\n${host};${q(JSON.stringify(frames))};${q(JSON.stringify(main))}\n`,
			[
				KEY,
				col(DATAFRAME, 'component_dataframe', 'append'),
				col(TEXT, 'component_input_text', 'append'),
			],
		);
		expect(report.failed).toEqual([]);
		expect(report.errors).toEqual([]);

		const items = (await stored(host, 'string', TEXT)) as Item[];
		expect(items.slice(0, seeded.length)).toEqual(seeded);
		const framed = mustGet(
			items.find((i) => i.value === 'framed main'),
			'appended main item',
		);
		expect(seeded.map((i) => i.id)).not.toContain(framed.id);
		expect(framed.id).not.toBe(1);

		const slot = (await stored(host, 'relation', DATAFRAME)) as Item[];
		expect(slot).toHaveLength(1);
		expect(isDataframeEntry(slot[0])).toBe(true);
		expect(slot[0]).toMatchObject({
			section_tipo: SECTION,
			section_id: targetA,
			main_component_tipo: TEXT,
			id_key: framed.id,
		});
	}, 60000);
});

describe('a frame whose append main wrote nothing never pairs with a stored item', () => {
	const DATE = 'test145'; // component_date
	for (const [name, main, mainModel, mainCell] of [
		['an empty append main cell', TEXT, 'component_input_text', ''],
		['an append main cell that fails conform', DATE, 'component_date', '2023-13-45'],
	] as const) {
		test(`${name}: the row is refused, the stored item gets no frame`, async () => {
			const host = await newRecord();
			const storedMain =
				main === TEXT
					? [{ id: 1, lang: 'lg-spa', value: 'stored' }]
					: [{ id: 1, lang: 'lg-nolan', start: { year: 2000, month: 1, day: 1 } }];
			await seed(host, main === TEXT ? 'string' : 'date', main, storedMain);
			const frames = [
				{ section_tipo: SECTION, section_id: targetA, main_component_tipo: main, id_key: 1 },
			];
			const report = await importCsv(
				`section_id;${DATAFRAME};${main}\n${host};${q(JSON.stringify(frames))};${mainCell}\n`,
				[KEY, col(DATAFRAME, 'component_dataframe', 'append'), col(main, mainModel, 'append')],
			);
			expect(report.updated).toEqual([]);
			expect(report.failed.some((f) => f.msg.includes('no item to pair with'))).toBe(true);
			expect(await stored(host, 'relation', DATAFRAME)).toEqual([]);
		}, 60000);
	}
});

describe('append through a component_alias keys the TARGET data tipo', () => {
	test('shared ids come from the target: a spa+eng cell never lands on a third-language item id', async () => {
		const host = await newRecord();
		const fra = { id: 1, lang: 'lg-fra', value: 'un' };
		await seed(host, 'string', TEXT, [fra]);
		const report = await importCsv(
			`section_id;${TEXT_ALIAS}\n${host};${langCell({ 'lg-spa': ['dos'], 'lg-eng': ['two'] })}\n`,
			[KEY, col(TEXT_ALIAS, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT)) as Item[];
		expect(after).toHaveLength(3);
		expect(after[0]).toEqual(fra);
		const dos = mustGet(
			after.find((i) => i.value === 'dos'),
			'appended lg-spa item',
		);
		const two = mustGet(
			after.find((i) => i.value === 'two'),
			'appended lg-eng item',
		);
		expect(two.id).toBe(dos.id);
		// NOT the unrelated lg-fra item's id (the alias's own counter started at 1)
		expect(dos.id).not.toBe(1);
		// stored data never holds the alias tipo
		expect(await stored(host, 'string', TEXT_ALIAS)).toEqual([]);
	}, 60000);

	test('an alias main re-pairs its frame to the FINAL item id, never the stored file-id item', async () => {
		const host = await newRecord();
		const storedMain = { id: 1, lang: 'lg-spa', value: 'stored' };
		await seed(host, 'string', TEXT, [storedMain]);
		// frames name the TARGET tipo (stored data never holds an alias tipo)
		const frames = [
			{ section_tipo: SECTION, section_id: targetA, main_component_tipo: TEXT, id_key: 1 },
		];
		const main = [{ id: 1, value: 'framed via alias' }];
		const report = await importCsv(
			`section_id;${DATAFRAME};${TEXT_ALIAS}\n${host};${q(JSON.stringify(frames))};${q(JSON.stringify(main))}\n`,
			[
				KEY,
				col(DATAFRAME, 'component_dataframe', 'append'),
				col(TEXT_ALIAS, 'component_input_text', 'append'),
			],
		);
		expect(report.failed).toEqual([]);
		expect(report.errors).toEqual([]);
		const items = (await stored(host, 'string', TEXT)) as Item[];
		expect(items[0]).toEqual(storedMain);
		const framed = mustGet(
			items.find((i) => i.value === 'framed via alias'),
			'appended main item',
		);
		expect(framed.id).not.toBe(1);
		const slot = (await stored(host, 'relation', DATAFRAME)) as Item[];
		expect(slot).toHaveLength(1);
		expect(slot[0]).toMatchObject({ main_component_tipo: TEXT, id_key: framed.id });
	}, 60000);
});

// ---------------------------------------------------------------- cap

describe('the cap binds an append', () => {
	test('exceeding data_limit rolls the WHOLE row back (an earlier column included)', async () => {
		const host = await newRecord();
		const cappedStored = {
			id: 1,
			type: 'dd151',
			section_id: targetA,
			section_tipo: SECTION,
			from_component_tipo: CAPPED,
		};
		await seed(host, 'relation', CAPPED, [cappedStored]);
		await importCsv(`section_id;${TEXT}\n${host};before\n`, [
			KEY,
			col(TEXT, 'component_input_text'),
		]);
		const textBefore = await stored(host, 'string', TEXT);

		const report = await importCsv(
			`section_id;${TEXT};${CAPPED}\n${host};must roll back;${q(JSON.stringify([{ section_tipo: SECTION, section_id: targetB }]))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append'), col(CAPPED, 'component_portal', 'append')],
		);
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.msg).toContain('rolled back');
		expect(report.failed[0]?.msg).toContain('selection_limit');
		expect(report.updated).toEqual([]);
		expect(await stored(host, 'relation', CAPPED)).toEqual([cappedStored]);
		expect(await stored(host, 'string', TEXT)).toEqual(textBefore);
	}, 60000);
});

// ---------------------------------------------------------------- door refusals

describe('append refused at the door — whole file, no dd800 record', () => {
	const cases: { name: string; header: string; cell: string; column: Record<string, unknown> }[] = [
		{
			name: 'image (media)',
			header: IMAGE,
			cell: 'x.jpg',
			column: col(IMAGE, 'component_image', 'append'),
		},
		{
			name: 'select',
			header: SELECT,
			cell: '1',
			column: col(SELECT, 'component_select', 'append'),
		},
		{
			name: 'radio_button',
			header: RADIO,
			cell: '1',
			column: col(RADIO, 'component_radio_button', 'append'),
		},
		{
			name: 'dd199 (created date)',
			header: CREATED_DATE,
			cell: '1998-05-21',
			column: col(CREATED_DATE, 'component_date', 'append'),
		},
		{
			name: 'a component_alias of dd199 (the audit refusal sees through the alias)',
			header: CREATED_DATE_ALIAS,
			cell: '1998-05-21',
			column: col(CREATED_DATE_ALIAS, 'component_date', 'append'),
		},
	];

	for (const [index, current] of cases.entries()) {
		test(`${current.name}: refused, nothing written`, async () => {
			const host = await newRecord();
			const file = `append_refused_${index}_${host}.csv`;
			const report = await importCsv(
				`section_id;${TEXT};${current.header}\n${host};not written;${current.cell}\n`,
				[KEY, col(TEXT, 'component_input_text'), current.column],
				{ file },
			);
			expect(report.bulk_process_id).toBeNull();
			expect(report.errors.join(' ')).toContain('append refused');
			expect(report.errors.join(' ')).toContain(String(current.column.tipo));
			expect(report.updated).toEqual([]);
			expect(await bulkRunsFor(file)).toBe(0);
			// the replace column beside it was NOT written either: the FILE is refused
			expect(await stored(host, 'string', TEXT)).toEqual([]);
		}, 60000);
	}

	test('the section_id key in append mode: refused, nothing written', async () => {
		const host = await newRecord();
		const file = `append_refused_key_${host}.csv`;
		const report = await importCsv(
			`section_id;${TEXT}\n${host};not written\n`,
			[{ ...KEY, import_mode: 'append' }, col(TEXT, 'component_input_text', 'append')],
			{ file },
		);
		expect(report.bulk_process_id).toBeNull();
		expect(report.errors.join(' ')).toContain('append refused');
		expect(await bulkRunsFor(file)).toBe(0);
		expect(await stored(host, 'string', TEXT)).toEqual([]);
	}, 60000);

	test('an unknown import_mode refuses the file, nothing written', async () => {
		const host = await newRecord();
		const file = `append_unknown_mode_${host}.csv`;
		const report = await importCsv(
			`section_id;${TEXT}\n${host};not written\n`,
			[KEY, col(TEXT, 'component_input_text', 'apend')],
			{ file },
		);
		expect(report.bulk_process_id).toBeNull();
		expect(report.errors.join(' ')).toContain('unknown import_mode');
		expect(await bulkRunsFor(file)).toBe(0);
		expect(await stored(host, 'string', TEXT)).toEqual([]);
	}, 60000);

	test('validate_import names the refused column and is not ready', async () => {
		const host = await newRecord();
		const file = `append_validate_${host}.csv`;
		const report = await validateCsv(
			`section_id;${TEXT};${SELECT}\n${host};v;1\n`,
			[KEY, col(TEXT, 'component_input_text', 'append'), col(SELECT, 'component_select', 'append')],
			file,
		);
		expect(report.ok).toBe(false);
		const columns = report.columns as Item[];
		expect(columns.find((c) => c.tipo === TEXT)).toMatchObject({ mode: 'append', refused: null });
		const select = mustGet(
			columns.find((c) => c.tipo === SELECT),
			'select column verdict',
		);
		expect(select.mode).toBe('append');
		expect(typeof select.refused).toBe('string');
		expect((report.errors as string[]).join(' ')).toContain('append refused');
		expect(await stored(host, 'string', TEXT)).toEqual([]);
	}, 60000);
});

// ---------------------------------------------------------------- bulk revert

describe('bulk revert of an append run (time machine on)', () => {
	test('restores the pre-import state of every appended component', async () => {
		const host = await newRecord();
		const seeded = await importCsv(`section_id;${PORTAL};${TEXT}\n${host};${targetA};original\n`, [
			KEY,
			col(PORTAL, 'component_portal'),
			col(TEXT, 'component_input_text'),
		]);
		expect(seeded.failed).toEqual([]);
		const portalBefore = await stored(host, 'relation', PORTAL);
		const textBefore = await stored(host, 'string', TEXT);

		const appended = await importCsv(
			`section_id;${PORTAL};${TEXT}\n${host};${targetB};added\n`,
			[KEY, col(PORTAL, 'component_portal', 'append'), col(TEXT, 'component_input_text', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'relation', PORTAL)).toHaveLength(2);
		expect(await stored(host, 'string', TEXT)).toHaveLength(2);
		const bulkId = mustGet(appended.bulk_process_id, 'append run bulk id');

		const response = await toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: { section_tipo: SECTION, bulk_process_id: bulkId },
		} as ToolActionContext);
		const data = response.data as { counter: number; bulk_process_id: number; skipped: unknown[] };
		bulkProcessIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([]);
		expect(data.counter).toBe(2);
		expect(await stored(host, 'relation', PORTAL)).toEqual(portalBefore);
		expect(await stored(host, 'string', TEXT)).toEqual(textBefore);
	}, 60000);
});

describe('bulk revert of an append over data that has NO time-machine history', () => {
	test('portal seeded with TM off: the revert keeps the pre-import locator', async () => {
		const host = await newRecord();
		const seeded = await importCsv(
			`section_id;${PORTAL}\n${host};${targetA}\n`,
			[KEY, col(PORTAL, 'component_portal')],
			{
				timeMachine: false,
			},
		);
		expect(seeded.failed).toEqual([]);
		const portalBefore = await stored(host, 'relation', PORTAL);
		expect(portalBefore).toHaveLength(1);

		const appended = await importCsv(
			`section_id;${PORTAL}\n${host};${targetB}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'relation', PORTAL)).toHaveLength(2);

		const response = await toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: {
				section_tipo: SECTION,
				bulk_process_id: mustGet(appended.bulk_process_id, 'append run bulk id'),
			},
		} as ToolActionContext);
		const data = response.data as { bulk_process_id: number; skipped: unknown[] };
		bulkProcessIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([]);
		// the pre-import locator survives; only the appended one is gone
		expect(await stored(host, 'relation', PORTAL)).toEqual(portalBefore);
	}, 60000);

	test('dataframe slot written by legacy REPLACE frames: the revert keeps its frames', async () => {
		const host = await newRecord();
		const frameOf = (target: number) => ({
			from_component_tipo: DATAFRAME,
			id_key: 1,
			main_component_tipo: TEXT,
			section_tipo: SECTION,
			section_id: target,
		});
		// replace import, TM on: the MAIN gets a TM row, the slot (saveTm:false) none
		const seedEnvelope = { data: [{ id: 1, value: 'seed' }], dataframe: [frameOf(targetA)] };
		const seeded = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ dedalo_data: seedEnvelope }))}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(seeded.failed).toEqual([]);
		const slotBefore = await stored(host, 'relation', DATAFRAME);
		expect(slotBefore).toHaveLength(1);
		const main = mustGet(((await stored(host, 'string', TEXT)) as Item[])[0], 'seeded main item');

		const envelope = {
			data: [{ id: 1, lang: main.lang, value: 'seed' }],
			dataframe: [frameOf(targetB)],
		};
		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ dedalo_data: envelope }))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'relation', DATAFRAME)).toHaveLength(2);

		const response = await toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: {
				section_tipo: SECTION,
				bulk_process_id: mustGet(appended.bulk_process_id, 'append run bulk id'),
			},
		} as ToolActionContext);
		const data = response.data as { bulk_process_id: number; skipped: unknown[] };
		bulkProcessIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([]);
		expect(await stored(host, 'relation', DATAFRAME)).toEqual(slotBefore);
	}, 60000);

	test('the baseline row is written once, and never for an empty component', async () => {
		const host = await newRecord();
		await importCsv(
			`section_id;${PORTAL}\n${host};${targetA}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
			{
				timeMachine: true,
			},
		);
		// nothing was stored: only the append's own row
		expect(await tmRows(host)).toBe(1);
		await importCsv(
			`section_id;${PORTAL}\n${host};${targetB}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
			{
				timeMachine: true,
			},
		);
		// history existed: no baseline, just the second append's row
		expect(await tmRows(host)).toBe(2);
	}, 60000);
});

describe('bulk revert of an append over STALE time-machine history (a later TM-off write)', () => {
	test('portal: TM-on import, then TM-off import, then append — the revert keeps the TM-off value', async () => {
		const host = await newRecord();
		const first = await importCsv(`section_id;${PORTAL}\n${host};${targetA}\n`, [
			KEY,
			col(PORTAL, 'component_portal'),
		]);
		expect(first.failed).toEqual([]);
		const offRun = await importCsv(
			`section_id;${PORTAL}\n${host};${targetB}\n`,
			[KEY, col(PORTAL, 'component_portal')],
			{ timeMachine: false },
		);
		expect(offRun.failed).toEqual([]);
		const portalBefore = await stored(host, 'relation', PORTAL);
		expect(portalBefore).toHaveLength(1);
		expect(portalBefore).toEqual([expect.objectContaining({ section_id: targetB })]);
		const rowsBefore = await tmRows(host);

		const appended = await importCsv(
			`section_id;${PORTAL}\n${host};${targetA}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'relation', PORTAL)).toHaveLength(2);
		// the stale newest row ([A]) differs from what is stored ([B]): baseline + own row
		expect(await tmRows(host)).toBe(rowsBefore + 2);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'relation', PORTAL)).toEqual(portalBefore);
	}, 60000);

	test('dataframe slot: TM row, then legacy REPLACE frames (saveTm:false), then append — the revert keeps the replace frames', async () => {
		const host = await newRecord();
		const frameOf = (target: number) => ({
			from_component_tipo: DATAFRAME,
			id_key: 1,
			main_component_tipo: TEXT,
			section_tipo: SECTION,
			section_id: target,
		});
		await importCsv(`section_id;${TEXT}\n${host};seed\n`, [KEY, col(TEXT, 'component_input_text')]);
		const main = mustGet(((await stored(host, 'string', TEXT)) as Item[])[0], 'seeded main item');
		const cell = (target: number) =>
			q(
				JSON.stringify({
					dedalo_data: {
						data: [{ id: main.id, lang: main.lang, value: 'seed' }],
						dataframe: [frameOf(target)],
					},
				}),
			);
		// 1. append of a frame: the SLOT gets its own TM row [frame A]
		const slotHistory = await importCsv(
			`section_id;${TEXT}\n${host};${cell(targetA)}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
			{ timeMachine: true },
		);
		expect(slotHistory.failed).toEqual([]);
		// 2. replace import of legacy frames: the slot becomes [frame B], no slot TM row
		const replaced = await importCsv(`section_id;${TEXT}\n${host};${cell(targetB)}\n`, [
			KEY,
			col(TEXT, 'component_input_text'),
		]);
		expect(replaced.failed).toEqual([]);
		const slotBefore = await stored(host, 'relation', DATAFRAME);
		expect(slotBefore).toEqual([expect.objectContaining({ section_id: targetB })]);

		// 3. append of another frame over the stale slot history
		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${cell(targetA)}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'relation', DATAFRAME)).toHaveLength(2);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'relation', DATAFRAME)).toEqual(slotBefore);
	}, 60000);
});

describe('bulk revert of a run that appends TWICE to one component with a TM-off write between', () => {
	test("no mid-run baseline: the revert walks past both of the run's rows to the pre-run value", async () => {
		const host = await newRecord();
		// pre-run history: [A], TM on
		const seeded = await importCsv(`section_id;${PORTAL}\n${host};${targetA}\n`, [
			KEY,
			col(PORTAL, 'component_portal'),
		]);
		expect(seeded.failed).toEqual([]);
		const preRun = await stored(host, 'relation', PORTAL);
		expect(preRun).toEqual([expect.objectContaining({ section_id: targetA })]);

		// the run's FIRST append (row 1): [A, B], TM row stamped with run X
		const run = await importCsv(
			`section_id;${PORTAL}\n${host};${targetB}\n`,
			[KEY, col(PORTAL, 'component_portal', 'append')],
			{ timeMachine: true },
		);
		expect(run.failed).toEqual([]);
		const runId = mustGet(run.bulk_process_id, 'append run bulk id');
		const principal = await resolvePrincipal(-1);
		const coordinates = {
			componentTipo: PORTAL,
			sectionTipo: SECTION,
			sectionId: host,
			lang: 'lg-nolan',
			userId: -1,
			principal,
		};
		// a TM-off write inside the run (as a legacy replace-envelope slot write is): [C]
		const drift = await saveComponentData({
			...coordinates,
			saveTm: false,
			bulkProcessId: runId,
			changedData: [
				{ action: 'set_data', value: [{ section_tipo: SECTION, section_id: targetC }] },
			],
		});
		expect(drift.ok).toBe(true);
		const rowsBefore = await tmRows(host);
		// the run's SECOND append to the same component (a repeated section_id)
		const second = await saveComponentData({
			...coordinates,
			appendImport: true,
			bulkProcessId: runId,
			changedData: [
				{ action: 'set_data', value: [{ id: 1, section_tipo: SECTION, section_id: targetA }] },
			],
		});
		expect(second.ok).toBe(true);
		expect(await stored(host, 'relation', PORTAL)).toHaveLength(2);
		// its own row only: the newest row is the run's, so no baseline of [C]
		expect(await tmRows(host)).toBe(rowsBefore + 1);

		expect((await revertRun(runId)).skipped).toEqual([]);
		expect(await stored(host, 'relation', PORTAL)).toEqual(preRun);
	}, 60000);
});

describe('bulk revert of a legacy-envelope frame on a DUPLICATE main item', () => {
	test('the frame has its own TM row, so the revert removes it', async () => {
		const host = await newRecord();
		await importCsv(`section_id;${TEXT}\n${host};seed\n`, [KEY, col(TEXT, 'component_input_text')]);
		const seeded = (await stored(host, 'string', TEXT)) as Item[];
		const main = mustGet(seeded[0], 'seeded main item');
		const envelope = {
			data: [{ id: 1, lang: main.lang, value: 'seed' }],
			dataframe: [
				{
					from_component_tipo: DATAFRAME,
					id_key: 1,
					main_component_tipo: TEXT,
					section_tipo: SECTION,
					section_id: targetA,
				},
			],
		};
		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ dedalo_data: envelope }))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		// the main item was a duplicate (no main write) …
		expect(await stored(host, 'string', TEXT)).toEqual(seeded);
		// … yet the frame was written, paired with the stored item
		const slot = (await stored(host, 'relation', DATAFRAME)) as Item[];
		expect(slot).toHaveLength(1);
		expect(slot[0]).toMatchObject({ main_component_tipo: TEXT, id_key: main.id });

		const response = await toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(-1),
			userId: -1,
			background: false,
			options: {
				section_tipo: SECTION,
				bulk_process_id: mustGet(appended.bulk_process_id, 'append run bulk id'),
			},
		} as ToolActionContext);
		const data = response.data as { counter: number; bulk_process_id: number; skipped: unknown[] };
		bulkProcessIds.push(data.bulk_process_id);
		expect(data.skipped).toEqual([]);
		expect(await stored(host, 'relation', DATAFRAME)).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toEqual(seeded);
	}, 60000);
});

// ------------------------------------------------ multi-language append + revert

describe('bulk revert of a MULTI-LANGUAGE append (per-language baseline)', () => {
	test('stored eng-only value, no history: a spa+eng append reverts to the stored eng value', async () => {
		const host = await newRecord();
		const seeded = [{ id: 1, lang: 'lg-eng', value: 'Hello' }];
		await seed(host, 'string', TEXT, seeded);
		expect(await tmRows(host)).toBe(0);

		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-spa': ['Hola'], 'lg-eng': ['Hello2'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toHaveLength(3);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toEqual(seeded);
	}, 60000);

	test('stored eng + spa, no history: both languages revert to their pre-import slice', async () => {
		const host = await newRecord();
		const seeded = [
			{ id: 1, lang: 'lg-eng', value: 'one' },
			{ id: 1, lang: 'lg-spa', value: 'uno' },
		];
		await seed(host, 'string', TEXT, seeded);

		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['two'], 'lg-spa': ['dos'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toHaveLength(4);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(byLangValue(await stored(host, 'string', TEXT))).toEqual(byLangValue(seeded));
	}, 60000);

	test('earlier history only in ANOTHER language: the appended language still reverts', async () => {
		const host = await newRecord();
		// an eng replace import writes eng history; spa is then seeded with none
		await importCsv(`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['one'] })}\n`, [
			KEY,
			col(TEXT, 'component_input_text'),
		]);
		const eng = (await stored(host, 'string', TEXT)) as Item[];
		const seeded = [...eng, { id: 7, lang: 'lg-spa', value: 'uno' }];
		await seed(host, 'string', TEXT, seeded);

		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-spa': ['dos'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toHaveLength(3);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(byLangValue(await stored(host, 'string', TEXT))).toEqual(byLangValue(seeded));
	}, 60000);
});

/** A TM row as the writers that tag ONE language but store ALL of them write it (tool_lang, propagate, duplicate backfill). */
async function tmRow(sectionId: number, lang: string, data: unknown[]): Promise<void> {
	await recordTimeMachine(
		{ sectionTipo: SECTION, sectionId, componentTipo: TEXT, lang, userId: -1, data },
		dbTimestamp(),
	);
}

describe('bulk revert reads each language from ITS history only (any bulk run)', () => {
	test('an older eng-TAGGED all-language row never puts a stale spa value back', async () => {
		const host = await newRecord();
		// tool_lang translated to eng: tagged eng, holds spa v1 too
		await tmRow(host, 'lg-eng', [
			{ id: 1, lang: 'lg-spa', value: 'v1' },
			{ id: 1, lang: 'lg-eng', value: 'e1' },
		]);
		// a curator then edits spa (a spa slice row)
		const current = [
			{ id: 1, lang: 'lg-spa', value: 'v2' },
			{ id: 1, lang: 'lg-eng', value: 'e1' },
		];
		await seed(host, 'string', TEXT, current);
		await tmRow(host, 'lg-spa', [current[0] as Item]);

		const replaced = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['e2'] })}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(replaced.failed).toEqual([]);
		expect((await revertRun(replaced.bulk_process_id)).skipped).toEqual([]);
		expect(byLangValue(await stored(host, 'string', TEXT))).toEqual(byLangValue(current));
	}, 60000);

	test('a language recorded only inside another-tagged row (duplicate backfill) is restored, not blanked', async () => {
		const host = await newRecord();
		const copied = [
			{ id: 1, lang: 'lg-spa', value: 's' },
			{ id: 1, lang: 'lg-eng', value: 'c' },
		];
		await seed(host, 'string', TEXT, copied);
		// duplicate_record: backfill (all languages) + slice, BOTH tagged spa
		await tmRow(host, 'lg-spa', copied);
		await tmRow(host, 'lg-spa', [copied[0] as Item]);

		const replaced = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['n'] })}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(replaced.failed).toEqual([]);
		expect((await revertRun(replaced.bulk_process_id)).skipped).toEqual([]);
		expect(byLangValue(await stored(host, 'string', TEXT))).toEqual(byLangValue(copied));
	}, 60000);

	test('the append baseline probe reads the same history: an equal value inside a spa-tagged row needs no baseline', async () => {
		const host = await newRecord();
		const copied = [
			{ id: 1, lang: 'lg-spa', value: 's' },
			{ id: 1, lang: 'lg-eng', value: 'c' },
		];
		await seed(host, 'string', TEXT, copied);
		await tmRow(host, 'lg-spa', copied);
		const tmBefore = await tmRows(host);

		const appended = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['x'] })}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(appended.failed).toEqual([]);
		// the append's own row only — eng's history already says 'c'
		expect(await tmRows(host)).toBe(tmBefore + 1);
		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(byLangValue(await stored(host, 'string', TEXT))).toEqual(byLangValue(copied));
	}, 60000);
});

describe('a PHP-era LANG-LESS value: its tagged row speaks for the tagged language', () => {
	/** A TM row of the non-translatable text, tagged `lang`, holding `data` verbatim. */
	const monoRow = (sectionId: number, lang: string, data: unknown[]) =>
		recordTimeMachine(
			{ sectionTipo: SECTION, sectionId, componentTipo: MONO_TEXT, lang, userId: -1, data },
			dbTimestamp(),
		);
	const legacy = [{ id: 1, value: 'old url' }];

	test('replace run over a lang-less value: the revert brings the old value back (never blanks it)', async () => {
		const host = await newRecord();
		await seed(host, 'string', MONO_TEXT, legacy);
		await monoRow(host, 'lg-nolan', legacy);

		const replaced = await importCsv(`section_id;${MONO_TEXT}\n${host};new url\n`, [
			KEY,
			col(MONO_TEXT, 'component_input_text'),
		]);
		expect(replaced.failed).toEqual([]);
		expect(((await stored(host, 'string', MONO_TEXT)) as Item[]).map((i) => i.value)).toEqual([
			'new url',
		]);

		expect((await revertRun(replaced.bulk_process_id)).skipped).toEqual([]);
		// the old item, stamped with the slice language as any save of it is
		expect(await stored(host, 'string', MONO_TEXT)).toEqual([
			{ id: 1, lang: 'lg-nolan', value: 'old url' },
		]);
	}, 60000);

	test('append run over a lang-less value: the revert restores it byte-exact, once', async () => {
		const host = await newRecord();
		await seed(host, 'string', MONO_TEXT, legacy);
		await monoRow(host, 'lg-nolan', legacy);

		const appended = await importCsv(`section_id;${MONO_TEXT}\n${host};added\n`, [
			KEY,
			col(MONO_TEXT, 'component_input_text', 'append'),
		]);
		expect(appended.failed).toEqual([]);
		expect(await stored(host, 'string', MONO_TEXT)).toHaveLength(2);

		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'string', MONO_TEXT)).toEqual(legacy);
	}, 60000);

	test('an INSERT run that keeps the lang-less item: the revert restores it once, never twice', async () => {
		const host = await newRecord();
		await seed(host, 'string', MONO_TEXT, legacy);
		await monoRow(host, 'lg-nolan', legacy);
		// any dd800 writer that inserts beside the stored item (the insert path keeps it)
		const runId = await createSectionRecord('dd800', -1);
		bulkProcessIds.push(runId);
		const inserted = await saveComponentData({
			componentTipo: MONO_TEXT,
			sectionTipo: SECTION,
			sectionId: host,
			lang: 'lg-nolan',
			userId: -1,
			principal: await resolvePrincipal(-1),
			bulkProcessId: runId,
			changedData: [{ action: 'insert', id: null, value: { value: 'inserted' } }],
		});
		expect(inserted.ok).toBe(true);
		expect(await stored(host, 'string', MONO_TEXT)).toHaveLength(2);

		expect((await revertRun(runId)).skipped).toEqual([]);
		expect(await stored(host, 'string', MONO_TEXT)).toEqual([
			{ id: 1, lang: 'lg-nolan', value: 'old url' },
		]);
	}, 60000);
});

describe('a record WIPE (delete_data) is part of every language history', () => {
	test('stored eng + spa, wiped, then a run writes the other language: the revert leaves it empty', async () => {
		const host = await newRecord();
		const wipeLang = (config.menu as { dataLang?: string }).dataLang ?? 'lg-spa';
		const other = wipeLang === 'lg-eng' ? 'lg-spa' : 'lg-eng';
		const both = [
			{ id: 1, lang: wipeLang, value: 'w' },
			{ id: 1, lang: other, value: 'o' },
		];
		await seed(host, 'string', TEXT, both);
		await tmRow(host, wipeLang, [both[0] as Item]);
		await tmRow(host, other, [both[1] as Item]);

		await deleteSectionData(SECTION, host, -1);
		expect(await stored(host, 'string', TEXT)).toEqual([]);

		const written = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ [other]: ['n'] })}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(written.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toHaveLength(1);

		expect((await revertRun(written.bulk_process_id)).skipped).toEqual([]);
		// the wiped value never comes back: the pre-run state was empty
		expect(await stored(host, 'string', TEXT)).toEqual([]);
	}, 60000);

	test('an EXISTING single-tag wipe row (PHP / pre-fix shape, data null) blanks the other language too', async () => {
		const host = await newRecord();
		const wipeLang = 'lg-spa';
		const other = 'lg-eng';
		const both = [
			{ id: 1, lang: wipeLang, value: 'w' },
			{ id: 1, lang: other, value: 'o' },
		];
		await seed(host, 'string', TEXT, both);
		await tmRow(host, wipeLang, [both[0] as Item]);
		await tmRow(host, other, [both[1] as Item]);
		// the wipe as history already holds it: ONE row per component, tagged with
		// ONE language, data null — and several components emptied at ONE instant
		// (the delete_data shape: the sibling null row is what marks it a wipe)
		await sql.unsafe(
			`UPDATE ${TABLE} SET string = string - $3::text WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, host, TEXT],
		);
		const wipedAt = dbTimestamp();
		for (const componentTipo of [TEXT, TEXT_AREA]) {
			await recordTimeMachine(
				{
					sectionTipo: SECTION,
					sectionId: host,
					componentTipo,
					lang: wipeLang,
					userId: -1,
					data: null,
				},
				wipedAt,
			);
		}

		const written = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ [other]: ['n'] })}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(written.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toHaveLength(1);

		expect((await revertRun(written.bulk_process_id)).skipped).toEqual([]);
		// the eng walk sees the spa-tagged wipe: 'o' stays deleted
		expect(await stored(host, 'string', TEXT)).toEqual([]);
	}, 60000);
});

describe('a LONE per-language clear (PHP: one component, one language, data null) is not a wipe', () => {
	test('eng value, then a spa-tagged null row, then a run writes eng: the revert restores eng', async () => {
		const host = await newRecord();
		const eng = { id: 1, lang: 'lg-eng', value: 'foo' };
		await seed(host, 'string', TEXT, [eng]);
		await tmRow(host, 'lg-eng', [eng]);
		// a curator cleared SPANISH only: PHP stored null under the spa tag, alone
		await recordTimeMachine(
			{
				sectionTipo: SECTION,
				sectionId: host,
				componentTipo: TEXT,
				lang: 'lg-spa',
				userId: -1,
				data: null,
			},
			dbTimestamp(),
		);

		const written = await importCsv(
			`section_id;${TEXT}\n${host};${langCell({ 'lg-eng': ['bar'] })}\n`,
			[KEY, col(TEXT, 'component_input_text')],
		);
		expect(written.failed).toEqual([]);
		expect(((await stored(host, 'string', TEXT)) as Item[]).map((i) => i.value)).toEqual(['bar']);

		expect((await revertRun(written.bulk_process_id)).skipped).toEqual([]);
		// English goes back to 'foo' — the spa clear never stood in for eng history
		expect(await stored(host, 'string', TEXT)).toEqual([eng]);
	}, 60000);
});

describe('bulk revert of an append whose main already had FRAMES', () => {
	test('the appended main item and its frame are both undone; the old frame stays', async () => {
		const host = await newRecord();
		await importCsv(`section_id;${FRAMED_MAIN}\n${host};seed\n`, [
			KEY,
			col(FRAMED_MAIN, 'component_input_text'),
		]);
		const seeded = (await stored(host, 'string', FRAMED_MAIN)) as Item[];
		const main = mustGet(seeded[0], 'seeded main item');
		// a frame the main's (frameless) TM row knows nothing about
		await seed(host, 'relation', FRAMED_SLOT, [
			{
				type: 'dd490',
				section_tipo: SECTION,
				section_id: targetA,
				from_component_tipo: FRAMED_SLOT,
				main_component_tipo: FRAMED_MAIN,
				id_key: main.id,
			},
		]);
		const slotBefore = await stored(host, 'relation', FRAMED_SLOT);

		const frames = [
			{ section_tipo: SECTION, section_id: targetB, main_component_tipo: FRAMED_MAIN, id_key: 1 },
		];
		const appended = await importCsv(
			`section_id;${FRAMED_SLOT};${FRAMED_MAIN}\n${host};${q(JSON.stringify(frames))};${q(JSON.stringify([{ id: 1, value: 'framed' }]))}\n`,
			[
				KEY,
				col(FRAMED_SLOT, 'component_dataframe', 'append'),
				col(FRAMED_MAIN, 'component_input_text', 'append'),
			],
			{ timeMachine: true },
		);
		expect(appended.failed).toEqual([]);
		expect(appended.errors).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toHaveLength(2);
		expect(await stored(host, 'relation', FRAMED_SLOT)).toHaveLength(2);

		// never a frameless_wipe skip: the append's rows carry the slot's frames
		expect((await revertRun(appended.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual(seeded);
		expect(await stored(host, 'relation', FRAMED_SLOT)).toEqual(slotBefore);
	}, 60000);
});

/**
 * An append run A over a framed main (frame F0 stored), adding main item
 * 'framed' + its frame FB. Returns what A left behind.
 */
async function framedAppendRun(): Promise<{
	host: number;
	runA: number | null;
	mainAfterA: unknown[];
	slotAfterA: unknown[];
}> {
	const host = await newRecord();
	await importCsv(`section_id;${FRAMED_MAIN}\n${host};seed\n`, [
		KEY,
		col(FRAMED_MAIN, 'component_input_text'),
	]);
	const main = mustGet(((await stored(host, 'string', FRAMED_MAIN)) as Item[])[0], 'seeded main');
	await seed(host, 'relation', FRAMED_SLOT, [
		{
			type: 'dd490',
			section_tipo: SECTION,
			section_id: targetA,
			from_component_tipo: FRAMED_SLOT,
			main_component_tipo: FRAMED_MAIN,
			id_key: main.id,
		},
	]);
	const frames = [
		{ section_tipo: SECTION, section_id: targetB, main_component_tipo: FRAMED_MAIN, id_key: 1 },
	];
	const appended = await importCsv(
		`section_id;${FRAMED_SLOT};${FRAMED_MAIN}\n${host};${q(JSON.stringify(frames))};${q(JSON.stringify([{ id: 1, value: 'framed' }]))}\n`,
		[
			KEY,
			col(FRAMED_SLOT, 'component_dataframe', 'append'),
			col(FRAMED_MAIN, 'component_input_text', 'append'),
		],
	);
	expect(appended.failed).toEqual([]);
	const slotAfterA = await stored(host, 'relation', FRAMED_SLOT);
	expect(slotAfterA).toHaveLength(2);
	return {
		host,
		runA: appended.bulk_process_id,
		mainAfterA: await stored(host, 'string', FRAMED_MAIN),
		slotAfterA,
	};
}

/** A later REPLACE run B on the framed main (its TM row is frameless). */
async function replaceRunB(host: number): Promise<number | null> {
	const replaced = await importCsv(`section_id;${FRAMED_MAIN}\n${host};b\n`, [
		KEY,
		col(FRAMED_MAIN, 'component_input_text'),
	]);
	expect(replaced.failed).toEqual([]);
	return replaced.bulk_process_id;
}

describe("an append main's own TM row carries the frames the row WROTE", () => {
	test("the batch row composes the post-row slot (F0 + the append's frame)", async () => {
		const { host, runA, slotAfterA } = await framedAppendRun();
		const rows = (await sql.unsafe(
			`SELECT data FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND bulk_process_id = $4`,
			[SECTION, host, FRAMED_MAIN, mustGet(runA, 'run A')],
		)) as { data: unknown[] }[];
		expect(rows).toHaveLength(1);
		const frames: unknown[] = (rows[0]?.data ?? []).filter((entry) => isDataframeEntry(entry));
		expect(frames).toHaveLength(slotAfterA.length);
		for (const frame of slotAfterA) expect(frames).toContainEqual(frame);
	}, 60000);

	test('a later frameless run B reverts to A: the frames A paired survive', async () => {
		const { host, mainAfterA, slotAfterA } = await framedAppendRun();
		const runB = await replaceRunB(host);
		expect((await revertRun(runB)).skipped).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual(mainAfterA);
		expect(await stored(host, 'relation', FRAMED_SLOT)).toEqual(slotAfterA);
	}, 60000);
});

describe('a composed snapshot whose frames went STALE never overwrites the slot', () => {
	test('append A, a later frame edit, replace B, revert B: skipped, the edit survives', async () => {
		const { host } = await framedAppendRun();
		// a curator's frame edit: saved on the SLOT, no main TM row
		const edited = ((await stored(host, 'relation', FRAMED_SLOT)) as Item[]).map((frame) => ({
			...frame,
			section_id: targetC,
		}));
		await seed(host, 'relation', FRAMED_SLOT, edited);
		const runB = await replaceRunB(host);
		const mainAfterB = await stored(host, 'string', FRAMED_MAIN);

		const { skipped } = await revertRun(runB);
		expect(skipped).toEqual([
			{
				reason: 'frames_changed_since_run',
				section_tipo: SECTION,
				tipo: FRAMED_MAIN,
				section_id: host,
			},
		]);
		// refused as a whole: nothing written
		expect(await stored(host, 'relation', FRAMED_SLOT)).toEqual(edited);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual(mainAfterB);
	}, 60000);

	test("another main's frame added to a shared slot after A is kept by B's revert", async () => {
		const { host, mainAfterA, slotAfterA } = await framedAppendRun();
		const foreign = {
			type: 'dd490',
			section_tipo: SECTION,
			section_id: targetC,
			from_component_tipo: FRAMED_SLOT,
			main_component_tipo: MONO_TEXT,
			id_key: 1,
		};
		await seed(host, 'relation', FRAMED_SLOT, [...slotAfterA, foreign]);
		const runB = await replaceRunB(host);

		expect((await revertRun(runB)).skipped).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual(mainAfterA);
		const slot = (await stored(host, 'relation', FRAMED_SLOT)) as Item[];
		// order-free: the other main's frame stays, A's frames are restored
		expect(slot).toHaveLength(slotAfterA.length + 1);
		for (const frame of [...slotAfterA, foreign]) expect(slot).toContainEqual(frame as Item);
	}, 60000);
});

/**
 * A PHP-era COMPOSED pre-batch row (the main's items + the FULL slot, one of
 * them another main's frame) under a REPLACE run that writes the slot itself.
 * The slot differs from the snapshot because of the RUN, not a later edit: the
 * revert must restore main AND frames (never `frames_changed_since_run`).
 */
async function phpComposedHost(): Promise<{ host: number; main: Item; phpSlot: Item[] }> {
	const host = await newRecord();
	await importCsv(`section_id;${FRAMED_MAIN}\n${host};old\n`, [
		KEY,
		col(FRAMED_MAIN, 'component_input_text'),
	]);
	const main = mustGet(((await stored(host, 'string', FRAMED_MAIN)) as Item[])[0], 'main item');
	const frame = (mainTipo: string, idKey: unknown, target: number): Item => ({
		type: 'dd490',
		section_tipo: SECTION,
		section_id: target,
		from_component_tipo: FRAMED_SLOT,
		main_component_tipo: mainTipo,
		id_key: idKey,
	});
	const phpSlot = [frame(FRAMED_MAIN, main.id, targetA), frame(MONO_TEXT, 1, targetC)];
	await seed(host, 'relation', FRAMED_SLOT, phpSlot);
	// the PHP save's row: the main's own items followed by the slot's FULL frames
	await recordTimeMachine(
		{
			sectionTipo: SECTION,
			sectionId: host,
			componentTipo: FRAMED_MAIN,
			lang: String(main.lang),
			userId: -1,
			data: [main, ...phpSlot],
		},
		dbTimestamp(),
	);
	return { host, main, phpSlot };
}

describe('a PHP-era composed snapshot under a REPLACE run that wrote the slot', () => {
	test('legacy envelope frames (saveTm:false): the revert restores main and frames', async () => {
		const { host, main, phpSlot } = await phpComposedHost();
		const envelope = {
			data: [{ id: 1, lang: main.lang, value: 'new' }],
			dataframe: [
				{
					from_component_tipo: FRAMED_SLOT,
					id_key: 1,
					main_component_tipo: FRAMED_MAIN,
					section_tipo: SECTION,
					section_id: targetB,
				},
			],
		};
		const replaced = await importCsv(
			`section_id;${FRAMED_MAIN}\n${host};${q(JSON.stringify({ dedalo_data: envelope }))}\n`,
			[KEY, col(FRAMED_MAIN, 'component_input_text')],
		);
		expect(replaced.failed).toEqual([]);
		const slotAfterB = (await stored(host, 'relation', FRAMED_SLOT)) as Item[];
		expect(slotAfterB.some((f) => f.section_id === targetB)).toBe(true);

		expect((await revertRun(replaced.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual([main]);
		// order-free, and blind to the item `id` the slot save gives a kept frame
		const slot = ((await stored(host, 'relation', FRAMED_SLOT)) as Item[]).map(
			({ id: _id, ...frame }) => frame,
		);
		expect(slot).toHaveLength(phpSlot.length);
		for (const entry of phpSlot) expect(slot).toContainEqual(entry);
	}, 60000);

	test('a REPLACE slot column (its row reverted first): main and the whole PHP slot come back', async () => {
		const { host, main, phpSlot } = await phpComposedHost();
		const frames = [
			{
				section_tipo: SECTION,
				section_id: targetB,
				main_component_tipo: FRAMED_MAIN,
				id_key: main.id,
			},
		];
		const replaced = await importCsv(
			`section_id;${FRAMED_MAIN};${FRAMED_SLOT}\n${host};new;${q(JSON.stringify(frames))}\n`,
			[KEY, col(FRAMED_MAIN, 'component_input_text'), col(FRAMED_SLOT, 'component_dataframe')],
		);
		expect(replaced.failed).toEqual([]);

		expect((await revertRun(replaced.bulk_process_id)).skipped).toEqual([]);
		expect(await stored(host, 'string', FRAMED_MAIN)).toEqual([main]);
		const slot = (await stored(host, 'relation', FRAMED_SLOT)) as Item[];
		expect(slot).toHaveLength(phpSlot.length);
		for (const entry of phpSlot) expect(slot).toContainEqual(entry);
	}, 60000);
});

describe('a multi-language cell on a NON-translatable column', () => {
	test('appends every value into the one lg-nolan slice (never refused)', async () => {
		const host = await newRecord();
		const seeded = [{ id: 1, lang: 'lg-nolan', value: 'a' }];
		await seed(host, 'string', MONO_TEXT, seeded);

		const report = await importCsv(
			`section_id;${MONO_TEXT}\n${host};${langCell({ 'lg-spa': ['b'], 'lg-eng': ['c'] })}\n`,
			[KEY, col(MONO_TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		expect(report.errors).toEqual([]);
		const after = (await stored(host, 'string', MONO_TEXT)) as Item[];
		expect(after[0]).toEqual(seeded[0] as Item);
		expect(after.map((item) => item.value)).toEqual(['a', 'b', 'c']);
		expect(new Set(after.map((item) => item.lang))).toEqual(new Set(['lg-nolan']));
		expect(new Set(after.map((item) => item.id)).size).toBe(3);
	}, 60000);
});

describe('an EMPTY literal entry inside an append cell', () => {
	test('{"lg-spa":"","lg-eng":"x"}: the blank is skipped, x is added, spa untouched', async () => {
		const host = await newRecord();
		const seeded = [{ id: 1, lang: 'lg-spa', value: 'kept' }];
		await seed(host, 'string', TEXT, seeded);

		const report = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ 'lg-spa': '', 'lg-eng': 'x' }))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		const after = (await stored(host, 'string', TEXT)) as Item[];
		expect(after.filter((item) => item.lang === 'lg-spa')).toEqual(seeded);
		const eng = after.filter((item) => item.lang === 'lg-eng');
		expect(eng.map((item) => item.value)).toEqual(['x']);
		expect(after.some((item) => item.value === '' || item.value === null)).toBe(false);
	}, 60000);

	test('a cell of only blanks writes nothing (no TM row)', async () => {
		const host = await newRecord();
		await seed(host, 'string', TEXT, [{ id: 1, lang: 'lg-spa', value: 'kept' }]);
		const before = await stored(host, 'string', TEXT);
		const report = await importCsv(
			`section_id;${TEXT}\n${host};${q(JSON.stringify({ 'lg-spa': '', 'lg-eng': null }))}\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
		);
		expect(report.failed).toEqual([]);
		expect(await stored(host, 'string', TEXT)).toEqual(before);
		expect(await tmRows(host)).toBe(0);
	}, 60000);
});

describe('validate_import columns[]: one entry per imported column', () => {
	test('the section_id key column has its (replace) entry', async () => {
		const host = await newRecord();
		const report = await validateCsv(
			`section_id;${TEXT}\n${host};v\n`,
			[KEY, col(TEXT, 'component_input_text', 'append')],
			`append_validate_key_${host}.csv`,
		);
		expect(report.ok).toBe(true);
		const columns = report.columns as Item[];
		expect(columns).toHaveLength(2);
		expect(columns[0]).toMatchObject({
			index: 0,
			tipo: 'section_id',
			model: 'component_section_id',
			mode: 'replace',
			refused: null,
		});
		expect(columns[1]).toMatchObject({ index: 1, tipo: TEXT, mode: 'append', refused: null });
	}, 60000);
});
