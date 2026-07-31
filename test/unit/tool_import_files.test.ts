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
// The twins live in the test3 PLAYGROUND, which every suite DB carries. They
// used to target the `ich` TLD, which exists ONLY in the live application DB —
// so the whole file aborted at collection time ("no matrix table for section
// 'ich135'") in BOTH test databases and asserted nothing. Same models, same
// assertions; only the ontology addresses moved:
//   test3/test52  — TRANSLATABLE input_text (the target_filename drive).
//   test3/test162 — NON-translatable input_text (the input_component drive).
//   test3/test145 — component_date (the target_date capture-date drive).
const FILENAME_SECTION = 'test3';
const FILENAME_COMPONENT = 'test52'; // translatable
const INPUT_SECTION = 'test3';
const INPUT_COMPONENT = 'test162'; // non-translatable
const DATE_SECTION = 'test3';
const DATE_COMPONENT = 'test145'; // component_date (non-translatable → lg-nolan)
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
		// `..._from_souce` keeps PHP's typo: it is the literal API_ACTIONS entry of
		// the oracle (class.tool_import_files.php :74), so it is a WIRE fact and
		// must never be "corrected" without a WIRE_CONTRACT entry.
	});

	/**
	 * THE WIRE. `custom_target_quality` — the Quality selector
	 * (render_tool_import_files.js :989) — reached the handler and was DROPPED, so
	 * every imported file landed in `original` whatever the operator chose. The
	 * engine honouring a `quality` it is HANDED proves nothing about that; only
	 * reading it off the payload does.
	 *
	 * An out-of-ladder tier must surface as the quality error for that file; with
	 * the option not read, the same request dies at the staging lookup instead.
	 */
	testIfDb('custom_target_quality reaches the ingest (the inert-selector bug)', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		const action = mustGet(loaded!.module.apiActions.import_files, 'import_files');
		const call = async (customTargetQuality?: string): Promise<string[]> => {
			const response = await action.handler({
				principal: await resolvePrincipal(USER),
				userId: USER,
				background: false,
				options: {
					tipo: 'test99', // component_image in the test3 playground
					section_tipo: FILENAME_SECTION,
					section_id: mustGet(filenameScratchId, 'filename scratch id'),
					tool_config: {},
					key_dir: 'kd_wire',
					files_data: [{ name: 'wire.jpg', tmp_name: 'wire.jpg', extension: 'jpg' }],
					...(customTargetQuality === undefined
						? {}
						: { custom_target_quality: customTargetQuality }),
				},
			});
			return (response.errors as string[]) ?? [];
		};

		expect((await call('not_a_tier')).join(' ')).toContain("Unknown media quality 'not_a_tier'");
		// Same request without it must fail elsewhere — asserted POSITIVELY, so the
		// control arm cannot pass by returning no errors at all.
		const control = (await call()).join(' ');
		expect(control).toContain('Staged upload not found');
		expect(control).not.toContain('media quality');
	});

	test('the matcher gates read the TARGET section out of the payload', async () => {
		const loaded = await getLoadedTool('tool_import_files');
		const actions = loaded!.module.apiActions;

		// get_media_section_match: the handler only ever receives the target inside
		// `target_filename`. A gate on options.section_tipo saw nothing and denied
		// every call ("invalid section target") — the action was dead over the wire.
		const free = mustGet(actions.get_media_section_match, 'get_media_section_match');
		expect(free.permission).toBe('section_list');
		expect(free.minLevel).toBe(1);
		expect(
			free.sectionTipos?.({
				full_name: 'x.jpg',
				target_filename: { tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			}),
		).toEqual([FILENAME_SECTION]);
		expect(free.sectionTipos?.({ full_name: 'x.jpg' })).toEqual([]); // fail-closed

		// ..._from_souce reads filename values out of the TARGET section too, so
		// gating only the SOURCE left the section whose data it reads unchecked.
		const fromSource = mustGet(
			actions.get_media_section_match_from_souce,
			'get_media_section_match_from_souce',
		);
		expect(fromSource.permission).toBe('section_list');
		expect(
			fromSource.sectionTipos?.({
				section_tipo: 'oh1',
				section_id: 1,
				target_section_tipo: FILENAME_SECTION,
				full_name: 'x.jpg',
			}),
		).toEqual(['oh1', FILENAME_SECTION]);
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

	testIfDb('a translatable input_component no longer refuses the batch (WC-078)', async () => {
		// WAS: the batch was refused outright, before touching a single file,
		// because the PHP temp-session component (is_temp at fake section_id 1)
		// has no TS twin. That made the tool unusable with the SHIPPED import
		// form, which carries translatable text fields — the user-visible
		// "images upload fails". Translatable values are now written per-lang
		// from the entries the client ships (each carries its own `lang`).
		//
		// This asserts only that the pre-flight REFUSAL is gone: the run still
		// fails here for the unrelated reason that 'a.jpg' was never staged, so
		// pin the absence of the old message rather than a success.
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
						{
							role: 'input_component',
							tipo: FILENAME_COMPONENT,
							section_tipo: FILENAME_SECTION,
						},
					],
				},
				section_tipo: 'rsc170',
				tipo: 'rsc29',
				files_data: [{ name: 'a.jpg' }],
			},
		});
		expect(res.msg).not.toContain('translatable input_component');
		// It got PAST the pre-flight and into the per-file loop, where the
		// unstaged file is reported per-file instead of aborting the batch.
		expect(res.result).toBe(true);
		expect((res as { errors?: string[] }).errors?.join(' ')).toContain('a.jpg');
	});
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

	// WC-078: a translatable input_component used to THROW here (PHP reached all
	// languages through a temp-session component that has no TS twin). It now
	// writes per-lang from the entries the client ships — a save call stores
	// exactly ONE lang slice, so the entries are grouped by their own `lang`.
	test('translatable input_component with NO temp payload writes nothing (no throw)', async () => {
		const before = await readItems(
			FILENAME_SECTION,
			filenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		await setComponentsData({
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
		});
		const after = await readItems(
			FILENAME_SECTION,
			filenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(after).toEqual(before);
	});

	test('translatable input_component writes the entry under its OWN lang', async () => {
		await setComponentsData({
			ddoMap: [
				{ role: 'input_component', tipo: FILENAME_COMPONENT, section_tipo: FILENAME_SECTION },
			],
			sectionTipo: 'oh1',
			sectionId: 0,
			targetSectionId: filenameScratchId as number,
			currentFileName: 'a.jpg',
			mediaFilePath: null,
			targetComponentModel: '',
			// `entries` is the live wire key (WC-001); the entry carries its lang.
			componentsTempData: [
				{
					tipo: FILENAME_COMPONENT,
					section_tipo: FILENAME_SECTION,
					entries: [{ value: 'caption from the import form', lang: DATA_LANG }],
				},
			],
			userId: USER,
			dataLang: DATA_LANG,
		});
		const stored = await readItems(
			FILENAME_SECTION,
			filenameScratchId as number,
			FILENAME_COMPONENT,
			'component_input_text',
		);
		expect(stored).toContainEqual(
			expect.objectContaining({ value: 'caption from the import form', lang: DATA_LANG }),
		);
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
