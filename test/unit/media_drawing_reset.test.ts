/**
 * THE DELETE-TIME DRAWING RESET (bug 2026-10-23, rsc29_rsc170_463941).
 *
 * Removing every quality of an image retires its SVG envelope, but the drawing
 * lived in the DB too (`lib_data` + the `svg_file_data` temporal container). Left
 * behind, the next upload loaded the old vectors over the new picture. The delete
 * that removes the LAST media file now clears the drawing in the same locked
 * media write and appends the cleared value to the Time Machine.
 *
 * The pure decision is gated in files_info_persist.test.ts; here the DB half:
 * the stored item really is cleared, the clear is audited, and a reconcile
 * WITHOUT the flag (sync_files / build / rotate) never touches the layers.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { readTimeMachineHistory } from '../../src/core/db/time_machine.ts';
import { readStoredMediaItems } from '../../src/core/media/tool_support.ts';
import {
	persistUploadedMedia,
	reconcileStoredFilesInfo,
	transformStoredMediaItems,
} from '../../src/core/media/tools/files_info_persist.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';

/** The canonical test3 playground (matrix_test) — the suite's only write surface. */
const SCRATCH_SECTION = 'test3';
/** test99 — the image component of the playground. */
const IMAGE_COMPONENT = 'test99';
const scratchIds: number[] = [];

const DRAWING = [{ layer_id: 0, name: 'layer_0', layer_data: [{ element: 'ellipse' }] }];
const SVG = '<svg><g class="layer"><ellipse/></g></svg>';

/** A scratch record whose stored media item carries a drawing and an EMPTY files_info. */
async function seedDrawing(): Promise<number> {
	const sectionId = await createSectionRecord(SCRATCH_SECTION, -1);
	scratchIds.push(sectionId);
	const target = { sectionTipo: SCRATCH_SECTION, sectionId, componentTipo: IMAGE_COMPONENT };

	// Mint the item through the upload door, then stamp the drawing through the
	// one locked media writer (the state a vector-editor save leaves).
	await persistUploadedMedia({
		...target,
		lang: null,
		filesInfo: [],
		originalFileName: 'drawing.tif',
		originalNormalizedName: `${IMAGE_COMPONENT}_${SCRATCH_SECTION}_${sectionId}.tif`,
	});
	await transformStoredMediaItems(
		target,
		(items) => ({
			write: items.map((item) => ({ ...item, lib_data: DRAWING, svg_file_data: SVG })),
		}),
		{ lockWait: 'request' },
	);
	return sectionId;
}

afterAll(async () => {
	const failures: string[] = [];
	for (const id of scratchIds) {
		try {
			const outcome = await deleteSectionRecord(SCRATCH_SECTION, id, -1);
			if (outcome.removed !== true) {
				failures.push(`${SCRATCH_SECTION}/${id}: ${JSON.stringify(outcome)}`);
			}
			// deleteSectionRecord writes a 'deleted' snapshot into matrix_time_machine,
			// a REAL shared table — one orphan row per suite run otherwise.
			await sql.unsafe(
				'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
				[SCRATCH_SECTION, id],
			);
		} catch (error) {
			failures.push(`${SCRATCH_SECTION}/${id}: ${(error as Error).message}`);
		}
	}
	if (failures.length > 0) {
		throw new Error(`scratch cleanup failed: ${failures.join('; ')}`);
	}
});

describe('the delete-time drawing reset', () => {
	test('resetDrawing clears the stored drawing and audits the clear', async () => {
		const sectionId = await seedDrawing();

		const outcome = await reconcileStoredFilesInfo(
			{
				sectionTipo: SCRATCH_SECTION,
				sectionId,
				componentTipo: IMAGE_COMPONENT,
				lang: null,
				freshFilesInfo: [], // the scan of a record with no file left
			},
			{ resetDrawing: true, auditUserId: -1 },
		);
		expect(outcome.action).toBe('refreshed');

		const stored = await readStoredMediaItems(SCRATCH_SECTION, sectionId, IMAGE_COMPONENT);
		const item = stored[0];
		expect(item?.lib_data).toBeNull();
		expect(item !== undefined && 'svg_file_data' in item).toBe(false);

		// The clear is a curated-value change: the new value is in the Time Machine,
		// so the drawing remains recoverable as the previous version.
		const history = await readTimeMachineHistory(SCRATCH_SECTION, sectionId, IMAGE_COMPONENT, 10);
		expect(history.length).toBeGreaterThan(0);
		const audited = history[0]?.data as Record<string, unknown>[] | null;
		expect(audited?.[0]?.lib_data).toBeNull();
		expect(audited?.[0] !== undefined && 'svg_file_data' in (audited[0] as object)).toBe(false);
	});

	test('a reconcile WITHOUT resetDrawing keeps the drawing (sync_files/build/rotate)', async () => {
		const sectionId = await seedDrawing();

		await reconcileStoredFilesInfo({
			sectionTipo: SCRATCH_SECTION,
			sectionId,
			componentTipo: IMAGE_COMPONENT,
			lang: null,
			freshFilesInfo: [],
		});

		const stored = await readStoredMediaItems(SCRATCH_SECTION, sectionId, IMAGE_COMPONENT);
		expect(stored[0]?.lib_data).toEqual(DRAWING);
		expect(stored[0]?.svg_file_data).toBe(SVG);
	});

	test('resetDrawing without an audit user is refused, never a silent clear', async () => {
		const sectionId = await seedDrawing();

		await expect(
			reconcileStoredFilesInfo(
				{
					sectionTipo: SCRATCH_SECTION,
					sectionId,
					componentTipo: IMAGE_COMPONENT,
					lang: null,
					freshFilesInfo: [],
				},
				{ resetDrawing: true },
			),
		).rejects.toThrow(/requires auditUserId/);

		const stored = await readStoredMediaItems(SCRATCH_SECTION, sectionId, IMAGE_COMPONENT);
		expect(stored[0]?.lib_data).toEqual(DRAWING);
	});
});
