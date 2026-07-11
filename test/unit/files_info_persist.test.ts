/**
 * R1 tail: the files_info write-back merge logic (pure — no DB). The live
 * persist (updateMatrixKeyData) is exercised by the media tool flow; here we gate
 * WHICH stored items get the fresh files_info by lang, and that a no-op is
 * detected (so the caller skips the DB write).
 */

import { describe, expect, test } from 'bun:test';
import type { FileInfoEntry } from '../../src/core/media/files_info.ts';
import { mergeFilesInfoIntoItems } from '../../src/core/media/tools/files_info_persist.ts';

const fresh = [{ quality: 'original', file_name: 'x.jpg' }] as unknown as FileInfoEntry[];

describe('mergeFilesInfoIntoItems', () => {
	test('non-translatable (lang null): updates every stored item', () => {
		const items = [{ files_info: [] }, { files_info: [] }];
		const out = mergeFilesInfoIntoItems(items, null, fresh);
		expect(out.changed).toBe(true);
		expect(out.items.every((i) => i.files_info === fresh)).toBe(true);
	});

	test('translatable: updates only the matching-lang item (and lang-less items)', () => {
		const items = [
			{ lang: 'lg-spa', files_info: [] },
			{ lang: 'lg-eng', files_info: ['keep'] },
			{ files_info: [] },
		];
		const out = mergeFilesInfoIntoItems(items, 'lg-spa', fresh);
		expect(out.changed).toBe(true);
		expect(out.items[0]!.files_info).toBe(fresh); // lg-spa updated
		expect(out.items[1]!.files_info).toEqual(['keep']); // lg-eng untouched
		expect(out.items[2]!.files_info).toBe(fresh); // lang-less updated
	});

	test('empty items → no change (nothing to refresh, never creates items)', () => {
		const out = mergeFilesInfoIntoItems([], null, fresh);
		expect(out.changed).toBe(false);
		expect(out.items).toEqual([]);
	});

	test('does not mutate the input items array', () => {
		const items = [{ lang: 'lg-spa', files_info: [] }];
		mergeFilesInfoIntoItems(items, 'lg-spa', fresh);
		expect(items[0]!.files_info).toEqual([]); // original untouched
	});
});
