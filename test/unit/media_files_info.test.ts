/**
 * Phase B unit gate: the files_info SCANNER (Index law) + FILE OPS (No-hard-
 * delete law + duplication + TM deleted-scan) against a scratch media root.
 * The scanner's dd_date/size/path shape is pinned; the byte-equal-to-live gate
 * runs read-only over the shared dir in the parity suite.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import {
	duplicateMediaFiles,
	listDeletedVersions,
	moveToDeleted,
	renameOldFiles,
} from '../../src/core/media/file_ops.ts';
import { ddDateFromMtime, scanFilesInfo } from '../../src/core/media/files_info.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';

const ROOT = `${tmpdir()}/dedalo_media_fi_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const identity: MediaIdentity = {
	componentTipo: 'rsc29',
	sectionTipo: 'rsc170',
	sectionId: 5,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

/** Write a file at a media-relative path under ROOT (creating dirs). */
function place(relative: string, content: string, mtime?: Date): void {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	writeFileSync(abs, content);
	if (mtime) utimesSync(abs, mtime, mtime);
}

beforeAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
	// default (1.5MB) + thumb exist; original raw tif twin present.
	place('/image/1.5MB/rsc29_rsc170_5.jpg', 'jpeg-web', new Date('2024-06-25T19:25:40'));
	place('/image/thumb/rsc29_rsc170_5.jpg', 'thumb', new Date('2024-06-25T19:25:41'));
	place('/image/original/rsc29_rsc170_5.jpg', 'norm-original');
	place('/image/original/rsc29_rsc170_5.tif', 'raw-original');
});

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('files_info scanner (Index law)', () => {
	test('projects existing quality/extension files, skips absent', () => {
		const info = scanFilesInfo(image, identity, pathOpts, {
			originalNormalizedName: 'rsc29_rsc170_5.jpg',
		});
		const byQuality = new Map(info.map((e) => [`${e.quality}.${e.extension}`, e]));
		// present tiers
		expect(byQuality.has('1.5MB.jpg')).toBe(true);
		expect(byQuality.has('thumb.jpg')).toBe(true);
		expect(byQuality.has('original.jpg')).toBe(true);
		expect(byQuality.has('original.tif')).toBe(true); // raw twin
		// absent tiers not emitted
		expect(byQuality.has('100MB.jpg')).toBe(false);
		expect(byQuality.has('6MB.jpg')).toBe(false);
		// every emitted entry exists + carries a relative path + size + dd_date
		for (const e of info) {
			expect(e.file_exist).toBe(true);
			expect(e.file_path?.startsWith('/image/')).toBe(true);
			expect(typeof e.file_size).toBe('number');
			expect(e.file_time?.timestamp).toBeDefined();
		}
	});

	test('dd_date file_time uses the virtual-calendar encoding', () => {
		const dd = ddDateFromMtime(new Date('2024-06-25T19:25:40'));
		expect(dd.year).toBe(2024);
		expect(dd.month).toBe(6);
		expect(dd.day).toBe(25);
		expect(dd.time).toBe(65068514740); // year*372*86400 + … (matches stored samples)
		expect(dd.timestamp).toBe('2024-06-25 19:25:40');
	});

	test('file_size + file_time reproduce the on-disk file', () => {
		const info = scanFilesInfo(image, identity, pathOpts, {});
		const web = info.find((e) => e.quality === '1.5MB' && e.extension === 'jpg')!;
		const stats = statSync(`${ROOT}/image/1.5MB/rsc29_rsc170_5.jpg`);
		expect(web.file_size).toBe(stats.size);
		expect(web.file_time).toEqual(ddDateFromMtime(stats.mtime));
	});
});

describe('file ops — no-hard-delete + duplication + deleted-scan', () => {
	test('moveToDeleted → deleted/<stem>_deleted_<Y-m-d_Hi>.<ext>', () => {
		place('/image/6MB/rsc29_rsc170_5.jpg', 'to-delete');
		const target = moveToDeleted(`${ROOT}/image/6MB/rsc29_rsc170_5.jpg`, {
			now: new Date('2024-11-15T14:30:00'),
			mediaRoot: ROOT,
		});
		expect(target).toContain('/image/6MB/deleted/rsc29_rsc170_5_deleted_2024-11-15_1430.jpg');
		expect(existsSync(target as string)).toBe(true);
		expect(existsSync(`${ROOT}/image/6MB/rsc29_rsc170_5.jpg`)).toBe(false);
	});

	test('moveToDeleted on an absent file is a no-op (null)', () => {
		expect(moveToDeleted(`${ROOT}/image/25MB/nope.jpg`, { mediaRoot: ROOT })).toBeNull();
	});

	test('renameOldFiles backs up before overwrite', () => {
		place('/image/100MB/rsc29_rsc170_5.jpg', 'old');
		const backup = renameOldFiles(
			`${ROOT}/image/100MB/rsc29_rsc170_5.jpg`,
			new Date('2024-11-15T14:31:00'),
			ROOT,
		);
		expect(backup).toContain('/image/100MB/deleted/');
		expect(existsSync(`${ROOT}/image/100MB/rsc29_rsc170_5.jpg`)).toBe(false);
	});

	test('duplicateMediaFiles copies every quality/ext to the target id', () => {
		const target: MediaIdentity = { ...identity, sectionId: 99 };
		const targetOpts: MediaPathOptions = { ...pathOpts };
		const created = duplicateMediaFiles(image, identity, target, {
			source: pathOpts,
			target: targetOpts,
		});
		expect(created.length).toBeGreaterThan(0);
		expect(existsSync(`${ROOT}/image/1.5MB/rsc29_rsc170_99.jpg`)).toBe(true);
		expect(existsSync(`${ROOT}/image/thumb/rsc29_rsc170_99.jpg`)).toBe(true);
		expect(existsSync(`${ROOT}/image/original/rsc29_rsc170_99.tif`)).toBe(true);
	});

	test('listDeletedVersions natural-sorts recovered files', () => {
		place('/image/25MB/deleted/rsc29_rsc170_5_deleted_2024-01-01_0900.jpg', 'a');
		place('/image/25MB/deleted/rsc29_rsc170_5_deleted_2024-02-01_0900.jpg', 'b');
		const versions = listDeletedVersions(image, identity, '25MB', 'jpg', pathOpts);
		expect(versions.length).toBe(2);
		expect(versions[versions.length - 1]).toContain('2024-02-01');
	});
});
