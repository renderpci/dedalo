/**
 * Phase 5/6 unit gate: removeSectionMediaFiles — the delete-path media move
 * (PHP remove_section_media_files / rename_old_files contract): each stored
 * file moves into '{qualityDir}/deleted/{stem}_deleted_{Y-m-d_Gis}.{ext}'
 * (recoverable, never a hard delete). PHP cannot oracle this end-to-end
 * (its live delete crashes mid-flight — see delete_inverse_refs gate), so
 * the FILE CONTRACT is pinned here against a temp media root.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { removeSectionMediaFiles } from '../../src/core/section/record/delete_record.ts';

const ROOT = `${tmpdir()}/dedalo_ts_media_test_${process.pid}`;

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('delete-path media file move', () => {
	test('files move to deleted/ with the PHP datestamp suffix', async () => {
		mkdirSync(`${ROOT}/image/1.5MB/0`, { recursive: true });
		mkdirSync(`${ROOT}/image/thumb/0`, { recursive: true });
		writeFileSync(`${ROOT}/image/1.5MB/0/test99_test3_1.jpg`, 'fake-image');
		writeFileSync(`${ROOT}/image/thumb/0/test99_test3_1.jpg`, 'fake-thumb');

		const mediaColumn = {
			test99: [
				{
					id: 1,
					files_info: [
						{ quality: '1.5MB', file_path: '/image/1.5MB/0/test99_test3_1.jpg' },
						{ quality: 'thumb', file_path: '/image/thumb/0/test99_test3_1.jpg' },
						{ quality: 'web', file_path: '/image/web/0/missing.jpg' }, // absent → skipped
					],
				},
			],
		};
		const now = new Date(2026, 6, 2, 9, 5, 7); // hour 9 → NO leading zero (PHP 'G')
		const moved = await removeSectionMediaFiles(mediaColumn, now, ROOT);

		expect(moved.length).toBe(2);
		expect(existsSync(`${ROOT}/image/1.5MB/0/test99_test3_1.jpg`)).toBe(false);
		expect(
			existsSync(`${ROOT}/image/1.5MB/0/deleted/test99_test3_1_deleted_2026-07-02_90507.jpg`),
		).toBe(true);
		expect(
			existsSync(`${ROOT}/image/thumb/0/deleted/test99_test3_1_deleted_2026-07-02_90507.jpg`),
		).toBe(true);
		// Nothing else was touched in the quality dirs.
		expect(readdirSync(`${ROOT}/image/1.5MB/0`)).toEqual(['deleted']);
	});

	test('no media root / empty column are silent no-ops', async () => {
		expect(await removeSectionMediaFiles(null, new Date(), ROOT)).toEqual([]);
		expect(await removeSectionMediaFiles({ test99: [] }, new Date(), '')).toEqual([]);
	});
});
