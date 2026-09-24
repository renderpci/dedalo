/**
 * TOOL_EXPORT MEDIA ZIP — behavioural gate for the server-built media archive
 * (tools/tool_export/server/writers/media_zip.ts), through the ONE door a file
 * comes into existence by (writers/index.ts `buildArtifactFile`).
 *
 * THE SITUATION IS BUILT, NOT BORROWED. On the SUITE database (marker-checked)
 * the scope-binding fixture mints user A (test3 = 2, test3.test99 = 2 — the
 * component_image — NOTHING on test3.test85, the component_pdf; own project)
 * and user B (default project). Records are created at runtime through the
 * engine (`createSectionRecord` — A's are born inside A's project, B's outside
 * it), their media column written, and real files planted in the SUITE MEDIA
 * ROOT (config.media.rootPath, repointed + marked by the test_media preload).
 * The export spool lives in a DECLARED scratch export root. Everything is swept.
 *
 * The export runs as A (the manifest's user_id) and asks for the image MASTER
 * ('original'), so every leg says something about the policy:
 *
 *  A. files present → archived STORED, bytes identical, name = basename,
 *     the same file referenced twice archived once, info.txt lists it;
 *  B. a stored file absent from disk → failed 'missing_file';
 *  C. a record outside A's projects → failed 'not_authorized', bytes absent;
 *  D. a component A holds no grant on (test85) → 'not_authorized';
 *  E. a traversal-shaped stored file_path → 'invalid_path'; a symlink inside
 *     the root pointing outside it → 'invalid_path'; the outside bytes absent;
 *  F. a crafted cell naming A's record but not its stored file → 'not_in_record';
 *     an unparseable name in a nested column → 'unidentified';
 *  G. a name outside the grammar in a TOP-LEVEL column → addressed by the row;
 *     a renamed name that FITS the grammar and parses wrong ('inv_a12_<id>.jpg'
 *     → component 'inv') → still addressed by the row, archived;
 *  K. a name addressing a non-media component (nested column) → 'not_media';
 *     no file at the target quality / file_exist false → 'quality_unavailable';
 *     an external source at the target quality → 'external';
 *  H. dedalo_raw cells resolve the same way;
 *  I. quality validation: an off-ladder quality → media.invalid_quality, no file;
 *     a non-media key → request.invalid_options; the variant slug is legal and
 *     distinct per choice;
 *  J. ZIP64 (injected limits) still reads back identically; cancel → nothing.
 *  O. a STORED files_info path is never trusted to name the file: a master
 *     entry A wrote pointing at another user's import CSV, at the .publication
 *     marker store, at B's canonical master in the same bucket, or at a
 *     web-server-denied suffix in A's own folder, or A's own canonical master
 *     symlinked to that CSV (inside the root) → 'invalid_path', bytes absent;
 *  M. 60,000 refused candidates: the writer's heap stays within a few MB (the
 *     failure list lives in an unlinked temp, the candidate memo is a bounded
 *     window) and info.txt is still byte-exact JSON.stringify(failures, null, 2).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import { buildMediaLocation, type MediaPathOptions } from '../../src/core/media/path.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { exportRecordScope } from '../../tools/tool_export/server/access.ts';
import {
	type ArtifactJobRef,
	type ArtifactStore,
	openArtifactStore,
} from '../../tools/tool_export/server/artifact_store.ts';
import {
	exportReadSections,
	runBuildExportFile,
} from '../../tools/tool_export/server/export_job.ts';
import { openSpoolReader } from '../../tools/tool_export/server/spool_reader.ts';
import { buildArtifactFile } from '../../tools/tool_export/server/writers/index.ts';
import {
	isArchivableEntryName,
	MEDIA_ZIP_INFO_NAME,
	mediaZipVariant,
	mediaZipWriter,
	parseMediaFileName,
} from '../../tools/tool_export/server/writers/media_zip.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { markExportArtifactsRoot } from '../helpers/media_scratch_root.ts';
import {
	installScopeBindingFixture,
	removeScopeBindingFixture,
	SB_PROJECT_OF_A,
	SB_USER_A,
	SB_USER_B,
} from '../helpers/scope_binding_fixture.ts';
import { readZip, type ZipReadResult, zipText } from '../helpers/zip_xml_reader.ts';

const SECTION = 'test3';
const IMAGE = 'test99';
const PDF = 'test85';
const EXPORT_BASE = 'https://media.example.test/dedalo/media';

const image = mediaTypeOf('component_image')!;
const pdf = mediaTypeOf('component_pdf')!;
const MASTER = image.originalQuality;
const DEFAULT = image.defaultQuality;

const createdRecords: number[] = [];
const createdFiles: string[] = [];
const scratchDirs: string[] = [];
let imageOpts: MediaPathOptions;
let pdfOpts: MediaPathOptions;

/** A's records */
let recFull = 0; // default + master present
let recMissing = 0; // master listed, absent on disk
let recTraversal = 0; // master file_path climbs out of the root
let recSymlink = 0; // master is a symlink to a file outside the root
let recRenamed = 0; // files outside the grammar (top-level fallback)
let recGrammarRenamed = 0; // renamed files that FIT the grammar and parse wrong
let recNoMaster = 0; // only the default quality is stored
let recNotExist = 0; // master listed with file_exist false
let recExternal = 0; // master is an external source
/** The renamed name that fits the grammar ('inv' parses as a component tipo). */
const grammarRenamedName = (id: number): string => `inv_a12_${id}.jpg`;
/** B's record — outside A's projects */
let recOut = 0;

let outsideFile = '';
const OUTSIDE_BYTES = 'SECRET OUTSIDE THE MEDIA ROOT';

function fileInfo(quality: string, relativePath: string, exists = true) {
	return {
		quality,
		file_exist: exists,
		file_name: relativePath.split('/').pop(),
		file_path: relativePath,
		file_size: 10,
		file_time: null,
		extension: 'jpg',
	};
}

/** Plant a file (in the suite media root) at a model's canonical location. */
function plant(
	spec: typeof image,
	componentTipo: string,
	sectionId: number,
	quality: string,
	opts: MediaPathOptions,
	extension = 'jpg',
): { relativePath: string; bytes: string } {
	const location = buildMediaLocation(
		spec,
		{ componentTipo, sectionTipo: SECTION, sectionId, lang: null },
		quality,
		extension,
		opts,
	);
	const bytes = `media ${componentTipo} ${sectionId} ${quality} ${'x'.repeat(sectionId % 7)}`;
	mkdirSync(dirname(location.absolutePath), { recursive: true });
	writeFileSync(location.absolutePath, bytes);
	createdFiles.push(location.absolutePath);
	return { relativePath: location.relativePath, bytes };
}

function locationOf(
	spec: typeof image,
	componentTipo: string,
	sectionId: number,
	quality: string,
	opts: MediaPathOptions,
) {
	return buildMediaLocation(
		spec,
		{ componentTipo, sectionTipo: SECTION, sectionId, lang: null },
		quality,
		'jpg',
		opts,
	);
}

async function setMedia(sectionId: number, media: Record<string, unknown>): Promise<void> {
	await updateMatrixRecord('matrix_test', SECTION, sectionId, { media });
}

/**
 * A test3 record created through the engine and filed under ONE project
 * (test101, test3's component_filter): A's own project puts it inside A's
 * scope, the default project outside it.
 */
async function newRecord(userId: number, projectId: number): Promise<number> {
	const id = await createSectionRecord(SECTION, userId);
	createdRecords.push(id);
	await sql.unsafe(
		`UPDATE matrix_test SET relation = coalesce(relation, '{}'::jsonb) || $3::text::jsonb
		 WHERE section_tipo = $1 AND section_id = $2`,
		[
			SECTION,
			id,
			encodeForJsonb({
				test101: [
					{
						id: 1,
						type: 'dd675',
						section_id: projectId,
						section_tipo: config.features.filterSectionTipo,
						from_component_tipo: 'test101',
					},
				],
			}),
		],
	);
	return id;
}

const planted: Record<string, { relativePath: string; bytes: string }> = {};

function removeEmptyDir(dir: string): void {
	try {
		rmdirSync(dir);
	} catch {
		/* not empty (shared bucket) or absent — leave it */
	}
}

/**
 * Every trace this gate's records left in the suite media root: in each
 * quality dir of each model, the records' bucket and its deleted/ folder —
 * only names that carry one of OUR record ids — then the dirs, if empty.
 */
function sweepMediaTraces(): void {
	const root = config.media.rootPath;
	if (root === null) return;
	const models: [typeof image, string, MediaPathOptions][] = [
		[image, IMAGE, imageOpts],
		[pdf, PDF, pdfOpts],
	];
	for (const [spec, tipo, opts] of models) {
		const typeRel = `${spec.folder}${opts.initialMediaPath}`;
		const typeDir = join(root, typeRel);
		if (!existsSync(typeDir)) continue;
		for (const id of createdRecords) {
			const prefix = `${typeRel}/${spec.defaultQuality}`;
			const bucket = dirname(
				locationOf(spec, tipo, id, spec.defaultQuality, opts).relativePath,
			).slice(prefix.length);
			const ours = (name: string): boolean =>
				name.startsWith(`${tipo}_${SECTION}_${id}.`) ||
				name.startsWith(`${tipo}_${SECTION}_${id}_`) ||
				name === `renamed photo ${id}.jpg` ||
				name === grammarRenamedName(id);
			for (const quality of readdirSync(typeDir)) {
				const dir = join(typeDir, quality + bucket);
				for (const sub of [join(dir, 'deleted'), dir]) {
					if (!existsSync(sub)) continue;
					for (const name of readdirSync(sub)) {
						if (ours(name)) rmSync(join(sub, name), { force: true });
					}
					removeEmptyDir(sub);
				}
			}
		}
	}
}

// --------------------------------------------------------------- the export spool

function markedStore(): ArtifactStore {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_export_media_zip_'));
	scratchDirs.push(dir);
	return openArtifactStore({
		root: markExportArtifactsRoot(join(dir, 'artifacts')),
		quotaBytes: 0,
		ttlHours: 24,
	});
}

type Line = Record<string, unknown>;

async function endedJob(
	store: ArtifactStore,
	lines: Line[],
	dataFormat = 'standard',
	/** The export's options and read set as runExportArtifact records them. */
	recorded: { options?: Record<string, unknown> } = {},
): Promise<ArtifactJobRef> {
	const options = { data_format: dataFormat, breakdown: 'rows', ...(recorded.options ?? {}) };
	const { job } = await store.createJob({
		userId: SB_USER_A,
		sectionTipo: SECTION,
		// exactly what the build records: every section the export READS
		sections: exportReadSections({ section_tipo: SECTION, ...options }),
		options,
		// A's real scope: leg L reaches the job through the owned-job door.
		recordScope: await exportRecordScope(await resolvePrincipal(SB_USER_A)),
		applicationLang: 'lg-eng',
	});
	const writer = await store.openSpoolWriter(job, { indexEvery: 4 });
	for (const line of lines) await writer.write(line);
	await writer.close();
	await store.updateManifest(job, { status: 'ended', ended_at: new Date().toISOString() });
	return job;
}

const url = (relativePath: string): string => `${EXPORT_BASE}${relativePath}`;

async function build(
	store: ArtifactStore,
	job: ArtifactJobRef,
	extra: Record<string, unknown>,
	signal: AbortSignal = new AbortController().signal,
): Promise<{ zip: ZipReadResult; info: string; rows: number }> {
	const file = await buildArtifactFile({
		store,
		job,
		format: 'media_zip',
		options: { origin: 'https://example.test', showTipoInLabel: false, ...extra },
		signal,
	});
	const bytes = new Uint8Array(readFileSync(join(job.dir, file.basename)));
	const zip = readZip(bytes);
	return { zip, info: zipText(zip, MEDIA_ZIP_INFO_NAME), rows: file.rows };
}

function parseInfo(info: string): {
	downloaded: string[];
	failed: { file: string; reason: string }[];
} {
	const downloaded = /Downloaded files: (\[[\s\S]*?\])\nFailed files:/.exec(info)?.[1];
	const failed = /Failed files: (\[[\s\S]*\])\n?$/.exec(info)?.[1];
	return { downloaded: JSON.parse(downloaded ?? 'null'), failed: JSON.parse(failed ?? 'null') };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	let caught: unknown = null;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}
	expect(isDedaloError(caught), `expected ${code}, got ${String(caught)}`).toBe(true);
	expect((caught as { code: string }).code).toBe(code);
}

function expectNoArtifact(job: ArtifactJobRef): void {
	expect(readdirSync(job.dir).sort()).toEqual([
		'cols.ndjson',
		'grid.idx',
		'grid.ndjson',
		'manifest.json',
		'request.json',
	]);
}

const text = (entry: { data: Uint8Array }): string => new TextDecoder().decode(entry.data);

// ------------------------------------------------------------------ situation

describe.if(DB_READY)('tool_export media ZIP — built on the server, authorized per file', () => {
	beforeAll(async () => {
		await assertTestDatabase('tool_export_media_zip_native');
		await installScopeBindingFixture();
		imageOpts = await resolveMediaPathOptions(IMAGE, SECTION);
		pdfOpts = await resolveMediaPathOptions(PDF, SECTION);

		// A: default + master present
		recFull = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.fullDefault = plant(image, IMAGE, recFull, DEFAULT, imageOpts);
		planted.fullMaster = plant(image, IMAGE, recFull, MASTER, imageOpts);
		planted.pdfWeb = plant(pdf, PDF, recFull, pdf.defaultQuality, pdfOpts, 'pdf');
		await setMedia(recFull, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(MASTER, planted.fullMaster.relativePath),
						fileInfo(DEFAULT, planted.fullDefault.relativePath),
					],
				},
			],
			[PDF]: [{ id: 1, files_info: [fileInfo(pdf.defaultQuality, planted.pdfWeb.relativePath)] }],
		});

		// A: master listed but absent
		recMissing = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.missingDefault = plant(image, IMAGE, recMissing, DEFAULT, imageOpts);
		const missingMaster = locationOf(image, IMAGE, recMissing, MASTER, imageOpts);
		await setMedia(recMissing, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.missingDefault.relativePath),
						fileInfo(MASTER, missingMaster.relativePath),
					],
				},
			],
		});

		// outside file (for the traversal + symlink legs)
		const outsideDir = mkdtempSync(join(tmpdir(), 'dedalo_media_zip_outside_'));
		scratchDirs.push(outsideDir);
		outsideFile = join(outsideDir, 'secret.jpg');
		writeFileSync(outsideFile, OUTSIDE_BYTES);

		// A: master file_path climbs out of the media root
		recTraversal = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.travDefault = plant(image, IMAGE, recTraversal, DEFAULT, imageOpts);
		await setMedia(recTraversal, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.travDefault.relativePath),
						fileInfo(MASTER, `/image/${MASTER}/../../../../../../..${outsideFile}`),
					],
				},
			],
		});

		// A: master is a symlink leaving the root
		recSymlink = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.symDefault = plant(image, IMAGE, recSymlink, DEFAULT, imageOpts);
		const symMaster = locationOf(image, IMAGE, recSymlink, MASTER, imageOpts);
		mkdirSync(dirname(symMaster.absolutePath), { recursive: true });
		symlinkSync(outsideFile, symMaster.absolutePath);
		createdFiles.push(symMaster.absolutePath);
		await setMedia(recSymlink, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.symDefault.relativePath),
						fileInfo(MASTER, symMaster.relativePath),
					],
				},
			],
		});

		// A: files renamed outside the grammar (properties.image_id-style)
		recRenamed = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		const renamedDir = dirname(
			locationOf(image, IMAGE, recRenamed, MASTER, imageOpts).absolutePath,
		);
		const renamedDefaultDir = dirname(
			locationOf(image, IMAGE, recRenamed, DEFAULT, imageOpts).absolutePath,
		);
		const renamedMasterRel = `${dirname(locationOf(image, IMAGE, recRenamed, MASTER, imageOpts).relativePath)}/renamed photo ${recRenamed}.jpg`;
		const renamedDefaultRel = `${dirname(locationOf(image, IMAGE, recRenamed, DEFAULT, imageOpts).relativePath)}/renamed photo ${recRenamed}.jpg`;
		mkdirSync(renamedDir, { recursive: true });
		mkdirSync(renamedDefaultDir, { recursive: true });
		planted.renamedMaster = {
			relativePath: renamedMasterRel,
			bytes: `renamed master ${recRenamed}`,
		};
		writeFileSync(join(renamedDir, `renamed photo ${recRenamed}.jpg`), planted.renamedMaster.bytes);
		writeFileSync(join(renamedDefaultDir, `renamed photo ${recRenamed}.jpg`), 'renamed default');
		createdFiles.push(
			join(renamedDir, `renamed photo ${recRenamed}.jpg`),
			join(renamedDefaultDir, `renamed photo ${recRenamed}.jpg`),
		);
		await setMedia(recRenamed, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [fileInfo(DEFAULT, renamedDefaultRel), fileInfo(MASTER, renamedMasterRel)],
				},
			],
		});

		// A: renamed files that FIT the grammar and parse to a wrong address
		recGrammarRenamed = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		const grName = grammarRenamedName(recGrammarRenamed);
		const grMasterAbs = join(
			dirname(locationOf(image, IMAGE, recGrammarRenamed, MASTER, imageOpts).absolutePath),
			grName,
		);
		const grDefaultAbs = join(
			dirname(locationOf(image, IMAGE, recGrammarRenamed, DEFAULT, imageOpts).absolutePath),
			grName,
		);
		planted.grMaster = {
			relativePath: `${dirname(locationOf(image, IMAGE, recGrammarRenamed, MASTER, imageOpts).relativePath)}/${grName}`,
			bytes: `grammar-renamed master ${recGrammarRenamed}`,
		};
		planted.grDefault = {
			relativePath: `${dirname(locationOf(image, IMAGE, recGrammarRenamed, DEFAULT, imageOpts).relativePath)}/${grName}`,
			bytes: `grammar-renamed default ${recGrammarRenamed}`,
		};
		mkdirSync(dirname(grMasterAbs), { recursive: true });
		mkdirSync(dirname(grDefaultAbs), { recursive: true });
		writeFileSync(grMasterAbs, planted.grMaster.bytes);
		writeFileSync(grDefaultAbs, planted.grDefault.bytes);
		createdFiles.push(grMasterAbs, grDefaultAbs);
		await setMedia(recGrammarRenamed, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.grDefault.relativePath),
						fileInfo(MASTER, planted.grMaster.relativePath),
					],
				},
			],
		});

		// A: only the default quality stored
		recNoMaster = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.noMasterDefault = plant(image, IMAGE, recNoMaster, DEFAULT, imageOpts);
		await setMedia(recNoMaster, {
			[IMAGE]: [{ id: 1, files_info: [fileInfo(DEFAULT, planted.noMasterDefault.relativePath)] }],
		});

		// A: master listed but file_exist false (a file planted there anyway: the
		// flag, not the disk, is what says there is no master)
		recNotExist = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.notExistDefault = plant(image, IMAGE, recNotExist, DEFAULT, imageOpts);
		planted.notExistMaster = plant(image, IMAGE, recNotExist, MASTER, imageOpts);
		await setMedia(recNotExist, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.notExistDefault.relativePath),
						fileInfo(MASTER, planted.notExistMaster.relativePath, false),
					],
				},
			],
		});

		// A: master is an external source (a URL, not a file on disk)
		recExternal = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		planted.externalDefault = plant(image, IMAGE, recExternal, DEFAULT, imageOpts);
		await setMedia(recExternal, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.externalDefault.relativePath),
						{
							...fileInfo(MASTER, `https://external.example.test/master_${recExternal}.jpg`),
							external: true,
						},
					],
				},
			],
		});

		// B: outside A's projects
		recOut = await newRecord(SB_USER_B, config.features.defaultProject);
		planted.outDefault = plant(image, IMAGE, recOut, DEFAULT, imageOpts);
		planted.outMaster = plant(image, IMAGE, recOut, MASTER, imageOpts);
		await setMedia(recOut, {
			[IMAGE]: [
				{
					id: 1,
					files_info: [
						fileInfo(DEFAULT, planted.outDefault.relativePath),
						fileInfo(MASTER, planted.outMaster.relativePath),
					],
				},
			],
		});
	});

	afterAll(async () => {
		// planted files first (so the record delete has nothing to move), then the
		// records, then whatever the delete still parked under deleted/
		for (const path of createdFiles) rmSync(path, { force: true });
		// Every record is attempted: one failed delete must not strand the rest.
		const deleteFailures: unknown[] = [];
		for (const id of createdRecords) {
			try {
				await deleteSectionRecord(SECTION, id, -1);
			} catch (error) {
				deleteFailures.push(error);
			}
		}
		// The rows the engine wrote ABOUT these records: the create/delete
		// activity (dd542) and the delete's time-machine snapshot. Swept, then
		// COUNTED — a gate that leaves suite-DB rows behind is red, not quiet.
		const ids = createdRecords.map(String);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id::text = ANY($2::text[])',
			[SECTION, `{${ids.join(',')}}`],
		);
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND misc->'dd551'->0->'value'->>'section_tipo' = $1
			   AND misc->'dd551'->0->'value'->>'section_id' = ANY($2::text[])`,
			[SECTION, `{${ids.join(',')}}`],
		);
		const [left] = (await sql.unsafe(
			`SELECT
			   (SELECT count(*) FROM matrix_test WHERE section_tipo = $1 AND section_id::text = ANY($2::text[]))
			 + (SELECT count(*) FROM matrix_time_machine WHERE section_tipo = $1 AND section_id::text = ANY($2::text[]))
			 + (SELECT count(*) FROM matrix_activity WHERE section_tipo = 'dd542'
			      AND misc->'dd551'->0->'value'->>'section_tipo' = $1
			      AND misc->'dd551'->0->'value'->>'section_id' = ANY($2::text[])) AS n`,
			[SECTION, `{${ids.join(',')}}`],
		)) as { n: number | string }[];
		sweepMediaTraces();
		for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
		await removeScopeBindingFixture();
		expect(deleteFailures).toEqual([]);
		expect(Number(left?.n)).toBe(0);
	});

	/** A standard-format export: a top-level image column, a nested image column, the pdf column. */
	function standardLines(): Line[] {
		const lines: Line[] = [
			{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: SECTION },
			{ t: 'col', i: 0, key: 'id', label: 'Id', cell_type: 'section_id', after: null },
			{
				t: 'col',
				i: 1,
				key: IMAGE,
				label: 'Image',
				cell_type: 'img',
				model: 'component_image',
				path: [{ section_tipo: SECTION, component_tipo: IMAGE }],
				after: 0,
			},
			{
				t: 'col',
				i: 2,
				key: `test80_${IMAGE}`,
				label: 'Linked image',
				cell_type: 'img',
				model: 'component_image',
				path: [
					{ section_tipo: SECTION, component_tipo: 'test80' },
					{ section_tipo: SECTION, component_tipo: IMAGE },
				],
				after: 1,
			},
			{
				t: 'col',
				i: 3,
				key: PDF,
				label: 'Pdf',
				cell_type: 'text',
				model: 'component_pdf',
				path: [{ section_tipo: SECTION, component_tipo: PDF }],
				after: 2,
			},
		];
		const rows: Line[] = [
			{
				rec: recFull,
				c: {
					'0': String(recFull),
					'1': url(planted.fullDefault!.relativePath),
					// the SAME file again via the nested column (+ a crafted + an unparseable candidate)
					'2': [
						`${url(planted.fullDefault!.relativePath)}?v=9`, // same file, other text
						url(`/image/${DEFAULT}/elsewhere/${IMAGE}_${SECTION}_${recFull}.jpg`),
						'https://cdn.example.test/foo.jpg',
						// names a NON-media component (test80, the portal) of A's record
						url(`/image/${DEFAULT}/unrelated/test80_${SECTION}_${recFull}.jpg`),
					].join(' | '),
					'3': url(planted.pdfWeb!.relativePath),
				},
			},
			{ rec: recMissing, c: { '1': url(planted.missingDefault!.relativePath) } },
			{ rec: recTraversal, c: { '1': url(planted.travDefault!.relativePath) } },
			{ rec: recSymlink, c: { '1': `${url(planted.symDefault!.relativePath)}?v=3` } },
			{
				rec: recRenamed,
				c: {
					'1': url(
						`${dirname(locationOf(image, IMAGE, recRenamed, DEFAULT, imageOpts).relativePath)}/renamed photo ${recRenamed}.jpg`,
					),
				},
			},
			{ rec: recGrammarRenamed, c: { '1': url(planted.grDefault!.relativePath) } },
			{ rec: recNoMaster, c: { '1': url(planted.noMasterDefault!.relativePath) } },
			{ rec: recNotExist, c: { '1': url(planted.notExistDefault!.relativePath) } },
			{ rec: recExternal, c: { '1': url(planted.externalDefault!.relativePath) } },
			// B's record reaches A's export through a portal (nested column)
			{ rec: recFull, c: { '2': url(planted.outDefault!.relativePath) } },
		];
		let n = 0;
		for (const row of rows) {
			lines.push({ t: 'row', rec: row.rec, sub: 0, c: row.c });
			n++;
		}
		lines.push({ t: 'end', columns: [0, 1, 2, 3], rows: n, records: n });
		return lines;
	}

	test('A-G. the master archive: authorized files in, every refusal listed with its reason', async () => {
		const store = markedStore();
		const job = await endedJob(store, standardLines());
		const { zip, info, rows } = await build(store, job, {
			mediaQualities: { component_image: MASTER, component_pdf: pdf.defaultQuality },
		});

		const names = zip.entries.map((entry) => entry.name);
		const fullMasterName = planted.fullMaster!.relativePath.split('/').pop()!;
		// A: present master archived STORED, bytes identical, once (referenced twice)
		expect(names.filter((name) => name === fullMasterName)).toHaveLength(1);
		const fullEntry = zip.entries.find((entry) => entry.name === fullMasterName)!;
		expect(fullEntry.method).toBe(0);
		expect(text(fullEntry)).toBe(planted.fullMaster!.bytes);
		// G: renamed file addressed by the row (top-level column)
		const renamedEntry = zip.entries.find(
			(entry) => entry.name === `renamed photo ${recRenamed}.jpg`,
		);
		expect(renamedEntry && text(renamedEntry)).toBe(planted.renamedMaster!.bytes);
		// G: a renamed name that FITS the grammar ('inv' is no component) → the row
		const grEntry = zip.entries.find(
			(entry) => entry.name === grammarRenamedName(recGrammarRenamed),
		);
		expect(grEntry && text(grEntry)).toBe(planted.grMaster!.bytes);
		// info.txt last; exactly the three authorized files + info
		expect(names[names.length - 1]).toBe(MEDIA_ZIP_INFO_NAME);
		const archived = [
			fullMasterName,
			`renamed photo ${recRenamed}.jpg`,
			grammarRenamedName(recGrammarRenamed),
		];
		expect(names.sort()).toEqual([...archived, MEDIA_ZIP_INFO_NAME].sort());
		expect(rows).toBe(3);
		// nothing from outside the root, nothing of B's, no pdf
		for (const entry of zip.entries) {
			expect(text(entry)).not.toContain(OUTSIDE_BYTES);
			expect(text(entry)).not.toBe(planted.outMaster!.bytes);
			// a master whose record says file_exist false is not archived
			expect(text(entry)).not.toBe(planted.notExistMaster!.bytes);
		}

		const { downloaded, failed } = parseInfo(info);
		expect(downloaded.sort()).toEqual([...archived].sort());
		const reasonOf = (needle: string): string[] =>
			failed.filter((item) => item.file.includes(needle)).map((item) => item.reason);
		// B: missing master
		expect(reasonOf(locationOf(image, IMAGE, recMissing, MASTER, imageOpts).relativePath)).toEqual([
			'missing_file',
		]);
		// C: B's record, outside A's projects
		expect(reasonOf(planted.outDefault!.relativePath)).toEqual(['not_authorized']);
		// D: the pdf component A holds no grant on
		expect(reasonOf(planted.pdfWeb!.relativePath)).toEqual(['not_authorized']);
		// E: traversal + symlink
		expect(reasonOf(outsideFile)).toEqual(['invalid_path']);
		expect(reasonOf(locationOf(image, IMAGE, recSymlink, MASTER, imageOpts).relativePath)).toEqual([
			'invalid_path',
		]);
		// F: crafted name of A's record / unparseable name in a nested column
		expect(reasonOf('/elsewhere/')).toEqual(['not_in_record']);
		expect(reasonOf('cdn.example.test/foo.jpg')).toEqual(['unidentified']);
		// K: non-media component / no master / file_exist false / external master
		expect(reasonOf(`test80_${SECTION}_${recFull}.jpg`)).toEqual(['not_media']);
		expect(reasonOf(planted.noMasterDefault!.relativePath)).toEqual(['quality_unavailable']);
		expect(reasonOf(planted.notExistDefault!.relativePath)).toEqual(['quality_unavailable']);
		expect(reasonOf(planted.externalDefault!.relativePath)).toEqual(['external']);
		expect(failed).toHaveLength(11);
		expect(info).toContain(`component_image: ${MASTER}`);
	});

	test('P. a legacy file name no ZIP entry can carry is listed invalid_path — one odd name never aborts the archive', async () => {
		// properties.image_id renames may hold ANY name; a drive-like prefix is one
		// the zip writer refuses (normalizeZipEntryName). Its good twin sits in the
		// same record, same folder.
		const rec = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
		const dirOf = (quality: string) => ({
			rel: dirname(locationOf(image, IMAGE, rec, quality, imageOpts).relativePath),
			abs: dirname(locationOf(image, IMAGE, rec, quality, imageOpts).absolutePath),
		});
		const odd = `D:scan ${rec}.jpg`;
		const good = `legacy scan ${rec}.jpg`;
		const items = [];
		for (const [n, name] of [odd, good].entries()) {
			for (const quality of [DEFAULT, MASTER]) {
				const dir = dirOf(quality);
				mkdirSync(dir.abs, { recursive: true });
				writeFileSync(join(dir.abs, name), `${quality} ${name}`);
				createdFiles.push(join(dir.abs, name));
			}
			items.push({
				id: n + 1,
				files_info: [
					fileInfo(DEFAULT, `${dirOf(DEFAULT).rel}/${name}`),
					fileInfo(MASTER, `${dirOf(MASTER).rel}/${name}`),
				],
			});
		}
		await setMedia(rec, { [IMAGE]: items });
		const lines = standardLines().filter((line) => line.t !== 'row' && line.t !== 'end');
		lines.push({
			t: 'row',
			rec,
			sub: 0,
			c: { '1': [odd, good].map((name) => url(`${dirOf(DEFAULT).rel}/${name}`)).join(' | ') },
		});
		lines.push({ t: 'end', columns: [0, 1, 2, 3], rows: 1, records: 1 });
		const store = markedStore();
		const job = await endedJob(store, lines);
		const { zip, info, rows } = await build(store, job, { mediaQuality: MASTER });
		expect(zip.entries.map((entry) => entry.name).sort()).toEqual(
			[good, MEDIA_ZIP_INFO_NAME].sort(),
		);
		expect(rows).toBe(1);
		const { failed } = parseInfo(info);
		expect(failed).toEqual([{ file: `${dirOf(MASTER).rel}/${odd}`, reason: 'invalid_path' }]);
	});

	test('O. a stored file_path names only the record own file: forged paths inside the root are refused', async () => {
		const root = config.media.rootPath as string;
		const tag = `mz_forge_${process.pid}_${Date.now()}`;
		// Files the web server denies to EVERYONE, logged in or not.
		const importDir = join(root, 'import', 'files', String(SB_USER_B));
		const pubDir = join(root, '.publication', 'pub');
		const madeDirs: string[] = [];
		for (const dir of [
			join(root, 'import'),
			join(root, 'import', 'files'),
			importDir,
			join(root, '.publication'),
			pubDir,
		]) {
			if (!existsSync(dir)) {
				mkdirSync(dir);
				madeDirs.push(dir);
			}
		}
		const importCsv = join(importDir, `${tag}.csv`);
		const pubMarker = join(pubDir, `${tag}_marker`);
		const IMPORT_BYTES = `SECRET IMPORT CSV ${tag}`;
		const PUB_BYTES = `SECRET PUBLICATION MARKER ${tag}`;
		writeFileSync(importCsv, IMPORT_BYTES);
		writeFileSync(pubMarker, PUB_BYTES);
		const forgedFiles = [importCsv, pubMarker];
		try {
			const forged: { id: number; master: string }[] = [];
			const forge = async (master: (id: number) => string): Promise<void> => {
				const id = await newRecord(SB_USER_A, SB_PROJECT_OF_A);
				const def = plant(image, IMAGE, id, DEFAULT, imageOpts);
				planted[`forged_${id}`] = def;
				const path = master(id);
				forged.push({ id, master: path });
				await setMedia(id, {
					[IMAGE]: [
						{ id: 1, files_info: [fileInfo(DEFAULT, def.relativePath), fileInfo(MASTER, path)] },
					],
				});
			};
			await forge(() => `/import/files/${SB_USER_B}/${tag}.csv`);
			await forge(() => `/.publication/pub/${tag}_marker`);
			// B's master: same model, same bucket — another record's canonical file
			await forge(() => planted.outMaster!.relativePath);
			// a denied working-file suffix in A's OWN master folder, named after A's own record
			const DENIED_BYTES = `SECRET WORKING FILE ${tag}`;
			await forge((id) => {
				const own = locationOf(image, IMAGE, id, MASTER, imageOpts);
				const csv = own.absolutePath.replace(/\.jpg$/, '.csv');
				mkdirSync(dirname(csv), { recursive: true });
				writeFileSync(csv, DENIED_BYTES);
				forgedFiles.push(csv);
				return own.relativePath.replace(/\.jpg$/, '.csv');
			});

			// A's OWN canonical master, a symlink to the import CSV — still inside the root
			await forge((id) => {
				const own = locationOf(image, IMAGE, id, MASTER, imageOpts);
				mkdirSync(dirname(own.absolutePath), { recursive: true });
				symlinkSync(importCsv, own.absolutePath);
				forgedFiles.push(own.absolutePath);
				return own.relativePath;
			});

			const lines: Line[] = [
				{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: SECTION },
				{
					t: 'col',
					i: 0,
					key: IMAGE,
					label: 'Image',
					cell_type: 'img',
					model: 'component_image',
					path: [{ section_tipo: SECTION, component_tipo: IMAGE }],
					after: null,
				},
			];
			for (const { id } of forged) {
				lines.push({
					t: 'row',
					rec: id,
					sub: 0,
					c: { '0': url(planted[`forged_${id}`]!.relativePath) },
				});
			}
			lines.push({ t: 'end', columns: [0], rows: forged.length, records: forged.length });
			const store = markedStore();
			const job = await endedJob(store, lines);
			const { zip, info, rows } = await build(store, job, {
				mediaQualities: { component_image: MASTER },
			});

			expect(rows).toBe(0);
			expect(zip.entries.map((entry) => entry.name)).toEqual([MEDIA_ZIP_INFO_NAME]);
			for (const entry of zip.entries) {
				for (const secret of [IMPORT_BYTES, PUB_BYTES, DENIED_BYTES, planted.outMaster!.bytes]) {
					expect(text(entry)).not.toContain(secret);
				}
			}
			const { failed } = parseInfo(info);
			expect(failed).toEqual(
				forged.map(({ master }) => ({ file: master, reason: 'invalid_path' })),
			);
		} finally {
			for (const file of forgedFiles) rmSync(file, { force: true });
			for (const dir of madeDirs.reverse()) removeEmptyDir(dir);
		}
	});

	test('the default quality archives the default files of the same records', async () => {
		const store = markedStore();
		const job = await endedJob(store, standardLines());
		const { zip, info } = await build(store, job, {});
		const byName = new Map(zip.entries.map((entry) => [entry.name, text(entry)]));
		// eight A default files (full, missing-master's, traversal's, symlink's,
		// no-master's, not-exist's, external's, grammar-renamed) + renamed + info
		expect(byName.get(planted.fullDefault!.relativePath.split('/').pop()!)).toBe(
			planted.fullDefault!.bytes,
		);
		expect(byName.get(planted.symDefault!.relativePath.split('/').pop()!)).toBe(
			planted.symDefault!.bytes,
		);
		expect(byName.get(grammarRenamedName(recGrammarRenamed))).toBe(planted.grDefault!.bytes);
		expect(zip.entries).toHaveLength(10);
		const { failed } = parseInfo(info);
		expect(failed.map((item) => item.reason).sort()).toEqual(
			['not_authorized', 'not_authorized', 'not_in_record', 'unidentified', 'not_media'].sort(),
		);
	});

	test('G2. the row fallback follows the SELECTION, not the read set: a portal column into another section keeps it', async () => {
		// A top-level image column + a portal column whose path steps into ANOTHER
		// section: the export READS two sections, its rows are still one section's.
		const OTHER = 'test2';
		const renamedRow = (): Line[] => [
			{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: SECTION },
			{
				t: 'col',
				i: 0,
				key: IMAGE,
				label: 'Image',
				cell_type: 'img',
				model: 'component_image',
				path: [{ section_tipo: SECTION, component_tipo: IMAGE }],
				after: null,
			},
			{
				t: 'row',
				rec: recRenamed,
				sub: 0,
				c: {
					'0': url(
						`${dirname(locationOf(image, IMAGE, recRenamed, DEFAULT, imageOpts).relativePath)}/renamed photo ${recRenamed}.jpg`,
					),
				},
			},
			{ t: 'end', columns: [0], rows: 1, records: 1 },
		];
		const portalColumn = {
			path: [
				{ section_tipo: SECTION, component_tipo: 'test80' },
				{ section_tipo: OTHER, component_tipo: 'test52' },
			],
		};
		const oneSectionSelection = {
			sqo: { section_tipo: [SECTION] },
			ar_ddo_to_export: [
				{ path: [{ section_tipo: SECTION, component_tipo: IMAGE }] },
				portalColumn,
			],
		};
		const store = markedStore();
		const job = await endedJob(store, renamedRow(), 'standard', { options: oneSectionSelection });
		// non-vacuous: the READ set really is two sections
		expect((await store.readManifest(job)).sections.sort()).toEqual([SECTION, OTHER].sort());
		const { zip, info } = await build(store, job, { mediaQualities: { component_image: MASTER } });
		const renamed = zip.entries.find((entry) => entry.name === `renamed photo ${recRenamed}.jpg`);
		expect(renamed && text(renamed)).toBe(planted.renamedMaster!.bytes);
		expect(parseInfo(info).failed).toEqual([]);

		// Control: a selection of TWO sections makes `rec` ambiguous — no fallback.
		const twoSections = markedStore();
		const ambiguous = await endedJob(twoSections, renamedRow(), 'standard', {
			options: { ...oneSectionSelection, sqo: { section_tipo: [SECTION, OTHER] } },
		});
		const refused = await build(twoSections, ambiguous, {
			mediaQualities: { component_image: MASTER },
		});
		expect(refused.zip.entries.map((entry) => entry.name)).toEqual([MEDIA_ZIP_INFO_NAME]);
		expect(parseInfo(refused.info).failed.map((item) => item.reason)).toEqual(['unidentified']);
	});

	test('H. dedalo_raw cells resolve through the record, not the cell', async () => {
		const store = markedStore();
		const raw = (items: unknown[]) => JSON.stringify({ dedalo_data: items });
		const lines: Line[] = [
			{ t: 'meta', v: 1, data_format: 'dedalo_raw', section_tipo: SECTION },
			{
				t: 'col',
				i: 0,
				key: IMAGE,
				label: 'Image',
				cell_type: 'json',
				model: 'component_image',
				path: [{ section_tipo: SECTION, component_tipo: IMAGE }],
				after: null,
			},
			{
				t: 'row',
				rec: recFull,
				sub: 0,
				c: {
					'0': raw([
						// the cell names only the DEFAULT file; the master is re-read from the record
						{ files_info: [fileInfo(DEFAULT, planted.fullDefault!.relativePath)] },
					]),
				},
			},
			{
				t: 'row',
				rec: recOut,
				sub: 0,
				c: { '0': raw([{ files_info: [fileInfo(DEFAULT, planted.outDefault!.relativePath)] }]) },
			},
			{ t: 'row', rec: recMissing, sub: 0, c: { '0': '{not json' } },
			{ t: 'end', columns: [0], rows: 3, records: 3 },
		];
		const job = await endedJob(store, lines, 'dedalo_raw');
		const { zip, info } = await build(store, job, { mediaQuality: MASTER });
		const fullMasterName = planted.fullMaster!.relativePath.split('/').pop()!;
		expect(zip.entries.map((entry) => entry.name)).toEqual([fullMasterName, MEDIA_ZIP_INFO_NAME]);
		expect(text(zip.entries[0]!)).toBe(planted.fullMaster!.bytes);
		const { failed } = parseInfo(info);
		expect(failed.map((item) => item.reason).sort()).toEqual(['not_authorized', 'unreadable_cell']);
	});

	test('I. quality validation refuses before anything is written; the variant is a legal, distinct slug', async () => {
		const store = markedStore();
		const job = await endedJob(store, standardLines());
		await expectCode(
			build(store, job, { mediaQualities: { component_image: 'bogus' } }),
			'media.invalid_quality',
		);
		expectNoArtifact(job);
		await expectCode(
			build(store, job, { mediaQualities: { component_image: '../original' } }),
			'media.invalid_quality',
		);
		await expectCode(
			build(store, job, { mediaQualities: { component_input_text: DEFAULT } }),
			'request.invalid_options',
		);
		// one quality for every model must be valid for every model present
		await expectCode(build(store, job, { mediaQuality: DEFAULT }), 'media.invalid_quality');
		expectNoArtifact(job);

		const variants = [
			mediaZipVariant({ mediaQuality: '1.5MB' }),
			mediaZipVariant({ mediaQuality: '<1MB' }),
			mediaZipVariant({ mediaQuality: '15MB' }),
			mediaZipVariant({ mediaQualities: { component_image: '1.5MB' } }),
			mediaZipVariant({}),
		];
		for (const variant of variants) expect(variant).toMatch(/^[a-z0-9]{1,32}$/);
		expect(new Set(variants).size).toBe(variants.length);
		expect(mediaZipVariant({ mediaQualities: { component_av: 'x', component_image: 'y' } })).toBe(
			mediaZipVariant({ mediaQualities: { component_image: 'y', component_av: 'x' } }),
		);
	});

	test('L. the ACTION carries a per-model choice: a mixed image+pdf export builds at the master', async () => {
		// Through runBuildExportFile — the build_export_file action's body — not
		// the writer seam: the options the client sends (media_qualities) must
		// reach the writer, and the file name must hash the whole choice.
		const store = markedStore();
		const job = await endedJob(store, standardLines());
		const principal = await resolvePrincipal(SB_USER_A);
		const run = (extra: Record<string, unknown>) =>
			runBuildExportFile({
				store,
				principal,
				userId: SB_USER_A,
				options: {
					section_tipo: SECTION,
					job_id: job.jobId,
					format: 'media_zip',
					origin: 'https://example.test',
					...extra,
				},
				signal: new AbortController().signal,
			});
		const choice = { component_image: MASTER, component_pdf: pdf.defaultQuality };
		const result = await run({ media_qualities: choice });
		expect(result.basename).toBe(`media_${mediaZipVariant({ mediaQualities: choice })}.zip`);
		expect(result.url).toContain(`/${job.jobId}/${result.basename}`);
		const zip = readZip(new Uint8Array(readFileSync(join(job.dir, result.basename))));
		const fullMasterName = planted.fullMaster!.relativePath.split('/').pop()!;
		expect(zip.entries.map((entry) => entry.name)).toContain(fullMasterName);
		expect(result.rows).toBe(3);
		// the single shorthand cannot serve both models (the pdf ladder has no image default)
		await expectCode(run({ media_quality: DEFAULT }), 'media.invalid_quality');
		// a malformed choice is refused before anything is written
		await expectCode(run({ media_qualities: ['original'] }), 'request.invalid_options');
		// no choice: the defaults' archive, the plain name
		expect((await run({})).basename).toBe('media.zip');
	});

	test('J. ZIP64 (injected limits) reads back identically; cancel leaves nothing', async () => {
		const store = markedStore();
		const job = await endedJob(store, standardLines());
		const { zip } = await build(store, job, {
			mediaQualities: { component_image: MASTER, component_pdf: pdf.defaultQuality },
			zip64Limits: { size: 8, count: 2 },
		});
		expect(zip.zip64End).toBe(true);
		const fullMasterName = planted.fullMaster!.relativePath.split('/').pop()!;
		const entry = zip.entries.find((item) => item.name === fullMasterName)!;
		expect(entry.centralZip64 || entry.localZip64).toBe(true);
		expect(text(entry)).toBe(planted.fullMaster!.bytes);

		const cancelled = markedStore();
		const cancelJob = await endedJob(cancelled, standardLines());
		// a signal that turns aborted MID-WRITE (after the writer has started reading)
		let reads = 0;
		const midWrite = {
			get aborted() {
				reads++;
				return reads > 4;
			},
		} as unknown as AbortSignal;
		await expectCode(
			build(
				cancelled,
				cancelJob,
				{ mediaQualities: { component_image: MASTER, component_pdf: pdf.defaultQuality } },
				midWrite,
			),
			'export.cancelled',
		);
		expect(reads).toBeGreaterThan(4);
		expectNoArtifact(cancelJob);
	});

	test('K. Stop is honoured INSIDE one large file, not only between files', async () => {
		// A master can be tens of GB and export_file lane jobs have no default
		// deadline: a Stop that waits for the file to finish keeps the lane slot
		// and fills the temp file against the quota. The signal turns aborted once
		// the archive under construction is past ABORT_AT bytes — i.e. mid-file —
		// and the build must stop there, far short of the file's size.
		const BIG = 48 * 1024 * 1024;
		const ABORT_AT = 2 * 1024 * 1024;
		const masterPath = locationOf(image, IMAGE, recFull, MASTER, imageOpts).absolutePath;
		const original = readFileSync(masterPath);
		writeFileSync(masterPath, new Uint8Array(BIG).fill(0x61));
		try {
			const store = markedStore();
			const job = await endedJob(store, standardLines());
			const spoolFiles = new Set(readdirSync(job.dir));
			let archiveBytesAtAbort = -1;
			const archiveBytes = (): number =>
				readdirSync(job.dir)
					.filter((name) => !spoolFiles.has(name))
					.reduce((sum, name) => {
						try {
							return sum + statSync(join(job.dir, name)).size;
						} catch {
							return sum; // committed/unlinked between readdir and stat
						}
					}, 0);
			const midFile = {
				get aborted() {
					if (archiveBytesAtAbort >= 0) return true;
					const bytes = archiveBytes();
					if (bytes < ABORT_AT) return false;
					archiveBytesAtAbort = bytes;
					return true;
				},
			} as unknown as AbortSignal;
			await expectCode(
				build(
					store,
					job,
					{ mediaQualities: { component_image: MASTER, component_pdf: pdf.defaultQuality } },
					midFile,
				),
				'export.cancelled',
			);
			expect(archiveBytesAtAbort).toBeGreaterThanOrEqual(ABORT_AT);
			// stopped within a few chunks of the trigger, not after the whole file
			expect(archiveBytesAtAbort).toBeLessThan(BIG / 2);
			expectNoArtifact(job);
		} finally {
			writeFileSync(masterPath, original);
		}
	});

	test('M. refused candidates never stay in memory: info.txt lists all of them, byte-exact, streamed from disk', async () => {
		const store = markedStore();
		// One media column with NO path (no row fallback) and names outside the
		// grammar: every candidate is refused 'unidentified' without a DB read.
		const REFUSED = 60_000;
		const lines: Line[] = [
			{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: SECTION },
			{ t: 'col', i: 0, key: 'id', label: 'Id', cell_type: 'section_id', after: null },
			{
				t: 'col',
				i: 1,
				key: 'img',
				label: 'Image',
				cell_type: 'img',
				model: 'component_image',
				after: 0,
			},
		];
		const candidate = (k: number): string => `/nowhere/refused-${k}-${'ñ"\\'.repeat(40)}.jpg`;
		for (let k = 1; k <= REFUSED; k++) {
			lines.push({ t: 'row', rec: k, sub: 0, c: { '0': String(k), '1': candidate(k) } });
		}
		lines.push({ t: 'end', columns: [0, 1], rows: REFUSED, records: REFUSED });
		const job = await endedJob(store, lines);
		const manifest = await store.readManifest(job);

		// The archive goes to a file (nothing of it held here), and the heap is
		// sampled at every write — the last writes are info.txt's, when a list
		// held in memory would be whole.
		const archivePath = join(job.dir, 'probe_media_zip.bin');
		Bun.gc(true);
		const baseline = process.memoryUsage().heapUsed;
		// The FIRST write (info.txt's local header, right after the rows walk) is
		// not sampled: the walk's last spool chunk can still be conservatively
		// reachable at that instant (measured: one 12 MB sample, gone at the next
		// write). Every write while info.txt streams IS sampled — a list held in
		// memory is whole through all of them.
		let peak = 0;
		let writes = 0;
		const sink = {
			bytes: 0,
			// scratch metering is test N's subject; here the heap is
			async admitScratch() {},
			async write(chunk: string | Uint8Array) {
				appendFileSync(archivePath, chunk);
				this.bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
				if (writes++ === 0) return;
				Bun.gc(true);
				peak = Math.max(peak, process.memoryUsage().heapUsed - baseline);
			},
		};
		const result = await mediaZipWriter(
			{
				spool: openSpoolReader(job.dir, { indexEvery: 4 }),
				manifest,
				options: { origin: '', showTipoInLabel: false },
			},
			sink,
			new AbortController().signal,
		);
		expect(result.rows).toBe(0);
		// 60,000 refusals of ~150 characters held in memory are tens of MB
		// (measured 25-47 MB for the in-memory list / an unbounded memo); on disk
		// the writer's heap stays within a few MB of where it started.
		expect(writes).toBeGreaterThan(3);
		expect(peak).toBeLessThan(8 * 1024 * 1024);

		const archive = new Uint8Array(readFileSync(archivePath));
		rmSync(archivePath);
		const info = zipText(readZip(archive), MEDIA_ZIP_INFO_NAME);
		const expected = Array.from({ length: REFUSED }, (_, k) => ({
			file: candidate(k + 1),
			reason: 'unidentified',
		}));
		// byte-exact: the streamed list IS JSON.stringify(failures, null, 2)
		expect(info).toBe(
			`Qualities: component_image: ${mediaTypeOf('component_image')?.defaultQuality}\n` +
				'Downloaded files: []\n' +
				`Failed files: ${JSON.stringify(expected, null, 2)}\n`,
		);
		// and the unlinked failure log left nothing in the job directory
		expect(readdirSync(job.dir).filter((name) => name.includes('media_zip_failures'))).toEqual([]);
	});

	test('N. the unlinked failure log is METERED: past the owner quota the build stops mid-walk, not after the whole log landed on disk', async () => {
		// The same refusal-only shape as M (no row fallback, names outside the
		// grammar): nothing is ever archived, so no archive byte runs the sink's
		// meter while the log grows. The log has no name, so the store's
		// directory measure never sees it. Unmetered, the walk ran to its end and
		// the quota fired only when info.txt copied the log back through the sink.
		const creating = markedStore();
		const REFUSED = 20_000;
		const lines: Line[] = [
			{ t: 'meta', v: 1, data_format: 'standard', breakdown: 'rows', section_tipo: SECTION },
			{ t: 'col', i: 0, key: 'id', label: 'Id', cell_type: 'section_id', after: null },
			{
				t: 'col',
				i: 1,
				key: 'img',
				label: 'Image',
				cell_type: 'img',
				model: 'component_image',
				after: 0,
			},
		];
		for (let k = 1; k <= REFUSED; k++) {
			const name = `/nowhere/refused-${k}-${'x'.repeat(200)}.jpg`;
			lines.push({ t: 'row', rec: k, sub: 0, c: { '0': String(k), '1': name } });
		}
		lines.push({ t: 'end', columns: [0, 1], rows: REFUSED, records: REFUSED });
		const job = await endedJob(creating, lines);
		const manifest = await creating.readManifest(job);
		// The log for 20,000 refusals is ~5 MB; the quota leaves the build 512 KiB
		// over what the export already holds (its spool), so ~1/10 of the walk fits.
		const held = await creating.usedBytes(SB_USER_A);
		const budget = 512 * 1024;
		const metered = openArtifactStore({
			root: job.root,
			quotaBytes: held + budget,
			ttlHours: 24,
		});
		const file = metered.allocateFile(job, 'media_zip');
		const opened = await metered.openFileSink(job, file);
		const reader = openSpoolReader(job.dir, { indexEvery: 4 });
		let walked = 0;
		const counting = Object.create(reader) as typeof reader;
		counting.rows = async function* (options) {
			for await (const row of reader.rows(options)) {
				walked++;
				yield row;
			}
		};
		try {
			await expectCode(
				mediaZipWriter(
					{ spool: counting, manifest, options: { origin: '', showTipoInLabel: false } },
					opened.sink,
					new AbortController().signal,
				),
				'export.artifact_quota',
			);
		} finally {
			await opened.abort();
		}
		// stopped while the log grew — never at the info.txt copy after the end
		expect(walked).toBeGreaterThan(0);
		expect(walked).toBeLessThan(REFUSED / 2);
	});
});

test('isArchivableEntryName: a name the zip writer would refuse, or read as folders, is not archivable', () => {
	expect(isArchivableEntryName('photo 1.jpg')).toBe(true);
	expect(isArchivableEntryName('test99_test3_1.jpg')).toBe(true);
	for (const bad of [
		'',
		'.',
		'..',
		'D:scan.jpg',
		'scan\\01.jpg',
		'scan\\\\01.jpg',
		'a/b.jpg',
		'nul\0.jpg',
	]) {
		expect(isArchivableEntryName(bad), JSON.stringify(bad)).toBe(false);
	}
});

test('the file-name grammar addresses the record (component, section, id) and refuses the rest', () => {
	expect(parseMediaFileName('test99_test3_12.jpg')).toEqual({
		componentTipo: 'test99',
		sectionTipo: 'test3',
		sectionId: 12,
	});
	expect(parseMediaFileName('test3205_test3203_7_lg-spa.pdf')).toEqual({
		componentTipo: 'test3205',
		sectionTipo: 'test3203',
		sectionId: 7,
	});
	expect(parseMediaFileName('renamed photo 3.jpg')).toBeNull();
	expect(parseMediaFileName('test99_test3_0.jpg')).toBeNull();
	expect(parseMediaFileName('../test99_test3_1.jpg')).toBeNull();
});
