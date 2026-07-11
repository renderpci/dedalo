/**
 * Phase A unit gate: the media PATH grammar (Identity law) — identifier,
 * numeric buckets, dir/file shape, and the traversal chokepoint. Golden values
 * mirror PHP get_id (:649-681) / get_media_path_dir (:2859) / get_additional_path
 * (:753-819). The relative shapes are deterministic; absolute-path assertions
 * run only when MEDIA_PATH is configured (skipped honestly otherwise).
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import {
	additionalPath,
	assertInsideMediaRoot,
	buildMediaIdentifier,
	buildMediaLocation,
} from '../../src/core/media/path.ts';

const image = mediaTypeOf('component_image')!;
const hasRoot = config.media.rootPath !== null;

describe('media identifier (get_id)', () => {
	test('non-translatable: {ct}_{st}_{id}', () => {
		expect(
			buildMediaIdentifier({
				componentTipo: 'rsc29',
				sectionTipo: 'rsc170',
				sectionId: 770,
				lang: null,
			}),
		).toBe('rsc29_rsc170_770');
	});

	test('translatable: adds _{lang} suffix', () => {
		expect(
			buildMediaIdentifier({
				componentTipo: 'rsc29',
				sectionTipo: 'rsc170',
				sectionId: 770,
				lang: 'lg-spa',
			}),
		).toBe('rsc29_rsc170_770_lg-spa');
	});

	test('rejects bad tipo / non-positive id / bad lang', () => {
		expect(() =>
			buildMediaIdentifier({
				componentTipo: 'rsc-29',
				sectionTipo: 'rsc170',
				sectionId: 1,
				lang: null,
			}),
		).toThrow();
		expect(() =>
			buildMediaIdentifier({
				componentTipo: 'rsc29',
				sectionTipo: 'rsc170',
				sectionId: 0,
				lang: null,
			}),
		).toThrow();
		expect(() =>
			buildMediaIdentifier({
				componentTipo: 'rsc29',
				sectionTipo: 'rsc170',
				sectionId: 1,
				lang: 'lg-spa/../x',
			}),
		).toThrow();
	});
});

describe('additional_path bucket (max_items_folder)', () => {
	test("'/' + max * floor(id/max)", () => {
		expect(additionalPath(770, 1000)).toBe('/0');
		expect(additionalPath(1500, 1000)).toBe('/1000');
		expect(additionalPath(2001, 1000)).toBe('/2000');
		expect(additionalPath(999, 1000)).toBe('/0');
	});

	test('null / non-positive max → no bucket', () => {
		expect(additionalPath(770, null)).toBe('');
		expect(additionalPath(770, 0)).toBe('');
	});
});

describe('media location (get_media_path_dir + get_media_filepath)', () => {
	test.if(hasRoot)('relative dir/path follow the PHP grammar', () => {
		const loc = buildMediaLocation(
			image,
			{ componentTipo: 'rsc29', sectionTipo: 'rsc170', sectionId: 770, lang: null },
			'1.5MB',
			'jpg',
			{ initialMediaPath: '', maxItemsFolder: 1000 },
		);
		// folder + initial + '/' + quality + bucket
		expect(loc.relativeDir).toBe('/image/1.5MB/0');
		expect(loc.relativePath).toBe('/image/1.5MB/0/rsc29_rsc170_770.jpg');
		expect(loc.absolutePath.startsWith(config.media.rootPath as string)).toBe(true);
		expect(loc.absolutePath.endsWith('/image/1.5MB/0/rsc29_rsc170_770.jpg')).toBe(true);
	});

	test.if(hasRoot)('initial_media_path segment is inserted before the quality', () => {
		const loc = buildMediaLocation(
			image,
			{ componentTipo: 'rsc29', sectionTipo: 'rsc170', sectionId: 5, lang: null },
			'thumb',
			'jpg',
			{ initialMediaPath: '/coleccion', maxItemsFolder: null },
		);
		expect(loc.relativeDir).toBe('/image/coleccion/thumb');
		expect(loc.relativePath).toBe('/image/coleccion/thumb/rsc29_rsc170_5.jpg');
	});

	test.if(hasRoot)('invalid quality is rejected before any path is built', () => {
		expect(() =>
			buildMediaLocation(
				image,
				{ componentTipo: 'rsc29', sectionTipo: 'rsc170', sectionId: 1, lang: null },
				'../etc',
				'jpg',
				{ initialMediaPath: '', maxItemsFolder: null },
			),
		).toThrow();
	});
});

describe('traversal chokepoint (assertInsideMediaRoot)', () => {
	test.if(hasRoot)('confines inside the root; escapes throw', () => {
		const root = config.media.rootPath as string;
		expect(assertInsideMediaRoot(`${root}/image/1.5MB/0/x.jpg`)).toContain('/image/1.5MB/0/x.jpg');
		expect(() => assertInsideMediaRoot(`${root}/../etc/passwd`)).toThrow();
		expect(() => assertInsideMediaRoot('/etc/passwd')).toThrow();
	});
});
