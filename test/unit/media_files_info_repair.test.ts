/**
 * The files_info RECONCILE — the single writer behind every write-back, and the
 * media-IS-NULL repair that tool_media_versions `sync_files` reaches through it.
 *
 * A persist-less ingest left records whose files are on disk while the matrix
 * `media` column is SQL NULL — the component has no stored item at all, so
 * tool_media_versions reported `files_info_db: []` against N disk entries and
 * the record rendered nothing. PHP's reconcile did repair this:
 * update_component_data_files_info (:3748) mints `{files_info}` from scratch
 * whenever the data is empty and the scan found files.
 *
 * The reconcile takes the SCAN as a parameter, so every clause of
 * the create-vs-refresh-vs-nothing rule is drivable here against a scratch
 * record with no filesystem involved — including the halves that must NOT
 * write. Also gates the parts that can silently not work: minting a brand-new
 * component key into a SQL-NULL column, and the affected-row count that stops a
 * caller reporting a write it never made (S2-02).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { FileInfoEntry } from '../../src/core/media/files_info.ts';
import { buildMediaLocation } from '../../src/core/media/path.ts';
import {
	readStoredMediaItems,
	resolveMediaToolContext,
} from '../../src/core/media/tool_support.ts';
import {
	assertRecordPresent,
	persistUploadedMedia,
	reconcileStoredFilesInfo,
	repairStoredFilesInfo,
} from '../../src/core/media/tools/files_info_persist.ts';
import { getTranslatableByTipo } from '../../src/core/ontology/resolver.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolResponse } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';

/** The canonical test3 playground (matrix_test) — the suite's only write surface. */
const SCRATCH_SECTION = 'test3';
/** test99 — component_image, the shape the production bug hit (rsc170/rsc29 images). */
const MEDIA_COMPONENT = 'test99';
/** test94 — component_av, a second media component on the same record. */
const OTHER_MEDIA_COMPONENT = 'test94';
/** Scratch records this file must delete in afterAll. */
const scratchIds: number[] = [];
/** Scratch records a test deleted deliberately — only their TM rows remain to sweep. */
const alreadyDeletedIds: number[] = [];

const scanned = [
	{ quality: 'original', file_exist: true, file_name: 'x.tif', extension: 'tif' },
	{ quality: '1.5MB', file_exist: true, file_name: 'x.jpg', extension: 'jpg' },
	{ quality: 'thumb', file_exist: true, file_name: 'x.jpg', extension: 'jpg' },
] as unknown as FileInfoEntry[];

/** A scratch record, tracked for cleanup. */
async function scratchRecord(): Promise<number> {
	const sectionId = await createSectionRecord(SCRATCH_SECTION, -1);
	scratchIds.push(sectionId);
	return sectionId;
}

/** Files planted in the configured media tree, removed BY PATH in afterAll. */
const plantedPaths: string[] = [];

/**
 * Plant real (tiny) files where the HANDLER will scan for them — its media root
 * comes from config, so the identity/pathOpts are resolved through the very same
 * call the handler makes, guaranteeing the paths match (translatable components
 * carry a lang suffix). Returns the qualities planted.
 *
 * Content is irrelevant: getQualityFileInfo only stats the file.
 */
async function plantMediaFiles(sectionId: number): Promise<string[]> {
	const { spec, identity, pathOpts } = await resolveMediaToolContext({
		tipo: MEDIA_COMPONENT,
		section_tipo: SCRATCH_SECTION,
		section_id: sectionId,
	});
	const planted: string[] = [];
	for (const [quality, extension] of [
		[spec.originalQuality, spec.defaultExtension],
		[spec.defaultQuality, spec.defaultExtension],
	] as [string, string][]) {
		const location = buildMediaLocation(spec, identity, quality, extension, pathOpts);
		mkdirSync(dirname(location.absolutePath), { recursive: true });
		// Never clobber something real: a scratch section_id cannot collide, so an
		// existing file here means the identity resolution is wrong — fail loud.
		if (existsSync(location.absolutePath)) {
			throw new Error(`refusing to overwrite an existing media file: ${location.absolutePath}`);
		}
		writeFileSync(location.absolutePath, 'scratch');
		plantedPaths.push(location.absolutePath);
		planted.push(quality);
	}
	return planted;
}

/** Drive the real `sync_files` tool action. */
async function driveSyncFiles(sectionId: number): Promise<ToolResponse> {
	const loaded = await getLoadedTool('tool_media_versions');
	return await mustGet(loaded?.module.apiActions.sync_files, 'sync_files').handler({
		principal: await resolvePrincipal(-1),
		userId: -1,
		background: false,
		options: { tipo: MEDIA_COMPONENT, section_tipo: SCRATCH_SECTION, section_id: sectionId },
	});
}

afterAll(async () => {
	const failures: string[] = [];
	// Planted media files are removed BY PATH — never a directory sweep.
	for (const path of plantedPaths) {
		rmSync(path, { force: true });
	}
	for (const id of scratchIds) {
		try {
			const outcome = await deleteSectionRecord(SCRATCH_SECTION, id, -1);
			if (outcome.removed !== true) {
				failures.push(`${SCRATCH_SECTION}/${id}: ${JSON.stringify(outcome)}`);
			}
		} catch (error) {
			failures.push(`${SCRATCH_SECTION}/${id}: ${(error as Error).message}`);
		}
	}
	// deleteSectionRecord writes a 'deleted' snapshot into matrix_time_machine,
	// which is a REAL shared table, not a scratch surface — the playground's
	// Time Machine would otherwise fill with one orphan row per suite run.
	for (const id of [...scratchIds, ...alreadyDeletedIds]) {
		try {
			await sql.unsafe(
				'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
				[SCRATCH_SECTION, id],
			);
		} catch (error) {
			failures.push(`${SCRATCH_SECTION}/${id} time machine: ${(error as Error).message}`);
		}
	}
	// Throw, don't warn: silent cleanup failure is how a shared playground fills
	// with strays nobody notices.
	if (failures.length > 0) {
		throw new Error(`scratch cleanup failed: ${failures.join('; ')}`);
	}
});

describe('the files_info reconcile — create / refresh / nothing / missing', () => {
	test('repair: no stored item + files on disk mints a files_info-only item', async () => {
		const sectionId = await scratchRecord();
		// The starting state: nothing stored for this component (the column is NULL
		// on a record that never saved media — the production shape of the bug).
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toEqual([]);

		const outcome = await repairStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			freshFilesInfo: scanned,
		});
		expect(outcome).toEqual({ action: 'created', affected: 1 });

		const items = await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT);
		expect(items).toHaveLength(1);
		const item = mustGet(items[0], 'repaired item');
		expect(item.id).toBe(1);
		expect((item.files_info as FileInfoEntry[]).map((entry) => entry.quality)).toEqual([
			'original',
			'1.5MB',
			'thumb',
		]);
		// No invented upload history: the repair knows the files, not where they
		// came from. Inventing original_* would put a lie in the audit surface.
		expect(item.original_file_name).toBeUndefined();
		expect(item.original_normalized_name).toBeUndefined();
		expect(item.original_upload_date).toBeUndefined();
	});

	test('reconcile (never mints): no stored item writes nothing — the passive-scan rule', async () => {
		// This is the half that protects a component someone emptied on purpose:
		// every caller except the operator's explicit sync_files takes this path.
		const sectionId = await scratchRecord();
		const outcome = await reconcileStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			freshFilesInfo: scanned,
		});
		expect(outcome).toEqual({ action: 'noop', affected: 0 });
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toEqual([]);
	});

	test('repair: no stored item + NOTHING on disk still writes nothing', async () => {
		const sectionId = await scratchRecord();
		const outcome = await repairStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			freshFilesInfo: [],
		});
		expect(outcome).toEqual({ action: 'noop', affected: 0 });
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toEqual([]);
	});

	test('an EXISTING item is refreshed in place — no second item, provenance kept', async () => {
		const sectionId = await scratchRecord();
		await persistUploadedMedia({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			filesInfo: [],
			originalFileName: 'keep.tif',
			originalNormalizedName: `${MEDIA_COMPONENT}_${SCRATCH_SECTION}_${sectionId}.tif`,
		});

		const outcome = await repairStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			freshFilesInfo: scanned,
		}) /* even allowed to create, an existing item is refreshed */;
		expect(outcome).toEqual({ action: 'refreshed', affected: 1 });

		const items = await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT);
		expect(items).toHaveLength(1);
		const item = mustGet(items[0], 'refreshed item');
		expect((item.files_info as FileInfoEntry[]).map((entry) => entry.quality)).toEqual([
			'original',
			'1.5MB',
			'thumb',
		]);
		expect(item.original_file_name).toBe('keep.tif'); // provenance untouched
	});

	test('a deleted record is reported, not silently "written" (S2-02)', async () => {
		// The repair racing a delete: the row is gone, so the UPDATE matches
		// nothing. `affected: 0` is what lets sync_files refuse to answer Success.
		const sectionId = await scratchRecord();
		expect(await deleteSectionRecord(SCRATCH_SECTION, sectionId, -1)).toMatchObject({
			removed: true,
		});
		// Deleted on purpose — afterAll must not try to delete it a second time.
		scratchIds.splice(scratchIds.indexOf(sectionId), 1);
		alreadyDeletedIds.push(sectionId);
		const outcome = await repairStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: MEDIA_COMPONENT,
			lang: null,
			freshFilesInfo: scanned,
		});
		// 'missing', NOT 'noop': "the record is gone" and "nothing needed doing"
		// must not report the same, or the caller's guard can never see it.
		expect(outcome).toEqual({ action: 'missing', affected: 0 });
		expect(() => assertRecordPresent(outcome, { sectionTipo: SCRATCH_SECTION, sectionId })).toThrow(
			/no longer exists/,
		);
		// The ingest write refuses too: the file would be on disk with nothing
		// recording it — the very state sync_files exists to clean up.
		await expect(
			persistUploadedMedia({
				sectionTipo: SCRATCH_SECTION,
				sectionId,
				componentTipo: MEDIA_COMPONENT,
				lang: null,
				filesInfo: scanned,
				nameKeys: null,
			}),
		).rejects.toThrow(/no longer exists/);
	});

	test('sync_files mints nothing from an empty scan', async () => {
		// The guard that stops the button creating an empty item on a record with
		// no files — reachable read-only, no planting needed.
		const sectionId = await scratchRecord();
		const response = await driveSyncFiles(sectionId);
		// The client checks `response.result === true` — a boolean, never the array.
		expect(response.result).toBe(true);
		expect(response.files_info).toEqual([]);
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toEqual([]);
	});

	/**
	 * THE HEADLINE REPAIR, end to end: files on disk, matrix `media` key NULL,
	 * operator presses Sync files. This is the one assertion that goes red if
	 * anyone swaps `repairStoredFilesInfo` back for the never-minting reconcile.
	 *
	 * The handler resolves its media root from config — `resolveMediaPathOptions`
	 * returns no override — so the files are planted in the INSTALL's tree at the
	 * exact paths of a SCRATCH record id, which nothing real can collide with, and
	 * removed by path in afterAll.
	 */
	test('sync_files REPAIRS a record whose files are on disk but media key is NULL', async () => {
		const sectionId = await scratchRecord();
		const planted = await plantMediaFiles(sectionId);
		expect(planted.length).toBeGreaterThan(0);
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toEqual([]);

		const response = await driveSyncFiles(sectionId);
		expect(response.result).toBe(true);
		expect(String(response.msg)).toContain('Recorded');

		const items = await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT);
		expect(items).toHaveLength(1);
		const item = mustGet(items[0], 'repaired item');
		const stored = (item.files_info as FileInfoEntry[]).map((entry) => entry.quality);
		expect(stored.sort()).toEqual([...planted].sort());
		expect(item.original_file_name).toBeUndefined(); // no invented provenance

		// Idempotent: a second press refreshes the item it already has and does NOT
		// append a second one.
		const again = await driveSyncFiles(sectionId);
		expect(again.result).toBe(true);
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toHaveLength(1);
	});

	test('a second component on the same record does not clobber the first', async () => {
		// The reconcile writes ONE component key (update_by_key), so repairing
		// another component of the same record must leave the first one intact.
		const sectionId = await scratchRecord();
		for (const componentTipo of [MEDIA_COMPONENT, OTHER_MEDIA_COMPONENT]) {
			const outcome = await repairStoredFilesInfo({
				sectionTipo: SCRATCH_SECTION,
				sectionId,
				componentTipo,
				lang: null,
				freshFilesInfo: scanned,
			});
			expect(outcome).toEqual({ action: 'created', affected: 1 });
		}
		expect(await readStoredMediaItems(SCRATCH_SECTION, sectionId, MEDIA_COMPONENT)).toHaveLength(1);
		expect(
			await readStoredMediaItems(SCRATCH_SECTION, sectionId, OTHER_MEDIA_COMPONENT),
		).toHaveLength(1);
	});
});

/**
 * The media tools operate on the language the OPERATOR is viewing. The client
 * sends no `lang` with these requests, so `resolveMediaToolContext` fills it in
 * — and it used to read the INSTALL DEFAULT (`config.menu.dataLang`). Every user
 * on another data lang therefore scanned, and (since sync_files may now MINT an
 * item) wrote, the wrong language's media, and was told "Success".
 */
describe('media tool identity follows the REQUEST data lang', () => {
	/**
	 * rsc43 — the ONE translatable media component in the suite DB (test3's own
	 * media components are not translatable, and the lang branch only exists for
	 * translatable ones). Asserted, not assumed: if it stops being translatable
	 * this test would silently pass on the null branch.
	 */
	const TRANSLATABLE_MEDIA = 'rsc43';

	test('a translatable component resolves the request lang, not the install default', async () => {
		expect(await getTranslatableByTipo(TRANSLATABLE_MEDIA)).toBe(true);
		const tipo = TRANSLATABLE_MEDIA;
		const sectionId = await scratchRecord();
		const requestLang = config.menu.dataLang === 'lg-cat' ? 'lg-eng' : 'lg-cat';
		expect(requestLang).not.toBe(config.menu.dataLang); // the test must discriminate

		const inRequest = await runWithRequestLangs(
			{ applicationLang: config.menu.applicationLang, dataLang: requestLang },
			async () =>
				await resolveMediaToolContext({
					tipo,
					section_tipo: SCRATCH_SECTION,
					section_id: sectionId,
				}),
		);
		expect(inRequest.identity.lang).toBe(requestLang);

		// Outside any request scope (a background job, a script) the install
		// default is the honest fallback — the other half of the same line.
		const outside = await resolveMediaToolContext({
			tipo,
			section_tipo: SCRATCH_SECTION,
			section_id: sectionId,
		});
		expect(outside.identity.lang).toBe(config.menu.dataLang);
	});
});
