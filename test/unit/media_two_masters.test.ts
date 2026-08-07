/**
 * THE TWO-MASTERS GATE (2026-08-07).
 *
 * Dédalo's image domain has TWO masters, not one: the ORIGINAL (the camera /
 * scanner shot, stored as is) and the RETOUCHED tier
 * (DEDALO_IMAGE_QUALITY_RETOUCHED, canonically 'modified') — the human-retouched
 * second master, which may be a full-quality .tif or .psd and which OUTRANKS the
 * original as the source of every derived tier for as long as it exists (v6
 * component_image::get_image_source, frozen class.component_image.php:1569).
 *
 * Before this change the engine had one notion, `originalQuality`, so the
 * retouched tier was classified as a derivative: a .tif into it was REFUSED
 * ("Cannot upload a '.tif' file into the 'modified' tier"), an accepted retouch
 * re-encoded nothing, and nothing could ever be built FROM it.
 *
 * These assertions are about CONTENT, not existence: the fixtures are two
 * visually distinct flat colours, so "the derived tier came from the modified"
 * is a pixel value, not a file listing.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { assertNormalizedExtensionForTier, mediaTypeOf } from '../../src/core/concepts/media.ts';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { stagingDir } from '../../src/core/media/ingest/add_file.ts';
import { processUploadedFile } from '../../src/core/media/ingest/process_uploaded_file.ts';
import {
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
} from '../../src/core/media/path.ts';
import {
	regenerateImage,
	resolveMasterQuality,
	resolveMasterSource,
} from '../../src/core/media/processing.ts';
import { svgOverlayLocation } from '../../src/core/media/svg_overlay.ts';
import { rebuildDerivedTiersAfterMasterDelete } from '../../src/core/media/tools/versions.ts';

const ROOT = `${tmpdir()}/dedalo_two_masters_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const av = mediaTypeOf('component_av')!;
const pdf = mediaTypeOf('component_pdf')!;
const HAVE_MAGICK = existsSync(resolveMagick());
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

/** The retouched tier name as this install configures it — never the literal. */
const MODIFIED = config.media.imageQualityRetouched;
/** A tier that really IS a derivative, for the contrast cases. */
const DERIVED = image.defaultQuality;

let sectionId = 0;
function nextIdentity(): MediaIdentity {
	sectionId += 1;
	return { componentTipo: 'rsc29', sectionTipo: 'rsc170', sectionId, lang: null };
}

function pathOf(identity: MediaIdentity, quality: string, extension: string): string {
	return buildMediaLocation(image, identity, quality, extension, pathOpts).absolutePath;
}

/** Write a real flat-colour image at an absolute path. */
async function makeImage(absolute: string, color: string, size = '900x600'): Promise<void> {
	mkdirSync(absolute.slice(0, absolute.lastIndexOf('/')), { recursive: true });
	const result = await runBinary([resolveMagick(), '-size', size, `xc:${color}`, absolute], {
		nice: false,
	});
	if (result.exitCode !== 0) {
		throw new Error(`fixture build failed for ${absolute}: ${result.stderr}`);
	}
}

/** Read the centre pixel as 8-bit r,g,b (the fixtures are flat, so one probe decides). */
async function centrePixel(path: string): Promise<[number, number, number]> {
	const format =
		'%[fx:int(255*p{w/2,h/2}.r)],%[fx:int(255*p{w/2,h/2}.g)],%[fx:int(255*p{w/2,h/2}.b)]';
	const result = await runBinary([resolveMagick(), path, '-format', format, 'info:'], {
		nice: false,
	});
	const parts = result.stdout.trim().split(',').map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
		throw new Error(`cannot read the centre pixel of ${path}: '${result.stdout}'`);
	}
	return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Which flat fixture colour a written derivative depicts — the content assertion. */
async function depicts(path: string): Promise<'red' | 'blue' | 'green' | 'other'> {
	const [r, g, b] = await centrePixel(path);
	if (r > 200 && g < 60 && b < 60) return 'red';
	if (b > 200 && r < 60 && g < 60) return 'blue';
	// ImageMagick's 'green' is (0,128,0), not (0,255,0) — the band is around 128.
	if (g > 100 && r < 60 && b < 60) return 'green';
	return 'other';
}

beforeAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
	mkdirSync(ROOT, { recursive: true });
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('masterQualities — the concept', () => {
	test('component_image has TWO masters, retouched first (precedence order)', () => {
		expect(image.masterQualities).toEqual([MODIFIED, image.originalQuality]);
	});

	test('every other model has exactly one master: its own original', () => {
		for (const spec of [av, pdf, mediaTypeOf('component_svg')!, mediaTypeOf('component_3d')!]) {
			expect(spec.masterQualities).toEqual([spec.originalQuality]);
		}
	});

	test('the masters are REAL ladder tiers (a source nothing can fill is not a master)', () => {
		for (const master of image.masterQualities) {
			expect(image.qualities).toContain(master);
		}
	});
});

describe('the shadowing guard — masters exempt, derivative tiers still guarded', () => {
	test('a .tif into the RETOUCHED tier is ACCEPTED (the reported defect)', () => {
		expect(() => assertNormalizedExtensionForTier(image, MODIFIED, 'tif')).not.toThrow();
		// The retouch arrives in whatever the photographer delivered.
		for (const extension of ['psd', 'tiff', 'png']) {
			expect(() => assertNormalizedExtensionForTier(image, MODIFIED, extension)).not.toThrow();
		}
	});

	test('a .tif into the ORIGINAL tier is still accepted (unchanged Original law)', () => {
		expect(() =>
			assertNormalizedExtensionForTier(image, image.originalQuality, 'tif'),
		).not.toThrow();
	});

	test('a .tif into a REAL derivative tier is still REFUSED (guard not lost)', () => {
		expect(() => assertNormalizedExtensionForTier(image, DERIVED, 'tif')).toThrow(
			/would be shadowed/,
		);
		// av has no retouched tier at all, so its derivative tiers are unchanged.
		expect(() => assertNormalizedExtensionForTier(av, av.defaultQuality, 'mkv')).toThrow(
			/would be shadowed/,
		);
	});

	test('the refusal names the MASTER tiers as the target, not just the original', () => {
		let message = '';
		try {
			assertNormalizedExtensionForTier(image, DERIVED, 'tif');
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain(`'${MODIFIED}'`);
		expect(message).toContain(`'${image.originalQuality}'`);
	});

	test('a normalized extension into a derivative tier is accepted', () => {
		expect(() =>
			assertNormalizedExtensionForTier(image, DERIVED, image.defaultExtension),
		).not.toThrow();
	});
});

describe.if(HAVE_MAGICK)('resolveMasterSource — precedence', () => {
	test('the RETOUCHED master outranks the original', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		expect(resolveMasterQuality(image, identity, pathOpts)).toBe(image.originalQuality);

		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');
		expect(resolveMasterQuality(image, identity, pathOpts)).toBe(MODIFIED);
		expect(resolveMasterSource(image, identity, pathOpts)).toContain(`/${MODIFIED}/`);
	});

	test('the original is used when no retouch exists', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		expect(resolveMasterSource(image, identity, pathOpts)).toContain(`/${image.originalQuality}/`);
	});

	test('building the ORIGINAL tier never sources from the retouch (v6 :1574)', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');
		expect(resolveMasterSource(image, identity, pathOpts, null, image.originalQuality)).toContain(
			`/${image.originalQuality}/`,
		);
	});

	test('no master at all resolves to null', () => {
		expect(resolveMasterSource(image, nextIdentity(), pathOpts)).toBeNull();
		expect(resolveMasterQuality(image, nextIdentity(), pathOpts)).toBeNull();
	});
});

describe.if(HAVE_MAGICK)('the derived tiers depict the best master', () => {
	test('with BOTH masters present, the derived tiers come from the RETOUCH', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');

		await regenerateImage(image, identity, pathOpts, 'tif');

		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');
		expect(
			await depicts(pathOf(identity, config.media.thumb.quality, config.media.thumb.extension)),
		).toBe('blue');
		// And the masters themselves are untouched.
		expect(await depicts(pathOf(identity, image.originalQuality, 'tif'))).toBe('red');
		expect(await depicts(pathOf(identity, MODIFIED, 'tif'))).toBe('blue');
	});

	test('a NEW ORIGINAL while a retouch exists still builds from the RETOUCH', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');
		await regenerateImage(image, identity, pathOpts, 'tif');
		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');

		// The operator re-scans the object: a fresh, DIFFERENT original lands.
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await regenerateImage(image, identity, pathOpts, 'tif');

		// Decision 1: the retouch keeps outranking it — the visible image is unchanged.
		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');
	});

	test('an ALREADY EXISTING higher tier is RE-ENCODED, not left stale', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		// A higher tier built earlier, from a master that is about to be superseded.
		const higher = image.qualities.find(
			(quality) =>
				!image.masterQualities.includes(quality) &&
				quality !== image.defaultQuality &&
				quality !== config.media.thumb.quality,
		);
		expect(higher).toBeDefined();
		const higherPath = pathOf(identity, higher as string, image.defaultExtension);
		await makeImage(higherPath, 'green');
		expect(await depicts(higherPath)).toBe('green');

		// The retouch arrives and becomes the best master.
		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');
		await regenerateImage(image, identity, pathOpts, 'tif');

		expect(await depicts(higherPath)).toBe('blue');
	});

	test('an ABSENT higher tier is NOT minted (tiers stay on-demand)', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await regenerateImage(image, identity, pathOpts, 'tif');
		const absent = image.qualities.filter(
			(quality) =>
				!image.masterQualities.includes(quality) &&
				quality !== image.defaultQuality &&
				quality !== config.media.thumb.quality,
		);
		for (const quality of absent) {
			expect(existsSync(pathOf(identity, quality, image.defaultExtension))).toBe(false);
		}
	});
});

describe.if(HAVE_MAGICK)('deleting a master re-sources the derived tiers', () => {
	test('deleting the RETOUCH rebuilds the derived tiers from the ORIGINAL at once', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		const modifiedPath = pathOf(identity, MODIFIED, 'tif');
		await makeImage(modifiedPath, 'blue');
		await regenerateImage(image, identity, pathOpts, 'tif');
		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');

		rmSync(modifiedPath);
		const outcome = await rebuildDerivedTiersAfterMasterDelete(image, identity, pathOpts, MODIFIED);

		expect(outcome.errors).toEqual([]);
		expect(outcome.rebuilt.length).toBeGreaterThan(0);
		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('red');
		expect(
			await depicts(pathOf(identity, config.media.thumb.quality, config.media.thumb.extension)),
		).toBe('red');
	});

	test('deleting the ORIGINAL while a retouch survives changes nothing visible', async () => {
		const identity = nextIdentity();
		const originalPath = pathOf(identity, image.originalQuality, 'tif');
		await makeImage(originalPath, 'red');
		await makeImage(pathOf(identity, MODIFIED, 'tif'), 'blue');
		await regenerateImage(image, identity, pathOpts, 'tif');

		rmSync(originalPath);
		await rebuildDerivedTiersAfterMasterDelete(image, identity, pathOpts, image.originalQuality);

		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');
	});

	test('deleting the LAST master LEAVES the derived tiers standing (never wipes them)', async () => {
		const identity = nextIdentity();
		const originalPath = pathOf(identity, image.originalQuality, 'tif');
		await makeImage(originalPath, 'red');
		await regenerateImage(image, identity, pathOpts, 'tif');
		const derivedPath = pathOf(identity, DERIVED, image.defaultExtension);
		expect(await depicts(derivedPath)).toBe('red');

		rmSync(originalPath);
		const outcome = await rebuildDerivedTiersAfterMasterDelete(
			image,
			identity,
			pathOpts,
			image.originalQuality,
		);

		expect(outcome).toEqual({ rebuilt: [], errors: [] });
		// They are all that is left of this record's image — still there, still honest.
		expect(existsSync(derivedPath)).toBe(true);
		expect(await depicts(derivedPath)).toBe('red');
	});

	test('deleting a DERIVATIVE tier rebuilds nothing (only masters re-source)', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await regenerateImage(image, identity, pathOpts, 'tif');
		const derivedPath = pathOf(identity, DERIVED, image.defaultExtension);
		rmSync(derivedPath);

		const outcome = await rebuildDerivedTiersAfterMasterDelete(image, identity, pathOpts, DERIVED);

		expect(outcome).toEqual({ rebuilt: [], errors: [] });
		expect(existsSync(derivedPath)).toBe(false);
	});

	test('removing ONE extension of a master that still holds another re-sources from it', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		const modifiedTif = pathOf(identity, MODIFIED, 'tif');
		await makeImage(modifiedTif, 'blue');
		await makeImage(pathOf(identity, MODIFIED, 'png'), 'blue');
		await regenerateImage(image, identity, pathOpts, 'tif');

		rmSync(modifiedTif); // the .png retouch survives — still the best master
		await rebuildDerivedTiersAfterMasterDelete(image, identity, pathOpts, MODIFIED);

		expect(await depicts(pathOf(identity, DERIVED, image.defaultExtension))).toBe('blue');
	});
});

/**
 * THE REPORTED DEFECT, end to end. "Importing with the target quality set to
 * 'modified' fails per file" — tool_import_files / tool_upload / the MCP media
 * tool all funnel into processUploadedFile with `quality`, so the ingest
 * orchestrator is where the report is reproduced and fixed.
 */
describe.if(HAVE_MAGICK)('ingesting into the retouched tier', () => {
	const USER_ID = 7;
	const KEY_DIR = 'kdtwomasters';

	/** Stage a real image of `color` in the upload tmp dir under `tmpName`. */
	async function stage(tmpName: string, color: string): Promise<void> {
		await makeImage(`${stagingDir(USER_ID, KEY_DIR, ROOT)}/${tmpName}`, color);
	}

	test('a .tif retouch is ACCEPTED and lands in the retouched tier', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await stage('retouch1.tif', 'blue');

		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'retouch1.tif',
			extension: 'tif',
			quality: MODIFIED,
		});

		// No per-file error, and the raw master is on disk where it was asked for.
		expect(result.derivativeErrors).toEqual([]);
		expect(result.extension).toBe('tif');
		expect(existsSync(pathOf(identity, MODIFIED, 'tif'))).toBe(true);
		expect(await depicts(pathOf(identity, MODIFIED, 'tif'))).toBe('blue');
	});

	test('the raw .tif retouch is INDEXED by the scan (not stored invisibly)', async () => {
		const identity = nextIdentity();
		await stage('retouch2.tif', 'blue');

		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'retouch2.tif',
			extension: 'tif',
			quality: MODIFIED,
		});

		// scanFilesInfo walks every quality across the whole upload allowlist, so a
		// raw master needs no normalized twin to be visible to the record. If this
		// ever regresses, the retouch is stored but invisible — the same class of
		// defect as refusing it outright.
		const entry = result.filesInfo.find(
			(info) => info.quality === MODIFIED && info.extension === 'tif',
		);
		expect(entry).toBeDefined();
		expect(entry?.file_exist).toBe(true);
	});

	test('a retouch RE-ENCODES the derived tiers that ALREADY EXIST', async () => {
		const identity = nextIdentity();
		await makeImage(pathOf(identity, image.originalQuality, 'tif'), 'red');
		await regenerateImage(image, identity, pathOpts, 'tif');
		const derivedPath = pathOf(identity, DERIVED, image.defaultExtension);
		const thumbPath = pathOf(identity, config.media.thumb.quality, config.media.thumb.extension);
		expect(await depicts(derivedPath)).toBe('red');
		expect(await depicts(thumbPath)).toBe('red');

		await stage('retouch3.tif', 'blue');
		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'retouch3.tif',
			extension: 'tif',
			quality: MODIFIED,
		});

		expect(result.derivativeErrors).toEqual([]);
		// Decision 2: everything derived now depicts the retouch, overwritten in place.
		expect(await depicts(derivedPath)).toBe('blue');
		expect(await depicts(thumbPath)).toBe('blue');
		// The SVG envelope the edit view renders through exists too (without it the
		// client falls back to the placeholder and the image never shows).
		expect(existsSync(svgOverlayLocation(image, identity, pathOpts).absolutePath)).toBe(true);
	});

	test('a retouch does NOT overwrite the stored original_normalized_name cue', async () => {
		const identity = nextIdentity();
		await stage('retouch4.tif', 'blue');

		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: KEY_DIR,
			tmpName: 'retouch4.tif',
			extension: 'tif',
			quality: MODIFIED,
		});

		// The retouch takes the isOriginal=false branch: it stamps no original cue,
		// so a raw original recorded earlier survives in the index.
		expect(result.filesInfo.some((info) => info.quality === image.originalQuality)).toBe(false);
	});

	test('a .tif into a REAL derivative tier is still refused BEFORE the move', async () => {
		const identity = nextIdentity();
		await stage('shadowed.tif', 'blue');

		await expect(
			processUploadedFile({
				spec: image,
				identity,
				pathOpts,
				userId: USER_ID,
				keyDir: KEY_DIR,
				tmpName: 'shadowed.tif',
				extension: 'tif',
				quality: DERIVED,
			}),
		).rejects.toThrow(/would be shadowed/);
		// Refused before add_file moved anything: staging intact, media tree clean.
		expect(existsSync(`${stagingDir(USER_ID, KEY_DIR, ROOT)}/shadowed.tif`)).toBe(true);
		expect(existsSync(pathOf(identity, DERIVED, 'tif'))).toBe(false);
	});
});
