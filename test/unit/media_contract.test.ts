/**
 * Phase A unit gate (engineering/MEDIA_SPEC.md): the media CONTRACT + PATH grammar +
 * MIME sniffer + ffmpeg PROFILE table — the deterministic Phase A surface that
 * needs no binaries or DB. These pin the PHP recipes (identity/path grammar,
 * SEC-065 quality validation, pixel-area law, magic-byte sniffing, the 37
 * ffmpeg profiles and the two-pass argv shape) so the processing phases build
 * on a proven foundation.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { MEDIA_KEYS } from '../../src/config/catalog/media.ts';
import {
	ALTERNATE_BUILDER_BY_MODEL,
	assertAllowedExtension,
	assertValidQuality,
	isMediaModel,
	mediaTypeOf,
	NO_ALTERNATE_BUILDER_REASON,
	pixelAreaBudget,
	qualityToMegabytes,
	thumbQuality,
} from '../../src/core/concepts/media.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';

/** The repo root — the capability filter is proved in a child (see that block). */
const REPO_ROOT = join(import.meta.dir, '../..');

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
		// svg HAS a thumb tier: a raster rendition of the vector, built by librsvg
		// (engine/svg.ts) because ImageMagick's SVG renderer is refused by the
		// hardened policy. This pinned `false` until 2026-08-08 and that was the
		// rewrite gap itself — PHP component_svg::create_thumb built one, and with
		// the flag false `assertValidQuality` refused the tier, so the media-versions
		// thumb gear answered "Unknown media quality 'thumb' for component_svg".
		expect(svg.hasThumb).toBe(true);
		// …and it is projected into list mode like every other type — the law, not a
		// per-type list (PHP get_list_value :1554). Emits an entry only once the file
		// exists (media_list_value drops qualities with no file), exactly as PHP did.
		expect(svg.listQualities).toEqual([svg.defaultQuality, thumbQuality()]);

		const threeD = mediaTypeOf('component_3d')!;
		expect(threeD.defaultExtension).toBe('glb');
		expect(threeD.folder).toBe('/3d');
	});

	test('thumb quality name from config', () => {
		expect(thumbQuality()).toBe('thumb');
	});
});

/** The registered code of a synchronous refusal (ERRORS_SPEC §4). */
function codeOf(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		if (isDedaloError(error)) return error.code;
		throw error;
	}
	throw new Error('expected a DedaloError refusal, but the call succeeded');
}

describe('media contract — quality validation (SEC-065 strengthened)', () => {
	const image = mediaTypeOf('component_image')!;

	test('valid ladder qualities pass unchanged', () => {
		expect(assertValidQuality(image, '1.5MB')).toBe('1.5MB');
		expect(assertValidQuality(image, 'original')).toBe('original');
		expect(assertValidQuality(image, 'thumb')).toBe('thumb');
	});

	test('rejects traversal, bad charset, and unknown qualities (fail-closed)', () => {
		// The refusal is the REGISTERED code (ERRORS_SPEC §1): the rejected value is
		// raw caller data and stays in the log-only `message`, so a test that only
		// matched the sentence would stop describing what the caller receives.
		expect(codeOf(() => assertValidQuality(image, '..'))).toBe('media.invalid_quality');
		expect(codeOf(() => assertValidQuality(image, '404'))).toBe('media.invalid_quality');
		expect(codeOf(() => assertValidQuality(image, ''))).toBe('media.invalid_quality');
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
		expect(codeOf(() => assertAllowedExtension(image, 'exe'))).toBe('media.invalid_extension');
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

/**
 * THE ALTERNATE-EXTENSION CONTRACT (2026-08-07).
 *
 * `DEDALO_*_ALTERNATIVE_EXTENSIONS` used to be read by seven modules and written
 * by none. The spec now states, per model, what is BUILT (`alternateExtensions`),
 * what was asked for and REFUSED (`refusedAlternateExtensions`), which key both
 * came from, and which files the type builds regardless of the key
 * (`coverExtensions`). The narrowing happens at construction so every existing
 * consumer became correct with no edit of its own — which also means the only
 * place it can be gated is here.
 */
describe('media contract — alternate-extension twins', () => {
	test('every model states its key, its list, its refusals and its covers', () => {
		for (const model of Object.keys(ALTERNATE_BUILDER_BY_MODEL)) {
			const spec = mediaTypeOf(model)!;
			// The key is what an operator edits, so a refusal can name it.
			expect([model, spec.alternateExtensionsConfigKey]).toEqual([
				model,
				`DEDALO_${model === 'component_3d' ? '3D' : model.replace('component_', '').toUpperCase()}_ALTERNATIVE_EXTENSIONS`,
			]);
			// A model with no writer advertises NOTHING — the scanners, the upload
			// allowlist message and features.alternative_extensions all read this list
			// and would otherwise describe files that cannot exist.
			if (ALTERNATE_BUILDER_BY_MODEL[model as keyof typeof ALTERNATE_BUILDER_BY_MODEL] === null) {
				expect([model, spec.alternateExtensions]).toEqual([model, []]);
			}
			// Covers are a pdf concern only: the first page rasterized into the default
			// quality, because a pdf's own defaultExtension is the DOCUMENT.
			expect([model, spec.coverExtensions]).toEqual([
				model,
				model === 'component_pdf' ? spec.coverExtensions : [],
			]);
		}
		const pdf = mediaTypeOf('component_pdf')!;
		// The jpg cover leads the list and is built whether or not the key names it —
		// so emptying the key can never un-index a cover already on disk.
		expect(pdf.coverExtensions[0]).toBe('jpg');
		expect(pdf.allowedExtensions).not.toContain('jpg'); // it is not an upload slot
	});

	test('Q1: the SHIPPED catalog defaults are untouched', () => {
		// The image key still ships EMPTY: a stock install builds no twins. Changing
		// a shipped default is a separate decision with its own migration story, and
		// this gate is what makes that decision visible rather than incidental.
		expect(MEDIA_KEYS.DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS.default).toEqual([]);
		expect(MEDIA_KEYS.DEDALO_AV_ALTERNATIVE_EXTENSIONS.default).toEqual([]);
		expect(MEDIA_KEYS.DEDALO_SVG_ALTERNATIVE_EXTENSIONS.default).toEqual([]);
		expect(MEDIA_KEYS.DEDALO_3D_ALTERNATIVE_EXTENSIONS.default).toEqual([]);
		// …and pdf still ships ['jpg'], which is why its cover was honoured BY
		// COINCIDENCE for as long as nothing else was configurable.
		expect(MEDIA_KEYS.DEDALO_PDF_ALTERNATIVE_EXTENSIONS.default).toEqual(['jpg']);
	});

	/**
	 * The refusal is only observable when a model WITHOUT a writer has the key set,
	 * and this install (like the shipped defaults) leaves those empty — so asserting
	 * it here would pass vacuously forever. Config is frozen at boot, so the honest
	 * gate boots a child with the keys set (the established technique — see
	 * active_ontology_tlds.test.ts) and reads what the spec then says.
	 */
	describe('the capability filter, proved with the keys actually set', () => {
		const PROBE = [
			"const { mediaTypeOf } = await import('./src/core/concepts/media.ts');",
			'const out = {};',
			"for (const model of ['component_image', 'component_av', 'component_svg', 'component_3d']) {",
			'\tconst spec = mediaTypeOf(model);',
			'\tout[model] = { built: spec.alternateExtensions, refused: spec.refusedAlternateExtensions };',
			'}',
			'console.log(JSON.stringify(out));',
		].join('');

		function specsWith(
			env: Record<string, string>,
		): Record<string, { built: string[]; refused: string[] }> {
			const child = Bun.spawnSync(['bun', '-e', PROBE], {
				cwd: REPO_ROOT,
				env: { ...process.env, ...env } as Record<string, string>,
				stdout: 'pipe',
				stderr: 'pipe',
			});
			if (child.exitCode !== 0) {
				throw new Error(`probe failed (${String(child.exitCode)}): ${child.stderr.toString()}`);
			}
			const stdout = child.stdout.toString().trim();
			return JSON.parse((stdout.split('\n').pop() ?? '').trim());
		}

		test('a model with NO builder builds nothing and keeps the refusal visible', () => {
			const specs = specsWith({
				DEDALO_AV_ALTERNATIVE_EXTENSIONS: '["webm"]',
				DEDALO_SVG_ALTERNATIVE_EXTENSIONS: '["png"]',
				DEDALO_3D_ALTERNATIVE_EXTENSIONS: '["gltf"]',
				DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS: '["avif","png"]',
			});
			// av: every ffmpeg profile forces mp4/libx264 and settingName has no
			// container axis; svg: a derivative is a byte copy; 3d: the converters are
			// ledgered PHP-dead. None of them can produce a second format, so none of
			// them may advertise one — but the operator's request is not thrown away.
			expect(specs.component_av).toEqual({ built: [], refused: ['webm'] });
			expect(specs.component_svg).toEqual({ built: [], refused: ['png'] });
			expect(specs.component_3d).toEqual({ built: [], refused: ['gltf'] });
			// …and the filter is NOT a blanket: the model that has a writer keeps its
			// whole list. Without this the gate above would also pass on an engine that
			// simply dropped the key everywhere — i.e. on the defect, differently spelled.
			expect(specs.component_image).toEqual({ built: ['avif', 'png'], refused: [] });
		});

		test('THE BOOT PRE-FLIGHT really prints that refusal, with key, value and reason', () => {
			// The catalog prose promises operators three times that a configured format
			// with no builder is "refused at start-up, and the server log names this
			// parameter, its value and this reason". That promise had NO gate: the
			// pre-flight was an inline `void (async …)` in startServer with no awaited
			// effect, and deleting it left every suite green — the same read-but-never-
			// honoured shape one layer up. It is a module with a return value now, so
			// the sentence an operator will read can be asserted.
			const child = Bun.spawnSync(
				[
					'bun',
					'-e',
					[
						"const { alternateExtensionWarnings } = await import('./src/core/media/alternate_preflight.ts');",
						'console.log(JSON.stringify(await alternateExtensionWarnings()));',
					].join(''),
				],
				{
					cwd: REPO_ROOT,
					env: {
						...process.env,
						DEDALO_AV_ALTERNATIVE_EXTENSIONS: '["webm"]',
						DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS: '[]',
					} as Record<string, string>,
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			expect(child.exitCode).toBe(0);
			const warnings = JSON.parse(
				(child.stdout.toString().trim().split('\n').pop() ?? '').trim(),
			) as string[];
			const refusal = warnings.find((line) => line.includes('DEDALO_AV_ALTERNATIVE_EXTENSIONS'));
			expect(
				refusal,
				'the pre-flight said nothing about a key it refuses — the ONLY place an operator ever learns that a format they configured is not being written',
			).toBeDefined();
			// key, value, and a reason that names the code that would have to change.
			expect(refusal).toContain('webm');
			expect(refusal).toContain('component_av');
			expect(refusal).toContain('ffmpeg_profiles.ts');
			// And it is SILENT about the healthy models: a line per configured format is
			// a line nobody reads, and then the one that matters is buried in it.
			expect(warnings.filter((line) => line.includes('component_image'))).toEqual([]);
		});

		test('every refused model carries the reason the operator reads at boot', () => {
			for (const model of ['component_av', 'component_svg', 'component_3d'] as const) {
				const reason = NO_ALTERNATE_BUILDER_REASON[model];
				expect([model, reason === null]).toEqual([model, false]);
				expect([model, (reason as string).length > 80]).toEqual([model, true]);
			}
			// The two models that DO build carry no reason — the census is a partition.
			expect(NO_ALTERNATE_BUILDER_REASON.component_image).toBeNull();
			expect(NO_ALTERNATE_BUILDER_REASON.component_pdf).toBeNull();
		});
	});
});
