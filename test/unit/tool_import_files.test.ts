/**
 * R2 gate: tool_import_files. The basename matcher + named-processor allowlist
 * are unit-tested; the module loads with its 4 actions; file_processor fails
 * CLOSED for unregistered names (SEC-053 collapse / crop_50 ledgered).
 *
 * DDO-map role writes (setComponentsData): pure routing/lang/copy-plan logic
 * runs credless; the WRITE drives run scratch-twin against the REAL DB
 * (create → import-role write → read back → delete; never a real record),
 * gated at collection time via test.if(hasDb) so an offline run reports
 * SKIP, never a silent fake-pass (S2-40 posture).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	basenamesMatch,
	fileBasename,
	getFileProcessor,
	registerFileProcessor,
} from '../../src/core/tools/import_files_match.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	buildMultiMatchCopyPlan,
	destinationSectionIdFor,
	filenameValueFor,
	setComponentsData,
} from '../../tools/tool_import_files/server/index.ts';
import { mustGet } from '../helpers/assert.ts';

// ── scratch twins (collection-time probe → visible SKIP when DB absent) ──
// ich135/ich137: translatable input_text (the target_filename drive).
// ich1/ich22: NON-translatable input_text (the input_component drive).
// ich1/ich41: component_date (the target_date capture-date drive).
const FILENAME_SECTION = 'ich135';
const FILENAME_COMPONENT = 'ich137'; // translatable
const INPUT_SECTION = 'ich1';
const INPUT_COMPONENT = 'ich22'; // non-translatable
const DATE_SECTION = 'ich1';
const DATE_COMPONENT = 'ich41'; // component_date (non-translatable → lg-nolan)
const USER = -1;
const DATA_LANG = 'lg-eng'; // the request data lang threaded into the role writes

// DB reachability is probed INDEPENDENTLY of the scratch-twin creates: only a
// genuinely-unreachable DB may downgrade the write drives to a visible SKIP. If
// the DB IS reachable but createSectionRecord throws, that is a real regression
// and MUST redden the file — never masquerade as a benign skip (silent-green
// trap). Every twin that IS created is tracked so afterAll tears it down even
// when a later create throws mid-sequence (no scratch-row leak).
const createdTwins: [string, number][] = [];
let filenameScratchId: number | null = null;
let basenameScratchId: number | null = null;
let inputScratchId: number | null = null;
let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[tool_import_files] DB unavailable — ddo_map write drives SKIPPED on this run');
}
/** Create a scratch twin and track it for the afterAll teardown. */
const createTwin = async (sectionTipo: string): Promise<number> => {
	const id = await createSectionRecord(sectionTipo, USER);
	createdTwins.push([sectionTipo, id]);
	return id;
};
if (hasDb) {
	// DB reachable: a create failure here propagates (collection-time RED).
	filenameScratchId = await createTwin(FILENAME_SECTION);
	basenameScratchId = await createTwin(FILENAME_SECTION);
	inputScratchId = await createTwin(INPUT_SECTION);
}
const testIfDb = test.if(hasDb);

// target_date capture-date drive: the reader shells out to pdfinfo (config-
// resolved path) — absent binary = visible SKIP, never a silent fake-pass.
const hasPdfinfo = existsSync(config.media.binaries.pdfinfo);
const FIXTURE_DIR = join(tmpdir(), `dedalo_import_files_${process.pid}`);
mkdirSync(FIXTURE_DIR, { recursive: true });

/** A minimal one-page PDF whose Info dict carries the given /CreationDate. */
function pdfWithCreationDate(rawDate: string): string {
	return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>
endobj
4 0 obj
<< /CreationDate (${rawDate}) >>
endobj
trailer
<< /Root 1 0 R /Info 4 0 R /Size 5 >>
%%EOF
`;
}

afterAll(async () => {
	rmSync(FIXTURE_DIR, { recursive: true, force: true });
	for (const [sectionTipo, sectionId] of createdTwins) {
		try {
			await deleteSectionRecord(sectionTipo, sectionId, USER);
		} catch {
			// best-effort cleanup
		}
	}
});

async function readItems(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	model: string,
): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	const record = await readMatrixRecord(table as string, sectionTipo, sectionId);
	return readComponentItems(record as NonNullable<typeof record>, componentTipo, model) ?? [];
}

describe('basename matcher', () => {
	test('fileBasename strips directory and final extension (PHP pathinfo filename)', () => {
		expect(fileBasename('73-my image-A.tiff')).toBe('73-my image-A');
		expect(fileBasename('/a/b/photo.jpg')).toBe('photo');
		expect(fileBasename('noext')).toBe('noext');
		expect(fileBasename('.hidden')).toBe('.hidden');
	});
	test('basenamesMatch compares extension-stripped names', () => {
		expect(basenamesMatch('photo.jpg', 'photo.png')).toBe(true);
		expect(basenamesMatch('photo.jpg', 'photo2.jpg')).toBe(false);
	});
});

describe('named-processor allowlist (SEC-053 collapse)', () => {
	test('unregistered / invalid names are refused', () => {
		expect(getFileProcessor('crop_50')).toBeNull();
		expect(getFileProcessor('../evil')).toBeNull();
		expect(getFileProcessor('a b')).toBeNull();
	});
	test('a registered processor is retrievable; bad names throw on register', () => {
		registerFileProcessor('test_noop', async () => ({ result: true, msg: 'ok' }));
		expect(getFileProcessor('test_noop')).not.toBeNull();
		expect(() =>
			registerFileProcessor('bad name', async () => ({ result: true, msg: '' })),
		).toThrow();
	});
});

describe('ddo_map pure logic (no DB)', () => {
	test('destination routing: caller-section ddo → caller record, else the target record', () => {
		// PHP set_components_data :1635.
		expect(destinationSectionIdFor('oh1', 'oh1', 5, 99)).toBe(5);
		expect(destinationSectionIdFor('rsc170', 'oh1', 5, 99)).toBe(99);
	});

	test('only_basename strips section_id prefix, field letter and extension', () => {
		expect(filenameValueFor('73-portrait-A.jpg', true)).toBe('portrait');
		expect(filenameValueFor('73-portrait-A.jpg', false)).toBe('73-portrait-A.jpg');
		expect(filenameValueFor('IMG_3007.jpg', false)).toBe('IMG_3007.jpg');
		// No base_name segment (purely numeric filename) → empty string.
		expect(filenameValueFor('42.jpg', true)).toBe('');
	});

	test('multi-match copy plan: every target but the LAST gets a suffixed copy', () => {
		// PHP :974-1041 — the last target consumes the original staged file.
		const plan = buildMultiMatchCopyPlan([11, 12, 13], 'portrait.tiff', 'portrait.tiff');
		expect(plan).toEqual([
			{
				targetSectionId: 11,
				tmpName: 'portrait_11.tiff',
				fileName: 'portrait_11.tiff',
				isLast: false,
			},
			{
				targetSectionId: 12,
				tmpName: 'portrait_12.tiff',
				fileName: 'portrait_12.tiff',
				isLast: false,
			},
			{ targetSectionId: 13, tmpName: 'portrait.tiff', fileName: 'portrait.tiff', isLast: true },
		]);
	});

	test('multi-match copy plan: single match = original only; no matches = empty plan', () => {
		expect(buildMultiMatchCopyPlan([7], 'a.jpg', 'a.jpg')).toEqual([
			{ targetSectionId: 7, tmpName: 'a.jpg', fileName: 'a.jpg', isLast: true },
		]);
		expect(buildMultiMatchCopyPlan([], 'a.jpg', 'a.jpg')).toEqual([]);
	});
});

describe('tool_import_files module', () => {
	test('loads with the 4 actions + import_files backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'file_processor',
			'get_media_section_match',
			'get_media_section_match_from_souce',
			'import_files',
		]);
		expect(loaded!.module.backgroundRunnable).toEqual(['import_files']);
	});

	test('file_processor fails closed for an unregistered name', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(loaded!.module.apiActions.file_processor, 'file_processor').handler({
			principal,
			userId: -1,
			background: false,
			options: { file_processor: 'crop_50' },
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('not a registered processor');
	});

	test('import_files rejects missing required params (no run without a media component)', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		const principal = await resolvePrincipal(-1);
		// Missing section_tipo/tipo/files_data → clean validation failure (all modes).
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal,
			userId: -1,
			background: true,
			options: {
				tool_config: { import_file_name_mode: 'match' },
				section_tipo: '',
				tipo: '',
				files_data: [],
			},
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Missing');
	});

	testIfDb('import_files with a ddo_map requires the target_component role', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal,
			userId: -1,
			background: true,
			options: {
				tool_config: { ddo_map: [{ role: 'target_filename', tipo: 'rsc398' }] },
				section_tipo: 'oh1',
				tipo: 'rsc29',
				files_data: [{ name: 'a.jpg' }],
			},
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('target_component');
	});

	testIfDb(
		'import_files FAILS LOUD (before any ingest) on a translatable input_component',
		async () => {
			// The PHP temp-session component (is_temp at fake section_id 1) has no
			// TS twin — the batch is refused, never silently dropped (ledgered).
			const loaded = await getLoadedTool('tool_import_files');
			const principal = await resolvePrincipal(-1);
			const res = await mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
				principal,
				userId: -1,
				background: true,
				options: {
					tool_config: {
						import_mode: 'section_resource',
						ddo_map: [
							{ role: 'target_component', tipo: 'rsc29', section_tipo: 'rsc170' },
							{ role: 'input_component', tipo: FILENAME_COMPONENT, section_tipo: 'ich135' },
						],
					},
					section_tipo: 'rsc170',
					tipo: 'rsc29',
					files_data: [{ name: 'a.jpg' }],
				},
			});
			expect(res.result).toBe(false);
			expect(res.msg).toContain('translatable input_component');
		},
	);
});

describe.if(hasDb)('setComponentsData drive (scratch-twin, real DB)', () => {
	test('target_filename fills an EMPTY component with [{value, lang}]', async () => {
		await setComponentsData({
			ddoMap: [
				{ role: 'target_filename', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			],
			sectionTipo: 'oh1', // caller differs → destination = targetSectionId
			sectionId: 0,
			targetSectionId: filenameScratchId as number,
			currentFileName: 'photo.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const stored = await readItems(
			FILENAME_SECTION,
			filenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(stored).toContainEqual(expect.objectContaining({ value: 'photo.jpg' }));
		// translatable component → the request/default DATA lang, never lg-nolan
		expect((stored[0] as { lang?: string }).lang).toMatch(/^lg-/);
		expect((stored[0] as { lang?: string }).lang).not.toBe('lg-nolan');
	});

	test('target_filename NEVER overwrites existing data (PHP empty-guard)', async () => {
		await setComponentsData({
			ddoMap: [
				{ role: 'target_filename', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			],
			sectionTipo: 'oh1',
			sectionId: 0,
			targetSectionId: filenameScratchId as number,
			currentFileName: 'OTHER.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const stored = await readItems(
			FILENAME_SECTION,
			filenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(stored).toContainEqual(expect.objectContaining({ value: 'photo.jpg' }));
		expect(stored).not.toContainEqual(expect.objectContaining({ value: 'OTHER.jpg' }));
	});

	test('target_filename only_basename stores the parsed base_name segment', async () => {
		await setComponentsData({
			ddoMap: [
				{
					role: 'target_filename',
					tipo: FILENAME_COMPONENT,
					section_tipo: FILENAME_SECTION,
					only_basename: true,
				},
			],
			sectionTipo: 'oh1',
			sectionId: 0,
			targetSectionId: basenameScratchId as number,
			currentFileName: '73-portrait-A.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const stored = await readItems(
			FILENAME_SECTION,
			basenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(stored).toContainEqual(expect.objectContaining({ value: 'portrait' }));
	});

	test('input_component (non-translatable) writes the temp-data value at lg-nolan', async () => {
		// ddo.section_tipo === caller section_tipo → destination is the CALLER record.
		await setComponentsData({
			ddoMap: [{ role: 'input_component', tipo: INPUT_COMPONENT, section_tipo: INPUT_SECTION }],
			sectionTipo: INPUT_SECTION,
			sectionId: inputScratchId as number,
			targetSectionId: 999999, // must NOT be used by the routing
			currentFileName: 'a.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [
				{
					tipo: INPUT_COMPONENT,
					section_tipo: INPUT_SECTION,
					value: [{ value: 'from the import form' }],
				},
			],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const stored = await readItems(
			INPUT_SECTION,
			inputScratchId as number,
			INPUT_COMPONENT,
			'component_input_text',
		);
		expect(stored).toContainEqual(
			expect.objectContaining({ value: 'from the import form', lang: 'lg-nolan' }),
		);
	});

	test('input_component with an EMPTY temp value writes nothing (PHP !empty guard)', async () => {
		const before = await readItems(
			INPUT_SECTION,
			inputScratchId as number,
			INPUT_COMPONENT,
			'component_input_text',
		);
		await setComponentsData({
			ddoMap: [{ role: 'input_component', tipo: INPUT_COMPONENT, section_tipo: INPUT_SECTION }],
			sectionTipo: INPUT_SECTION,
			sectionId: inputScratchId as number,
			targetSectionId: 999999,
			currentFileName: 'a.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [
				{ tipo: INPUT_COMPONENT, section_tipo: INPUT_SECTION, value: [] },
				// null holes are never persisted either (PHP fallback_value [null])
				{ tipo: 'unrelated', section_tipo: INPUT_SECTION, value: [null] },
			],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const after = await readItems(
			INPUT_SECTION,
			inputScratchId as number,
			INPUT_COMPONENT,
			'component_input_text',
		);
		expect(after).toEqual(before);
	});

	test('translatable input_component THROWS (no TS temp-session twin — ledgered)', async () => {
		await expect(
			setComponentsData({
				ddoMap: [
					{ role: 'input_component', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
				],
				sectionTipo: 'oh1',
				sectionId: 0,
				targetSectionId: filenameScratchId as number,
				currentFileName: 'a.jpg',
				mediaFilePath: null,
				targetComponentModel: '',
				componentsTempData: [],
				userId: USER,
				dataLang: DATA_LANG,
			}),
		).rejects.toThrow(/translatable input_component/);
	});

	// Gated separately (visible SKIP): the reader shells out to pdfinfo.
	test.if(hasPdfinfo)(
		'target_date fills an EMPTY date component from the staged file capture date',
		async () => {
			const dateScratchId = await createTwin(DATE_SECTION);
			const pdfPath = join(FIXTURE_DIR, 'dated.pdf');
			writeFileSync(pdfPath, pdfWithCreationDate("D:20110816234339-04'00'"));
			const write = async (mediaFilePath: string): Promise<void> =>
				setComponentsData({
					ddoMap: [{ role: 'target_date', tipo: DATE_COMPONENT, section_tipo: DATE_SECTION }],
					sectionTipo: 'oh1', // caller differs → destination = targetSectionId
					sectionId: 0,
					targetSectionId: dateScratchId,
					currentFileName: 'dated.pdf',
					mediaFilePath,
					targetComponentModel: 'component_pdf',
					componentsTempData: [],
					userId: USER,
					dataLang: DATA_LANG,
				});
			await write(pdfPath);
			// PHP persisted shape: [{id, start: dd_date}] — set_data mints the item
			// id (set_data_item_counter; a fresh record starts at 1) and the start
			// carries the server-computed 'time' (component_date::save add_time;
			// 372-day years / 31-day months).
			const expected = [
				{
					id: 1,
					start: {
						year: 2011,
						month: 8,
						day: 16,
						time: 2011 * 372 * 86400 + 7 * 31 * 86400 + 15 * 86400,
					},
				},
			];
			expect(
				await readItems(DATE_SECTION, dateScratchId, DATE_COMPONENT, 'component_date'),
			).toEqual(expected);
			// Fill-only-when-empty (PHP :1678): a re-import with ANOTHER date never overwrites.
			const otherPdf = join(FIXTURE_DIR, 'other.pdf');
			writeFileSync(otherPdf, pdfWithCreationDate('D:19990101'));
			await write(otherPdf);
			expect(
				await readItems(DATE_SECTION, dateScratchId, DATE_COMPONENT, 'component_date'),
			).toEqual(expected);
		},
	);

	test('target_date with no readable date writes NOTHING (PHP skip-when-empty)', async () => {
		const dateScratchId = await createTwin(DATE_SECTION);
		const write = async (mediaFilePath: string | null, model: string): Promise<void> =>
			setComponentsData({
				ddoMap: [{ role: 'target_date', tipo: DATE_COMPONENT, section_tipo: DATE_SECTION }],
				sectionTipo: 'oh1',
				sectionId: 0,
				targetSectionId: dateScratchId,
				currentFileName: 'a.bin',
				mediaFilePath,
				targetComponentModel: model,
				componentsTempData: [],
				userId: USER,
				dataLang: DATA_LANG,
			});
		await write(null, 'component_pdf'); // no staged file
		await write(join(FIXTURE_DIR, 'missing.pdf'), 'component_pdf'); // consumed/moved file
		const undatedPdf = join(FIXTURE_DIR, 'undated_role.pdf');
		writeFileSync(undatedPdf, pdfWithCreationDate('').replace('/CreationDate ()', '/Producer (x)'));
		await write(undatedPdf, 'component_pdf'); // parseable file, no CreationDate
		await write(undatedPdf, 'component_3d'); // model outside the PHP switch
		expect(await readItems(DATE_SECTION, dateScratchId, DATE_COMPONENT, 'component_date')).toEqual(
			[],
		);
	});

	test('component_option / target_component roles never produce a data write', async () => {
		const before = await readItems(
			FILENAME_SECTION,
			basenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		await setComponentsData({
			ddoMap: [
				{ role: 'component_option', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
				{ role: 'target_component', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			],
			sectionTipo: 'oh1',
			sectionId: 0,
			targetSectionId: basenameScratchId as number,
			currentFileName: 'never-written.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			componentsTempData: [],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const after = await readItems(
			FILENAME_SECTION,
			basenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(after).toEqual(before);
		expect(after).not.toContainEqual(expect.objectContaining({ value: 'never-written.jpg' }));
	});
});

describe.if(hasDb)('get_media_section_match (SQO component-value filter, scratch-twin)', () => {
	/** Store a filename value on a fresh scratch twin; returns its section_id. */
	async function twinWithFilename(value: string): Promise<number> {
		const id = await createTwin(FILENAME_SECTION);
		const save = await saveComponentData({
			componentTipo: FILENAME_COMPONENT,
			sectionTipo: FILENAME_SECTION,
			sectionId: id,
			lang: DATA_LANG,
			changedData: [{ action: 'set_data', id: null, value: [{ value, lang: DATA_LANG }] }],
			userId: USER,
		});
		expect(save.ok).toBe(true);
		return id;
	}

	async function runMatch(fullName: string): Promise<unknown> {
		const loaded = await getLoadedTool('tool_import_files');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(
			loaded!.module.apiActions.get_media_section_match,
			'get_media_section_match',
		).handler({
			principal,
			userId: -1,
			background: false,
			options: {
				full_name: fullName,
				target_filename: { tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			},
		});
		expect(res.errors).toEqual([]);
		return res.result;
	}

	test('finds the exact-basename record across an extension change; near-names excluded', async () => {
		// Unique stamp so the search never collides with real section records.
		const stamp = `mfp${Date.now()}`;
		const matchId = await twinWithFilename(`${stamp}_one.jpg`);
		await twinWithFilename(`${stamp}_one2.jpg`); // 'my_image2' near-name must NOT match
		// Extension change tolerated (PHP: jpg on record, tiff uploaded).
		expect(await runMatch(`${stamp}_one.tiff`)).toEqual([matchId]);
	});

	test('basenames with search-operator characters ride the fallback prefilter', async () => {
		// '(' would change meaning inside the string builder's regex → the SQO
		// uses the not-empty filter and the exact comparison decides in memory.
		const stamp = `mfq${Date.now()}`;
		const matchId = await twinWithFilename(`${stamp} (1).jpg`);
		expect(await runMatch(`${stamp} (1).png`)).toEqual([matchId]);
		// No stored basename equals '<stamp> (2)' → empty result, no error.
		expect(await runMatch(`${stamp} (2).png`)).toEqual([]);
	});
});
