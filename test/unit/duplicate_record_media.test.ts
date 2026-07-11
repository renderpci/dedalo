/**
 * S1-04 gate: duplicate-with-media PERSISTS the refreshed files_info.
 *
 * duplicateSectionRecord copies the physical media files to the new
 * section_id and re-scans files_info against the new paths; before the fix
 * that refresh lived only in memory, so the duplicate's STORED media column
 * kept the SOURCE record's file paths (dangling once the source is deleted).
 * This gate seeds real physical files on a scratch record (matrix_test /
 * test TLD, reserved coordinate) and asserts the duplicate's stored
 * files_info — read fresh from the DB — carries new-id paths, never
 * source-id paths. All rows and files are cleaned up (before AND after, so a
 * crashed previous run cannot poison the next one).
 *
 * Requires a configured media root (config.media.rootPath); the duplicate
 * media branch is a no-op without one, so the gate skips (same guard as
 * media_path.test.ts). Seeded files live under scratch-identity names
 * (test175_test2_<reserved-id>) inside the real media root.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { scanFilesInfo } from '../../src/core/media/files_info.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	buildMediaLocation,
} from '../../src/core/media/path.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TABLE = 'matrix_test';
/** Scratch test-TLD section on matrix_test with a component_image (test175). */
const SECTION_TIPO = 'test2';
const MEDIA_TIPO = 'test175';
/** Reserved scratch coordinate — collides with nothing real. */
const SOURCE_ID = 999101;
const USER_ID = 1;
/** The physical files seeded on the source (quality × jpg). */
const SEEDED_QUALITIES = ['1.5MB', 'thumb'] as const;

const image = mediaTypeOf('component_image')!;
const hasRoot = config.media.rootPath !== null;

let pathOpts: MediaPathOptions;
let newSectionId: number | null = null;
/** Every absolute file path this gate creates (directly or via duplicate). */
const createdFiles: string[] = [];

function identityFor(sectionId: number): MediaIdentity {
	return { componentTipo: MEDIA_TIPO, sectionTipo: SECTION_TIPO, sectionId, lang: null };
}

function qualityFiles(sectionId: number): string[] {
	return SEEDED_QUALITIES.map(
		(quality) =>
			buildMediaLocation(image, identityFor(sectionId), quality, 'jpg', pathOpts).absolutePath,
	);
}

async function cleanupRows(): Promise<void> {
	await cleanScratchRecord(SECTION_TIPO, SOURCE_ID, TABLE);
	if (newSectionId !== null) {
		await cleanScratchRecord(SECTION_TIPO, newSectionId, TABLE);
	}
}

function cleanupFiles(): void {
	for (const path of createdFiles) rmSync(path, { force: true });
	// Best effort: drop bucket dirs this gate may have created, only when empty
	// (the media root is shared — never remove a dir that still has files).
	for (const path of createdFiles) {
		try {
			rmdirSync(dirname(path));
		} catch {
			/* non-empty or already gone — leave it */
		}
	}
}

describe.skipIf(!hasRoot)('duplicate-with-media persists refreshed files_info (S1-04)', () => {
	beforeAll(async () => {
		pathOpts = await resolveMediaPathOptions(MEDIA_TIPO, SECTION_TIPO);
		await cleanupRows();
		// Seed real physical files at the SOURCE identity paths.
		for (const path of qualityFiles(SOURCE_ID)) {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, `fake-media ${path}`);
			createdFiles.push(path);
		}
		// Seed the source row: stored files_info is the real scan of the SOURCE
		// identity (source-id paths — exactly what the duplicate must NOT keep).
		const sourceFilesInfo = scanFilesInfo(image, identityFor(SOURCE_ID), pathOpts, {});
		expect(sourceFilesInfo.length).toBe(SEEDED_QUALITIES.length);
		await createScratchRecord(
			SECTION_TIPO,
			SOURCE_ID,
			{ media: { [MEDIA_TIPO]: [{ id: 1, files_info: sourceFilesInfo }] } },
			{ table: TABLE },
		);
	});

	afterAll(async () => {
		await cleanupRows();
		cleanupFiles();
	});

	test('stored files_info carries new-id paths, never source-id paths', async () => {
		newSectionId = await duplicateSectionRecord(SECTION_TIPO, SOURCE_ID, USER_ID);
		expect(newSectionId).toBeGreaterThan(0);
		expect(newSectionId).not.toBe(SOURCE_ID);

		// Physical copies exist at the NEW identity (register them for cleanup).
		for (const path of qualityFiles(newSectionId)) {
			createdFiles.push(path);
			expect(existsSync(path)).toBe(true);
		}

		// The duplicate's STORED media column — fresh read from the DB, not the
		// in-memory refresh the old code discarded.
		const row = await readMatrixRecord(TABLE, SECTION_TIPO, newSectionId);
		const media = row?.columns.media as Record<string, unknown> | null;
		const items = media?.[MEDIA_TIPO] as
			| { id?: number; files_info?: { file_path: string | null }[] }[]
			| undefined;
		expect(Array.isArray(items)).toBe(true);
		const filesInfo = items?.[0]?.files_info;
		expect(Array.isArray(filesInfo)).toBe(true);
		expect(filesInfo!.length).toBe(SEEDED_QUALITIES.length);
		for (const entry of filesInfo!) {
			expect(entry.file_path).toContain(`${MEDIA_TIPO}_${SECTION_TIPO}_${newSectionId}.`);
			expect(entry.file_path).not.toContain(`_${SOURCE_ID}`);
		}

		// The SOURCE row's stored files_info is untouched (still source-id paths).
		const sourceRow = await readMatrixRecord(TABLE, SECTION_TIPO, SOURCE_ID);
		const sourceItems = (sourceRow?.columns.media as Record<string, unknown>)?.[MEDIA_TIPO] as {
			files_info?: { file_path: string | null }[];
		}[];
		for (const entry of sourceItems[0]?.files_info ?? []) {
			expect(entry.file_path).toContain(`_${SOURCE_ID}.`);
		}
	});
});
