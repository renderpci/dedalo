/**
 * DUPLICATE WITH MEDIA — an observable VERDICT, and a clone that never
 * indexes the source's files (CLOSURE_PLAN Step 2: CORE-5).
 *
 * The finding (audit 2026-09-26): `duplicateSectionRecord` inserted the clone
 * with the SOURCE's `files_info` (source-id `file_path`s), then copied the
 * files and refreshed the index inside a `try { … } catch {}` that swallowed
 * every failure. A copy that failed (a planted directory, a refused bucket, a
 * source file the index claims but the disk lacks) left the clone indexing
 * ANOTHER record's files — the delete of either record then moves files the
 * other still names — and nothing anywhere said so. Media path options were
 * also resolved SECTION-scoped, so a component with `properties.additional_path`
 * (a per-record bucket) copied from and to the numeric bucket instead.
 *
 * WHAT IS ASSERTED (outcomes on the lane suite DB + the lane's marked media
 * root, through the STABLE door `duplicateSectionRecord`):
 *   A  happy path: every stored and history `file_path` of the clone names the
 *      clone; none names the source; no verdict.
 *   B  a refused bucket (`additional_path` value '../../x'): the duplicate still
 *      returns an id; the incompleteness is COUNTED (`duplicate_media_incomplete`)
 *      and LOGGED (`media.operation_failed`); no source-id path is stored.
 *   C  a copy failure (a directory planted at the clone's target file): same.
 *   D  the source index claims a file the disk lacks: copied < claimed → verdict.
 *   E  an `additional_path` component: the clone's files land in the RECORD's
 *      bucket (record-scoped resolution); no verdict.
 *   F  the verdict door exists and reports per component (scratch media root),
 *      each verdict naming the clone record it belongs to.
 *   B/C/D through the verdict door: B and C stop at the `copy` stage with the
 *      walk's / copy's report in the log; D (nothing failed, fewer copied) is the
 *      `count` stage — the three are told apart, not only counted.
 *   G  NO media root (`mediaRoot: null`, the injectable twin of an unset
 *      configured root): a claiming source is a `no_media_root` verdict with an
 *      empty clone index; a source claiming nothing is no verdict.
 *   H  a re-minted dataframe FRAME TARGET's verdict names its own record, never
 *      the host clone's (the recursion shares one verdict list).
 *
 * SITUATION: a `zzdm` scratch section (→ matrix_test) with its OWN counter (the
 * clone's id is therefore known before the duplicate — case C plants at it), a
 * plain component_image, and a bucketed component_image whose
 * `additional_path` names a sibling input_text. Records are created at
 * runtime; files are swept by identifier prefix; the situation drop asserts
 * zero residue. assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { getCounters } from '../../src/core/api/counters.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { scanFilesInfo } from '../../src/core/media/files_info.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import {
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
} from '../../src/core/media/path.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	duplicateSectionRecord,
	duplicateSectionRecordWithVerdict,
	type MediaCopyVerdict,
} from '../../src/core/section/record/duplicate_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { sweepSeededMediaEntries } from '../helpers/media_seed_sweep.ts';

const SECTION = 'zzdm1';
/** A plain component_image (numeric bucket). */
const PLAIN = 'zzdm2';
/** The bucket VALUE component (input_text) the bucketed image names. */
const BUCKET_TEXT = 'zzdm3';
/** A component_image whose `additional_path` is BUCKET_TEXT's value on the record. */
const BUCKETED = 'zzdm4';
/**
 * Case H: a FRAME TARGET section with its own media component. A dd490 frame
 * entry on a SECTION record (under FRAME_SLOT) names a FRAME_SECTION record, so
 * the duplicate re-mints it — through the same door, into the same verdict list.
 */
const FRAME_SECTION = 'zzdm5';
const FRAME_IMAGE = 'zzdm6';
const FRAME_SLOT = 'zzdm7';
const TABLE = 'matrix_test';
const USER_ID = -1;

const SITUATION = situation({
	tld: 'zzdm',
	name: 'duplicate media verdict',
	nodes: [
		{ tipo: SECTION, model: 'section', parent: 'dd14' },
		{ tipo: PLAIN, model: 'component_image', parent: SECTION },
		{ tipo: BUCKET_TEXT, model: 'component_input_text', parent: SECTION },
		{
			tipo: BUCKETED,
			model: 'component_image',
			parent: SECTION,
			properties: { additional_path: BUCKET_TEXT },
		},
		{ tipo: FRAME_SLOT, model: 'component_dataframe', parent: SECTION },
		{ tipo: FRAME_SECTION, model: 'section', parent: 'dd14' },
		{ tipo: FRAME_IMAGE, model: 'component_image', parent: FRAME_SECTION },
	],
});

const image = mediaTypeOf('component_image')!;
/** A tier the repair never rebuilds (not default/original/master/thumb). */
const QUALITY = image.qualities.find(
	(quality) =>
		quality !== image.defaultQuality &&
		quality !== image.originalQuality &&
		!image.masterQualities.includes(quality) &&
		quality !== config.media.thumb.quality,
) as string;
const EXT = image.defaultExtension;

const identity = (tipo: string, sectionId: number): MediaIdentity => ({
	componentTipo: tipo,
	sectionTipo: SECTION,
	sectionId,
	lang: null,
});

const scratchRoots: string[] = [];

async function optsFor(tipo: string, sectionId: number): Promise<MediaPathOptions> {
	return resolveMediaPathOptions(tipo, SECTION, sectionId);
}

function fileAt(tipo: string, sectionId: number, opts: MediaPathOptions): string {
	return buildMediaLocation(image, identity(tipo, sectionId), QUALITY, EXT, opts).absolutePath;
}

function seed(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `duplicate_record_media_verdict ${path}`);
}

async function setBucket(sectionId: number, value: string): Promise<void> {
	const result = await saveComponentData({
		componentTipo: BUCKET_TEXT,
		sectionTipo: SECTION,
		sectionId,
		lang: 'lg-nolan',
		userId: USER_ID,
		changedData: [{ action: 'set_data', id: null, value: [{ value }] }] as never,
	});
	expect(result.ok, result.message).toBe(true);
}

async function setMedia(
	sectionId: number,
	tipo: string,
	filesInfo: unknown[],
	sectionTipo: string = SECTION,
): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET media = COALESCE(media, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId, tipo, JSON.stringify([{ id: 1, files_info: filesInfo }])],
	);
}

/** An index entry claiming one existing file the disk does NOT hold (copied < claimed). */
function phantomClaim(tipo: string, sectionTipo: string, sectionId: number) {
	return {
		quality: QUALITY,
		extension: EXT,
		file_exist: true,
		file_name: `${tipo}_${sectionTipo}_${sectionId}.${EXT}`,
		file_path: `/${image.typeFolder}/${QUALITY}/${tipo}_${sectionTipo}_${sectionId}.${EXT}`,
	};
}

/**
 * Run `work` with every console line captured (the error log's line AND the
 * error it carries — the copy report rides the latter's message).
 */
async function capturingLog<T>(work: () => Promise<T>): Promise<{ result: T; log: string }> {
	const lines: string[] = [];
	const record = (...args: unknown[]): void => {
		lines.push(
			args.map((arg) => (arg instanceof Error ? `${arg.message}` : String(arg))).join(' '),
		);
	};
	const spies = [
		spyOn(console, 'error').mockImplementation(record),
		spyOn(console, 'warn').mockImplementation(record),
	];
	try {
		return { result: await work(), log: lines.join('\n') };
	} finally {
		for (const spy of spies) spy.mockRestore();
	}
}

/** The one verdict of `tipo` in a duplicate's answer. */
function verdictOf(media: readonly MediaCopyVerdict[], tipo: string): MediaCopyVerdict {
	const found = media.filter((verdict) => verdict.tipo === tipo);
	expect(found, `expected exactly one verdict for ${tipo}`).toHaveLength(1);
	return found[0] as MediaCopyVerdict;
}

async function storedFilesInfo(
	sectionId: number,
	tipo: string,
): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		`SELECT media->$3 AS items FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, tipo],
	)) as { items: { files_info?: Record<string, unknown>[] }[] | null }[];
	return (rows[0]?.items ?? []).flatMap((item) => item.files_info ?? []);
}

/** The clone's history rows of one component, as text. */
async function historyText(sectionId: number, tipo: string): Promise<string> {
	const rows = (await sql.unsafe(
		`SELECT data::text AS t FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3`,
		[SECTION, sectionId, tipo],
	)) as { t: string | null }[];
	return rows.map((row) => row.t ?? '').join('\n');
}

/** The files_info of the NEWEST history row of one component (the state it records last). */
async function latestHistoryFilesInfo(
	sectionId: number,
	tipo: string,
): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		`SELECT data FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id DESC LIMIT 1`,
		[SECTION, sectionId, tipo],
	)) as { data: { files_info?: Record<string, unknown>[] }[] | null }[];
	return (rows[0]?.data ?? []).flatMap((item) => item.files_info ?? []);
}

/** The id the section's counter will mint next (the section owns its counter). */
async function nextId(): Promise<number> {
	const rows = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
		SECTION,
	])) as {
		value: number;
	}[];
	expect(rows).toHaveLength(1);
	return Number(rows[0]?.value) + 1;
}

const counter = (name: string): number => getCounters()[name] ?? 0;
const INCOMPLETE = 'duplicate_media_incomplete';
const LOGGED = 'error_media_operation_failed';

const namesRecord = (text: string, tipo: string, sectionId: number): boolean =>
	text.includes(`${tipo}_${SECTION}_${sectionId}.`);

/** The bucket folder case E's records name (swept whole: only this gate writes it). */
const BUCKET_E = 'bucket_zzdm_e';

/** Remove every file AND directory whose name carries a zzdm identifier, and case E's bucket. */
function sweep(root: string | null): string[] {
	return sweepSeededMediaEntries(root, image.typeFolder, isSeededEntry);
}

/** An entry this gate wrote: a name carrying a zzdm identifier, or case E's bucket. */
function isSeededEntry(name: string): boolean {
	return (
		name === BUCKET_E ||
		[`${PLAIN}_${SECTION}_`, `${BUCKETED}_${SECTION}_`, `${FRAME_IMAGE}_${FRAME_SECTION}_`].some(
			(prefix) => name.startsWith(prefix),
		)
	);
}

/** A source record with one plain-image file on disk, indexed truthfully. */
async function plainSource(): Promise<{ source: number; path: string }> {
	const source = await createSectionRecord(SECTION, USER_ID);
	const opts = await optsFor(PLAIN, source);
	const path = fileAt(PLAIN, source, opts);
	seed(path);
	const index = scanFilesInfo(image, identity(PLAIN, source), opts, {});
	expect(index.filter((entry) => entry.file_exist === true)).toHaveLength(1);
	await setMedia(source, PLAIN, index);
	return { source, path };
}

beforeAll(async () => {
	await assertTestDatabase('duplicate_record_media_verdict_native');
	sweep(config.media.rootPath);
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(config.media.rootPath, 'no suite media root — the preload did not arm it').not.toBeNull();
	expect(QUALITY).toBeDefined();
}, 60_000);

afterAll(async () => {
	sweep(config.media.rootPath);
	for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
	for (const sectionTipo of [SECTION, FRAME_SECTION]) {
		await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [
			sectionTipo,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND string->'dd546'->0->>'value' = $1`,
			[sectionTipo],
		);
	}
	expect(await dropSituation(SITUATION), 'zzdm residue after drop').toBe(0);
}, 60_000);

describe('duplicate with media: a verdict, and a clone that never indexes the source', () => {
	test('A happy path: stored and history paths name the clone, never the source; no verdict', async () => {
		const { source } = await plainSource();
		const before = counter(INCOMPLETE);
		const clone = await duplicateSectionRecord(SECTION, source, USER_ID);
		expect(clone).not.toBe(source);
		expect(existsSync(fileAt(PLAIN, clone, await optsFor(PLAIN, clone)))).toBe(true);
		const stored = await storedFilesInfo(clone, PLAIN);
		expect(stored.filter((entry) => entry.file_exist === true)).toHaveLength(1);
		for (const entry of stored) {
			expect(namesRecord(String(entry.file_path), PLAIN, source)).toBe(false);
		}
		expect(stored.some((entry) => namesRecord(String(entry.file_path), PLAIN, clone))).toBe(true);
		const history = await historyText(clone, PLAIN);
		expect(history.length, 'the clone has no history row for the media component').toBeGreaterThan(
			0,
		);
		expect(
			namesRecord(history, PLAIN, source),
			'the clone’s HISTORY names the source’s files',
		).toBe(false);
		expect(
			namesRecord(history, PLAIN, clone),
			'the clone’s HISTORY does not name the clone’s own files — the rows recorded the stripped insert items, not the re-scanned index',
		).toBe(true);
		expect(
			await latestHistoryFilesInfo(clone, PLAIN),
			'the clone’s newest history row is not the index it STORES (the re-scanned items never reached the history)',
		).toEqual(stored);
		expect(counter(INCOMPLETE)).toBe(before);
	}, 60_000);

	test('B a refused bucket (additional_path ../../x): the duplicate returns, and the incompleteness is COUNTED and LOGGED', async () => {
		const source = await createSectionRecord(SECTION, USER_ID);
		await setBucket(source, '../../x');
		// the source index claims one existing file (wherever the refused bucket put it)
		const claim = {
			quality: QUALITY,
			extension: EXT,
			file_exist: true,
			file_name: `${BUCKETED}_${SECTION}_${source}.${EXT}`,
			file_path: `/${image.typeFolder}/${QUALITY}/x/${BUCKETED}_${SECTION}_${source}.${EXT}`,
		};
		await setMedia(source, BUCKETED, [claim]);
		const [incomplete, logged] = [counter(INCOMPLETE), counter(LOGGED)];

		const { result, log } = await capturingLog(() =>
			duplicateSectionRecordWithVerdict(SECTION, source, USER_ID),
		);
		const clone = result.sectionId;

		expect(clone).toBeGreaterThan(0);
		// The WALK refused the bucket: the verdict names the copy stage (never the
		// `count` fallback D shares), and the log carries the walk's own report.
		expect(
			verdictOf(result.media, BUCKETED).stage,
			'the refused bucket reads as a short copy (`count`) — the walk’s refusal was dropped',
		).toBe('copy');
		expect(log, 'the log line does not name the copy stage').toContain(`stage=copy`);
		expect(log, 'the log carries no copy report — the walk’s refusal text was dropped').toMatch(
			/copy report: \S/,
		);
		for (const entry of await storedFilesInfo(clone, BUCKETED)) {
			expect(namesRecord(String(entry.file_path), BUCKETED, source)).toBe(false);
		}
		expect(
			counter(INCOMPLETE) - incomplete,
			'a duplicate whose media copy was refused is silent — the empty catch swallowed it (CORE-5)',
		).toBe(1);
		expect(counter(LOGGED) - logged, 'no media.operation_failed was logged').toBeGreaterThanOrEqual(
			1,
		);
	}, 60_000);

	test('C a copy failure (a directory planted at the clone’s target file): no source-id path stored or historied; counted and logged', async () => {
		const { source } = await plainSource();
		const cloneId = await nextId();
		// The clone's target file path, occupied by a DIRECTORY: the copy fails EISDIR.
		const target = fileAt(PLAIN, cloneId, await optsFor(PLAIN, cloneId));
		mkdirSync(target, { recursive: true });
		const [incomplete, logged] = [counter(INCOMPLETE), counter(LOGGED)];

		const { result, log } = await capturingLog(() =>
			duplicateSectionRecordWithVerdict(SECTION, source, USER_ID),
		);
		const clone = result.sectionId;

		expect(clone, 'the counter minted another id — the planted directory missed').toBe(cloneId);
		expect(
			verdictOf(result.media, PLAIN).stage,
			'the failed file copy reads as a short copy (`count`) — the copy error was dropped',
		).toBe('copy');
		expect(log).toContain(`stage=copy`);
		expect(log, 'the log carries no copy report — the copy error text was dropped').toMatch(
			/copy report: \S/,
		);
		expect(statSync(target).isDirectory(), 're-read this gate: the plant was replaced').toBe(true);
		const stored = await storedFilesInfo(clone, PLAIN);
		expect(
			stored.filter((entry) => namesRecord(String(entry.file_path), PLAIN, source)),
			'the clone’s STORED index names the SOURCE record’s files — the insert carried the source files_info and the failed copy left it (CORE-5)',
		).toEqual([]);
		expect(
			namesRecord(await historyText(clone, PLAIN), PLAIN, source),
			'the clone’s HISTORY names the source’s files',
		).toBe(false);
		expect(counter(INCOMPLETE) - incomplete, 'the failed copy is not counted').toBe(1);
		expect(counter(LOGGED) - logged, 'the failed copy is not logged').toBeGreaterThanOrEqual(1);
	}, 60_000);

	test('D the source index claims a file the disk lacks: copied < claimed is a verdict', async () => {
		const { source, path } = await plainSource();
		rmSync(path, { force: true });
		const incomplete = counter(INCOMPLETE);

		const { result, log } = await capturingLog(() =>
			duplicateSectionRecordWithVerdict(SECTION, source, USER_ID),
		);

		expect(result.sectionId).toBeGreaterThan(0);
		expect(
			counter(INCOMPLETE) - incomplete,
			'the source claimed one existing file and the clone got none — unreported',
		).toBe(1);
		const verdict = verdictOf(result.media, PLAIN);
		expect(verdict.stage, 'a copy that ran and came up short is the `count` stage').toBe('count');
		expect(verdict).toMatchObject({ sourceFiles: 1, copiedFiles: 0, incomplete: true });
		expect(log, 'a short copy with no copy error logged a copy report').not.toContain(
			'copy report:',
		);
	}, 60_000);

	test('E an additional_path component: the clone’s files land in the RECORD’s bucket; no verdict', async () => {
		const source = await createSectionRecord(SECTION, USER_ID);
		await setBucket(source, BUCKET_E);
		const sourceOpts = await optsFor(BUCKETED, source);
		expect(sourceOpts.additionalPathOverride).toBe(`/${BUCKET_E}`);
		const sourcePath = fileAt(BUCKETED, source, sourceOpts);
		seed(sourcePath);
		await setMedia(
			source,
			BUCKETED,
			scanFilesInfo(image, identity(BUCKETED, source), sourceOpts, {}),
		);
		const incomplete = counter(INCOMPLETE);

		const clone = await duplicateSectionRecord(SECTION, source, USER_ID);

		const cloneOpts = await optsFor(BUCKETED, clone);
		expect(cloneOpts.additionalPathOverride, 'the bucket value was not copied').toBe(
			`/${BUCKET_E}`,
		);
		expect(
			existsSync(fileAt(BUCKETED, clone, cloneOpts)),
			'the clone’s file is not in the record’s bucket — the duplicate resolved media paths SECTION-scoped',
		).toBe(true);
		// ...and the clone's STORED index says so: every path it names lies in the
		// record's bucket and names the clone (an index re-scanned SECTION-scoped
		// would name the numeric bucket, where no file is).
		const stored = await storedFilesInfo(clone, BUCKETED);
		const paths = stored
			.map((entry) => entry.file_path)
			.filter((path): path is string => typeof path === 'string');
		expect(stored.filter((entry) => entry.file_exist === true)).toHaveLength(1);
		expect(paths.length).toBeGreaterThan(0);
		for (const path of paths) {
			expect(path, 'a stored path of the clone lies outside the record’s bucket').toContain(
				`/${BUCKET_E}/`,
			);
			expect(
				namesRecord(path, BUCKETED, clone),
				`a stored path names another record: ${path}`,
			).toBe(true);
		}
		expect(counter(INCOMPLETE)).toBe(incomplete);
	}, 60_000);

	test('F the verdict door exists and reports per component (scratch media root)', async () => {
		const module = (await import('../../src/core/section/record/duplicate_record.ts')) as Record<
			string,
			unknown
		>;
		const withVerdict = module.duplicateSectionRecordWithVerdict as
			| ((
					sectionTipo: string,
					sourceId: number,
					userId: number,
					now?: Date,
					chain?: ReadonlySet<string>,
					options?: { mediaRoot?: string },
			  ) => Promise<{ sectionId: number; media: unknown[] }>)
			| undefined;
		expect(
			typeof withVerdict,
			'duplicate_record.ts exports no duplicateSectionRecordWithVerdict — the caller cannot see the media verdict',
		).toBe('function');
		const root = scratchMediaRoot('dedalo_dup_verdict_');
		scratchRoots.push(root);
		const source = await createSectionRecord(SECTION, USER_ID);
		const opts = await optsFor(PLAIN, source);
		const laneRoot = config.media.rootPath as string;
		const relative = (sectionId: number): string =>
			fileAt(PLAIN, sectionId, opts).slice(laneRoot.length);
		seed(join(root, relative(source)));
		await setMedia(source, PLAIN, [
			{
				quality: QUALITY,
				extension: EXT,
				file_exist: true,
				file_name: `${PLAIN}_${SECTION}_${source}.${EXT}`,
				file_path: relative(source),
			},
		]);
		const result = await (withVerdict as NonNullable<typeof withVerdict>)(
			SECTION,
			source,
			USER_ID,
			undefined,
			undefined,
			{ mediaRoot: root },
		);
		expect(result.sectionId).toBeGreaterThan(source);
		expect(
			existsSync(join(root, relative(result.sectionId))),
			'the verdict door did not copy into the media root it was handed',
		).toBe(true);
		expect(Array.isArray(result.media)).toBe(true);
		expect(result.media.length, 'the verdict door reported no component at all').toBeGreaterThan(0);
		const plain = (
			result.media as {
				tipo?: string;
				sourceFiles?: number;
				copiedFiles?: number;
				incomplete?: boolean;
			}[]
		).find((verdict) => verdict.tipo === PLAIN);
		expect(plain, 'no verdict for the copied media component').toBeDefined();
		expect(plain?.sourceFiles).toBe(1);
		expect(plain?.copiedFiles).toBe(1);
		expect(plain?.incomplete).toBe(false);
		expect(plain, 'the verdict does not name the clone record it belongs to').toMatchObject({
			sectionTipo: SECTION,
			sectionId: result.sectionId,
		});
	}, 60_000);

	test('G NO media root (an explicit `mediaRoot: null`): a claiming source is a `no_media_root` verdict, counted, with an EMPTY clone index; a source claiming nothing is no verdict', async () => {
		const { source } = await plainSource();
		const incomplete = counter(INCOMPLETE);
		const claiming = await duplicateSectionRecordWithVerdict(
			SECTION,
			source,
			USER_ID,
			undefined,
			undefined,
			{ mediaRoot: null },
		);
		expect(
			verdictOf(claiming.media, PLAIN),
			'the no-root branch lost its verdict (or threw, or copied under the configured root anyway)',
		).toMatchObject({
			sectionTipo: SECTION,
			sectionId: claiming.sectionId,
			stage: 'no_media_root',
			sourceFiles: 1,
			copiedFiles: 0,
			incomplete: true,
		});
		expect(counter(INCOMPLETE) - incomplete).toBe(1);
		expect(
			(await storedFilesInfo(claiming.sectionId, PLAIN)).filter(
				(entry) => entry.file_exist === true,
			),
			'with no media root to copy under, the clone still indexes existing files (the source’s strip did not hold)',
		).toEqual([]);
		expect(
			existsSync(fileAt(PLAIN, claiming.sectionId, await optsFor(PLAIN, claiming.sectionId))),
			'a file was copied under the CONFIGURED root although the caller said there is none',
		).toBe(false);

		const quiet = await createSectionRecord(SECTION, USER_ID);
		await setMedia(quiet, PLAIN, []);
		const before = counter(INCOMPLETE);
		const unclaimed = await duplicateSectionRecordWithVerdict(
			SECTION,
			quiet,
			USER_ID,
			undefined,
			undefined,
			{ mediaRoot: null },
		);
		expect(unclaimed.media, 'a source that claimed no file raised a verdict').toEqual([]);
		expect(counter(INCOMPLETE)).toBe(before);
	}, 60_000);

	test('H a re-minted FRAME TARGET’s media verdict names ITS record — never mixed into the host clone’s', async () => {
		const target = await createSectionRecord(FRAME_SECTION, USER_ID);
		await setMedia(
			target,
			FRAME_IMAGE,
			[phantomClaim(FRAME_IMAGE, FRAME_SECTION, target)],
			FRAME_SECTION,
		);
		const host = await createSectionRecord(SECTION, USER_ID);
		await setMedia(host, PLAIN, [phantomClaim(PLAIN, SECTION, host)]);
		// A frame on the host naming the target record: the duplicate re-mints it.
		await sql.unsafe(
			`UPDATE "${TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
			  WHERE section_tipo = $1 AND section_id = $2`,
			[
				SECTION,
				host,
				FRAME_SLOT,
				JSON.stringify([
					{
						id: 1,
						type: 'dd490',
						section_tipo: FRAME_SECTION,
						section_id: target,
						from_component_tipo: FRAME_SLOT,
						main_component_tipo: PLAIN,
						id_key: 1,
					},
				]),
			],
		);

		const result = await duplicateSectionRecordWithVerdict(SECTION, host, USER_ID);

		const [frame] =
			(
				(await sql.unsafe(
					`SELECT relation->$3 AS frames FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
					[SECTION, result.sectionId, FRAME_SLOT],
				)) as { frames: { section_id: unknown }[] | null }[]
			)[0]?.frames ?? [];
		const minted = Number(frame?.section_id);
		expect(minted, 're-read this gate: the frame target was not re-minted').not.toBe(target);
		expect(minted).toBeGreaterThan(0);
		expect(result.media, 'the host and the re-minted target each answer one verdict').toHaveLength(
			2,
		);
		expect(
			verdictOf(result.media, PLAIN),
			'the host clone’s verdict names another record',
		).toMatchObject({ sectionTipo: SECTION, sectionId: result.sectionId, stage: 'count' });
		expect(
			verdictOf(result.media, FRAME_IMAGE),
			'the re-minted frame target’s verdict does not name ITS record — a caller cannot tell whose media is incomplete',
		).toMatchObject({ sectionTipo: FRAME_SECTION, sectionId: minted, stage: 'count' });
	}, 60_000);

	test('the cleanup sweep finds a file this gate seeds — its afterAll is never blind', async () => {
		// Last in the file: it sweeps every zzdm file the cases above wrote too.
		const record = await createSectionRecord(SECTION, USER_ID);
		const path = fileAt(PLAIN, record, await optsFor(PLAIN, record));
		seed(path);
		expect(existsSync(path)).toBe(true);
		const swept = sweep(config.media.rootPath);
		expect(swept.length).toBeGreaterThan(0);
		expect(existsSync(path), 'the sweep walked past a file this gate seeded').toBe(false);
	});
});
