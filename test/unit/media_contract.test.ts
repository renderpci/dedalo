/**
 * Phase A unit gate (engineering/MEDIA_SPEC.md): the media CONTRACT + PATH grammar +
 * MIME sniffer + ffmpeg PROFILE table — the deterministic Phase A surface that
 * needs no binaries or DB. These pin the PHP recipes (identity/path grammar,
 * SEC-065 quality validation, pixel-area law, magic-byte sniffing, the 37
 * ffmpeg profiles and the two-pass argv shape) so the processing phases build
 * on a proven foundation.
 */

import { describe, expect, test } from 'bun:test';
import {
	assertAllowedExtension,
	assertValidQuality,
	isMediaModel,
	mediaTypeOf,
	pixelAreaBudget,
	qualityToMegabytes,
	thumbQuality,
} from '../../src/core/concepts/media.ts';

describe('media contract — type catalog (env-config)', () => {
	test('the five media models resolve; non-media do not', () => {
		for (const m of [
			'component_image',
			'component_av',
			'component_pdf',
			'component_svg',
			'component_3d',
		]) {
			expect(isMediaModel(m)).toBe(true);
			expect(mediaTypeOf(m)).not.toBeNull();
		}
		expect(isMediaModel('component_input_text')).toBe(false);
		expect(mediaTypeOf('component_input_text')).toBeNull();
	});

	test('catalog matches the PHP defaults (media_image/av/docs)', () => {
		const image = mediaTypeOf('component_image')!;
		expect(image.qualities).toEqual([
			'original',
			'modified',
			'100MB',
			'25MB',
			'6MB',
			'1.5MB',
			'thumb',
		]);
		expect(image.defaultQuality).toBe('1.5MB');
		expect(image.originalQuality).toBe('original');
		expect(image.defaultExtension).toBe('jpg');
		expect(image.folder).toBe('/image');
		expect(image.allowedExtensions).toContain('tiff');
		// S3-69 unpin: list qualities are a PROJECTION LAW ([default, thumb] for
		// every thumbed type — PHP component_media_common::get_list_value; av
		// included since the posterframe fix), not install literals. Asserting
		// the law keeps the gate green across legitimate config-catalog changes.
		expect(image.listQualities).toEqual([image.defaultQuality, thumbQuality()]);

		const av = mediaTypeOf('component_av')!;
		expect(av.qualities).toEqual(['original', '1080', '720', '576', '404', '240', 'audio']);
		expect(av.defaultQuality).toBe('404');
		expect(av.listQualities).toEqual([av.defaultQuality, thumbQuality()]);
		// av HAS a thumb tier: the posterframe-derived jpg in the thumb quality
		// dir — PHP get_list_value projects [default, thumb] for av (parity gate:
		// component_datalist_lifecycle_differential 'av: list value includes
		// thumb quality').
		expect(av.hasThumb).toBe(true);

		const pdf = mediaTypeOf('component_pdf')!;
		expect(pdf.defaultQuality).toBe('web');
		expect(pdf.alternateExtensions).toEqual(['jpg']);
		expect(pdf.listQualities).toEqual([pdf.defaultQuality, thumbQuality()]);

		const svg = mediaTypeOf('component_svg')!;
		expect(svg.hasThumb).toBe(false);
		expect(svg.listQualities).toEqual([svg.defaultQuality]);

		const threeD = mediaTypeOf('component_3d')!;
		expect(threeD.defaultExtension).toBe('glb');
		expect(threeD.folder).toBe('/3d');
	});

	test('thumb quality name from config', () => {
		expect(thumbQuality()).toBe('thumb');
	});
});

describe('media contract — quality validation (SEC-065 strengthened)', () => {
	const image = mediaTypeOf('component_image')!;

	test('valid ladder qualities pass unchanged', () => {
		expect(assertValidQuality(image, '1.5MB')).toBe('1.5MB');
		expect(assertValidQuality(image, 'original')).toBe('original');
		expect(assertValidQuality(image, 'thumb')).toBe('thumb');
	});

	test('rejects traversal, bad charset, and unknown qualities (fail-closed)', () => {
		expect(() => assertValidQuality(image, '..')).toThrow();
		expect(() => assertValidQuality(image, '.')).toThrow();
		expect(() => assertValidQuality(image, '../etc')).toThrow();
		expect(() => assertValidQuality(image, 'web/../..')).toThrow();
		expect(() => assertValidQuality(image, '')).toThrow();
		// charset-valid but not in the image ladder → rejected (stronger than PHP).
		expect(() => assertValidQuality(image, '404')).toThrow();
	});

	test('extension allowlist', () => {
		expect(assertAllowedExtension(image, 'TIF')).toBe('tif');
		expect(assertAllowedExtension(image, '.jpg')).toBe('jpg');
		expect(() => assertAllowedExtension(image, 'exe')).toThrow();
	});
});

describe('media contract — pixel-area law (component_image:1850-1899)', () => {
	test('convert_quality_to_megabytes semantics', () => {
		expect(qualityToMegabytes('1.5MB')).toBe(1.5);
		expect(qualityToMegabytes('100MB')).toBe(100);
		expect(qualityToMegabytes('>100MB')).toBe(101);
		expect(qualityToMegabytes('<1MB')).toBeCloseTo(0.9, 5);
		expect(qualityToMegabytes('thumb')).toBeNull();
		expect(qualityToMegabytes('original')).toBeNull();
	});

	test('pixel area = MB × 350000; unbounded tiers null', () => {
		expect(pixelAreaBudget('1.5MB')).toBe(525000);
		expect(pixelAreaBudget('6MB')).toBe(2100000);
		expect(pixelAreaBudget('original')).toBeNull();
		expect(pixelAreaBudget('thumb')).toBeNull();
	});
});
