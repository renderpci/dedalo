/**
 * R1 tail: the files_info write-back merge logic (pure — no DB). The live
 * persist (updateMatrixKeyData) is exercised by the media tool flow; here we gate
 * WHICH stored items get the fresh files_info by lang, and that a no-op is
 * detected (so the caller skips the DB write).
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import type { FileInfoEntry } from '../../src/core/media/files_info.ts';
import {
	buildUploadedMediaItems,
	mergeFilesInfoIntoItems,
	nameKeysForQuality,
} from '../../src/core/media/tools/files_info_persist.ts';
import { mustGet } from '../helpers/assert.ts';

const fresh = [{ quality: 'original', file_name: 'x.jpg' }] as unknown as FileInfoEntry[];
const image = mustGet(mediaTypeOf('component_image'), 'component_image spec');
const av = mustGet(mediaTypeOf('component_av'), 'component_av spec');

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

/**
 * PHP component_image::process_uploaded_file (:778-791) is an if/else-if over
 * get_original_quality() / get_modified_quality() with NO else: the tier the
 * file landed in decides which provenance trio is stamped, and an upload parked
 * anywhere else stamps neither. custom_target_quality made that reachable.
 */
describe('nameKeysForQuality', () => {
	test('no quality / empty ⇒ the original tier', () => {
		expect(nameKeysForQuality(image, undefined)).toBe('original');
		expect(nameKeysForQuality(image, null)).toBe('original');
		expect(nameKeysForQuality(image, '')).toBe('original');
		expect(nameKeysForQuality(image, image.originalQuality)).toBe('original');
	});

	test('the image retouched tier ⇒ the modified_* trio', () => {
		expect(nameKeysForQuality(image, config.media.imageQualityRetouched)).toBe('modified');
	});

	test('any other tier ⇒ no name keys at all', () => {
		expect(nameKeysForQuality(image, image.defaultQuality)).toBeNull();
		expect(nameKeysForQuality(image, 'thumb')).toBeNull();
		// 'modified' is an IMAGE concept — an av file parked in a same-named tier
		// must not claim image provenance.
		expect(nameKeysForQuality(av, config.media.imageQualityRetouched)).toBeNull();
		expect(nameKeysForQuality(av, 'audio')).toBeNull();
	});
});

describe('buildUploadedMediaItems', () => {
	const base = {
		lang: null,
		filesInfo: fresh,
		originalFileName: 'my photo.jpg',
		originalNormalizedName: 'rsc29_rsc170_1.jpg',
	};

	test('default (original tier): creates the item with the original_* trio', () => {
		const items = buildUploadedMediaItems({ ...base, existingItems: [] });
		expect(items).toHaveLength(1);
		const item = mustGet(items[0], 'created item');
		expect(item.id).toBe(1);
		expect(item.files_info).toBe(fresh);
		expect(item.original_file_name).toBe('my photo.jpg');
		expect(item.original_normalized_name).toBe('rsc29_rsc170_1.jpg');
		expect(item.original_upload_date).toBeDefined();
		expect(item.modified_file_name).toBeUndefined();
	});

	test("nameKeys 'modified': stamps the modified_* twins, leaves original_* alone", () => {
		const items = buildUploadedMediaItems({
			...base,
			existingItems: [{ id: 1, original_file_name: 'keep.tif', files_info: [] }],
			originalFileName: 'retouched.psd',
			originalNormalizedName: 'rsc29_rsc170_1.psd',
			nameKeys: 'modified',
		});
		const item = mustGet(items[0], 'updated item');
		expect(item.modified_file_name).toBe('retouched.psd');
		expect(item.modified_normalized_name).toBe('rsc29_rsc170_1.psd');
		expect(item.modified_upload_date).toBeDefined();
		expect(item.original_file_name).toBe('keep.tif'); // untouched
	});

	/**
	 * The media-IS-NULL repair: PHP update_component_data_files_info (:3756)
	 * mints `{files_info}` from scratch for files it found on disk, with NO
	 * provenance — it does not know where they came from, and neither do we.
	 */
	test('nameKeys null: creates a files_info-only item, no invented provenance', () => {
		const items = buildUploadedMediaItems({
			lang: null,
			existingItems: [],
			filesInfo: fresh,
			nameKeys: null,
		});
		expect(items).toHaveLength(1);
		const item = mustGet(items[0], 'created item');
		expect(item.files_info).toBe(fresh);
		expect(item.original_file_name).toBeUndefined();
		expect(item.original_normalized_name).toBeUndefined();
		expect(item.original_upload_date).toBeUndefined();
		expect(item.modified_file_name).toBeUndefined();
	});

	test('stamping provenance without the names is a loud programming error', () => {
		expect(() =>
			buildUploadedMediaItems({
				lang: null,
				existingItems: [],
				filesInfo: fresh,
			}),
		).toThrow(/requires the file names/);
	});
});
