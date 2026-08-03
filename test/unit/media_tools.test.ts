/**
 * Phase E gate: the media tool CORES run real binaries against a scratch root,
 * and the tool server modules load with the expected apiActions + permission
 * gates. Full tool_request→handler→DB drive is ledgered (media not synced to
 * this box); the operations are gated here at the core level.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { getDimensions, resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import { extractPdfCore } from '../../src/core/media/tools/pdf_extract.ts';
import { applyRotationCore } from '../../src/core/media/tools/rotation.ts';
import {
	buildVersionCore,
	conformHeadersCore,
	deleteQualityCore,
	deleteVersionCore,
	getFilesInfoCore,
	rotateVersionCore,
} from '../../src/core/media/tools/versions.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';

const ROOT = `${tmpdir()}/dedalo_media_tools_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const pdf = mediaTypeOf('component_pdf')!;
const av = mediaTypeOf('component_av')!;
// S3-67: binary paths are CONFIG (config.media.binaries — env-overridable,
// platform-defaulted), never hardcoded workstation paths.
const BIN = config.media.binaries;
const HAVE_FFMPEG = existsSync(BIN.ffmpeg) && existsSync(BIN.qtFaststart);

/** Generate a tiny real mp4 (2s testsrc) so ffmpeg conform/probe run for real. */
async function makeMp4(relative: string): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary(
		[BIN.ffmpeg, '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10', abs],
		{ nice: false },
	);
}
const HAVE_MAGICK = existsSync(resolveMagick());
// gs is a TEST-FIXTURE generator only (not a Dédalo runtime binary — no
// config key); probe the platform candidates instead of one absolute path.
const GS_BIN =
	['/opt/homebrew/bin/gs', '/usr/local/bin/gs', '/usr/bin/gs'].find((p) => existsSync(p)) ?? 'gs';
const HAVE_GS = GS_BIN !== 'gs';
const identity: MediaIdentity = {
	componentTipo: 'rsc29',
	sectionTipo: 'rsc170',
	sectionId: 5,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

async function makeImage(relative: string, size: string): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary([resolveMagick(), '-size', size, 'xc:orange', abs], { nice: false });
}
async function makePdf(relative: string): Promise<void> {
	const abs = `${ROOT}${relative}`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary(
		[
			GS_BIN,
			'-q',
			'-dNOPAUSE',
			'-dBATCH',
			'-sDEVICE=pdfwrite',
			'-o',
			abs,
			'-c',
			'<< /PageSize [200 200] >> setpagedevice /Helvetica findfont 20 scalefont setfont 20 100 moveto (WORLD) show showpage',
		],
		{ nice: false },
	);
}

beforeAll(() => rmSync(ROOT, { recursive: true, force: true }));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('tool_media_versions core', () => {
	test.if(HAVE_MAGICK)(
		'build_version builds a tier from the original; the original is untouched',
		async () => {
			await makeImage('/image/original/rsc29_rsc170_5.jpg', '2000x1500');
			const before = await getDimensions(`${ROOT}/image/original/rsc29_rsc170_5.jpg`);
			const built = await buildVersionCore(image, identity, pathOpts, '1.5MB');
			expect(built.jobId).toBeNull();
			expect(built.built[0]).toContain('/image/1.5MB/rsc29_rsc170_5.jpg');
			// original unchanged
			const after = await getDimensions(`${ROOT}/image/original/rsc29_rsc170_5.jpg`);
			expect(after).toEqual(before);
			// files_info now sees original + 1.5MB
			const info = getFilesInfoCore(image, identity, pathOpts);
			expect(info.some((e) => e.quality === '1.5MB')).toBe(true);
		},
	);

	test.if(HAVE_MAGICK)('delete_version soft-deletes into deleted/', async () => {
		await makeImage('/image/6MB/rsc29_rsc170_5.jpg', '400x300');
		const moved = deleteVersionCore(image, identity, pathOpts, '6MB', 'jpg');
		expect(moved).toContain('/image/6MB/deleted/');
		expect(existsSync(`${ROOT}/image/6MB/rsc29_rsc170_5.jpg`)).toBe(false);
	});

	test.if(HAVE_MAGICK)('delete_quality removes every extension of a quality', async () => {
		const id9: MediaIdentity = { ...identity, sectionId: 9 };
		// Two extensions of the same quality (jpg default + png alternate) on disk.
		await makeImage('/image/1.5MB/rsc29_rsc170_9.jpg', '120x90');
		await makeImage('/image/1.5MB/rsc29_rsc170_9.png', '120x90');
		// Both are seen by the scanner before deletion.
		const before = getFilesInfoCore(image, id9, pathOpts).filter((e) => e.quality === '1.5MB');
		expect(before.map((e) => e.extension).sort()).toEqual(['jpg', 'png']);
		// delete_quality moves BOTH into deleted/.
		const moved = deleteQualityCore(image, id9, pathOpts, '1.5MB');
		expect(moved.length).toBe(2);
		expect(existsSync(`${ROOT}/image/1.5MB/rsc29_rsc170_9.jpg`)).toBe(false);
		expect(existsSync(`${ROOT}/image/1.5MB/rsc29_rsc170_9.png`)).toBe(false);
		expect(getFilesInfoCore(image, id9, pathOpts).some((e) => e.quality === '1.5MB')).toBe(false);
	});

	test.if(HAVE_MAGICK)(
		'rotate (media_versions) rotates only the named quality, never the original',
		async () => {
			const id10: MediaIdentity = { ...identity, sectionId: 10 };
			await makeImage('/image/original/rsc29_rsc170_10.jpg', '400x300');
			await makeImage('/image/1.5MB/rsc29_rsc170_10.jpg', '400x300');
			const origBefore = await getDimensions(`${ROOT}/image/original/rsc29_rsc170_10.jpg`);
			const outcome = await rotateVersionCore(image, id10, pathOpts, '1.5MB', 90);
			expect(outcome.result).toBe(true);
			expect(outcome.errors).toEqual([]);
			// the named tier swapped W/H; the original is untouched (Original law).
			const webAfter = await getDimensions(`${ROOT}/image/1.5MB/rsc29_rsc170_10.jpg`);
			expect(Math.abs(webAfter.width - 300)).toBeLessThanOrEqual(2);
			expect(await getDimensions(`${ROOT}/image/original/rsc29_rsc170_10.jpg`)).toEqual(origBefore);
		},
	);

	test('rotate rejects a non-image model, conform_headers a non-av model', async () => {
		await expect(rotateVersionCore(av, identity, pathOpts, '404', 90)).rejects.toThrow(
			/only supported/,
		);
		await expect(conformHeadersCore(image, identity, pathOpts, '1.5MB')).rejects.toThrow(
			/only supported/,
		);
	});

	test.if(HAVE_FFMPEG)(
		'conform_headers remuxes the av quality and preserves the original as *_untouched',
		async () => {
			const avId: MediaIdentity = {
				componentTipo: 'rsc35',
				sectionTipo: 'rsc167',
				sectionId: 7,
				lang: null,
			};
			await makeMp4('/av/404/rsc35_rsc167_7.mp4');
			const ok = await conformHeadersCore(av, avId, pathOpts, '404');
			expect(ok).toBe(true);
			// the conformed file remains at the source path…
			expect(existsSync(`${ROOT}/av/404/rsc35_rsc167_7.mp4`)).toBe(true);
			// …and the pre-conform file is preserved untouched, temp cleaned up.
			expect(existsSync(`${ROOT}/av/404/rsc35_rsc167_7_untouched.mp4`)).toBe(true);
			expect(existsSync(`${ROOT}/av/404/rsc35_rsc167_7_temp.mp4`)).toBe(false);
		},
	);
});

describe('tool_image_rotation core', () => {
	test.if(HAVE_MAGICK)('rotates non-original tiers, never the original', async () => {
		await makeImage('/image/original/rsc29_rsc170_8.jpg', '400x300');
		await makeImage('/image/1.5MB/rsc29_rsc170_8.jpg', '400x300');
		const id8: MediaIdentity = { ...identity, sectionId: 8 };
		const origBefore = await getDimensions(`${ROOT}/image/original/rsc29_rsc170_8.jpg`);
		const result = await applyRotationCore(
			image,
			id8,
			pathOpts,
			[
				{ quality: 'original', extension: 'jpg', file_exist: true },
				{ quality: '1.5MB', extension: 'jpg', file_exist: true },
			],
			{ degrees: 90, mode: 'expanded' },
		);
		expect(result.errors).toEqual([]);
		expect(result.rotated.some((p) => p.includes('1.5MB'))).toBe(true);
		expect(result.rotated.some((p) => p.includes('original'))).toBe(false); // original untouched
		// the 1.5MB tier swapped W/H after a 90° expanded rotate (±2px distort
		// interpolation padding — realistic parity, not byte-equality).
		const webAfter = await getDimensions(`${ROOT}/image/1.5MB/rsc29_rsc170_8.jpg`);
		expect(Math.abs(webAfter.width - 300)).toBeLessThanOrEqual(2);
		expect(Math.abs(webAfter.height - 400)).toBeLessThanOrEqual(2);
		// original dims unchanged
		expect(await getDimensions(`${ROOT}/image/original/rsc29_rsc170_8.jpg`)).toEqual(origBefore);
	});

	// The client (render_tool_image_crop.update_crop_area) sends crop_area in
	// PIXELS of the default-quality file it previews. MEDIA_SPEC §tools: the crop
	// is "proportional […] computed from the default-quality reference
	// dimensions" — so the box must be divided by the reference dims and
	// re-scaled per tier, never fed to ImageMagick as if it were a 0..1 fraction.
	test.if(HAVE_MAGICK)('crops every non-original tier from default-quality pixels', async () => {
		const id11: MediaIdentity = { ...identity, sectionId: 11 };
		await makeImage('/image/original/rsc29_rsc170_11.jpg', '800x600');
		await makeImage(`/image/${image.defaultQuality}/rsc29_rsc170_11.jpg`, '400x300');
		await makeImage('/image/thumb/rsc29_rsc170_11.jpg', '200x150');
		const result = await applyRotationCore(
			image,
			id11,
			pathOpts,
			[
				{ quality: 'original', extension: 'jpg', file_exist: true },
				{ quality: image.defaultQuality, extension: 'jpg', file_exist: true },
				{ quality: 'thumb', extension: 'jpg', file_exist: true },
			],
			// left half / top half of the 400x300 reference tier
			{ degrees: 0, cropArea: { x: 0, y: 0, width: 200, height: 150 } },
		);
		expect(result.errors).toEqual([]);
		expect(result.cropped.some((p) => p.includes('original'))).toBe(false); // original untouched
		expect(await getDimensions(`${ROOT}/image/original/rsc29_rsc170_11.jpg`)).toEqual({
			width: 800,
			height: 600,
		});
		// reference tier: exactly the requested pixel box
		expect(
			await getDimensions(`${ROOT}/image/${image.defaultQuality}/rsc29_rsc170_11.jpg`),
		).toEqual({ width: 200, height: 150 });
		// thumb tier: the SAME proportion of its own (smaller) dimensions
		expect(await getDimensions(`${ROOT}/image/thumb/rsc29_rsc170_11.jpg`)).toEqual({
			width: 100,
			height: 75,
		});
	});

	// A box outside the reference frame is a caller bug, and ImageMagick would
	// answer it by silently clamping to a full-frame no-op. Refuse loudly.
	test.if(HAVE_MAGICK)('refuses a crop box outside the reference frame', async () => {
		const id12: MediaIdentity = { ...identity, sectionId: 12 };
		await makeImage(`/image/${image.defaultQuality}/rsc29_rsc170_12.jpg`, '400x300');
		const result = await applyRotationCore(
			image,
			id12,
			pathOpts,
			[{ quality: image.defaultQuality, extension: 'jpg', file_exist: true }],
			{ degrees: 0, cropArea: { x: 380, y: 10, width: 200, height: 150 } },
		);
		expect(result.cropped).toEqual([]);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0]).toMatch(/falls outside/);
		// the tier is left exactly as it was
		expect(
			await getDimensions(`${ROOT}/image/${image.defaultQuality}/rsc29_rsc170_12.jpg`),
		).toEqual({ width: 400, height: 300 });
	});
});

describe('tool_pdf_extractor core', () => {
	test.if(HAVE_GS)('extracts text from the web-quality PDF', async () => {
		await makePdf('/pdf/web/rsc37_rsc176_5.pdf');
		const text = await extractPdfCore(
			pdf,
			{ componentTipo: 'rsc37', sectionTipo: 'rsc176', sectionId: 5, lang: null },
			pathOpts,
			{ method: 'text' },
		);
		expect(text).toContain('WORLD');
	});
});

/**
 * Handler-level ARGUMENT VALIDATION for the destructive media actions (audit
 * 2026-07-28). Every one of these resolves its media context from the DB and
 * then bails BEFORE touching the filesystem, so the drive is read-only — which
 * is exactly the property being pinned: a malformed destructive request must
 * fail on the argument, never half-run. The gates themselves are declarative
 * and asserted in the surface test below.
 */
describe('media tool handlers reject malformed destructive requests', () => {
	const principal: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
	const IMAGE = { tipo: 'rsc29', section_tipo: 'rsc170', section_id: 1 };
	const AV = { tipo: 'rsc35', section_tipo: 'rsc167', section_id: 1 };

	async function drive(
		toolName: string,
		action: string,
		options: Record<string, unknown>,
	): Promise<{ result: unknown; msg: string }> {
		const loaded = await getLoadedTool(toolName);
		const spec = loaded?.module.apiActions[action];
		if (spec === undefined) throw new Error(`missing action ${toolName}.${action}`);
		return spec.handler({ principal, userId: -1, options, background: false });
	}

	test('tool_media_versions: a delete without a quality is refused', async () => {
		expect((await drive('tool_media_versions', 'delete_quality', IMAGE)).msg).toBe(
			'delete_quality: missing quality',
		);
		expect((await drive('tool_media_versions', 'delete_version', IMAGE)).msg).toBe(
			'delete_version: missing quality',
		);
	});

	test('tool_media_versions: conform_headers without a quality is refused', async () => {
		expect((await drive('tool_media_versions', 'conform_headers', AV)).msg).toBe(
			'conform_headers: missing quality',
		);
	});

	test('tool_media_versions: rotate needs both a quality and finite degrees', async () => {
		expect((await drive('tool_media_versions', 'rotate', IMAGE)).msg).toBe(
			'rotate: missing quality',
		);
		expect((await drive('tool_media_versions', 'rotate', { ...IMAGE, quality: '1.5MB' })).msg).toBe(
			'rotate: missing degrees',
		);
		expect(
			(await drive('tool_media_versions', 'rotate', { ...IMAGE, quality: '1.5MB', degrees: 'x' }))
				.msg,
		).toBe('rotate: invalid degrees');
	});

	test('every media_versions action refuses a non-media component', async () => {
		for (const action of [
			'get_files_info',
			'build_version',
			'sync_files',
			'delete_version',
			'delete_quality',
			'conform_headers',
			'rotate',
		]) {
			// rsc36 is a component_text_area — the media context resolve must refuse it.
			const response = await drive('tool_media_versions', action, {
				tipo: 'rsc36',
				section_tipo: 'rsc167',
				section_id: 1,
				quality: '1.5MB',
				degrees: 90,
			});
			expect(response.result).toBe(false);
			expect(response.msg).toContain('is not a media component');
		}
	});

	test('tool_image_rotation refuses a non-image component before any write', async () => {
		const response = await drive('tool_image_rotation', 'apply_rotation', {
			...AV,
			rotation_degrees: 90,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toBe('rotation is image-only');
	});
});

describe('media tool server modules load with the right surface', () => {
	test('tool_media_versions exposes the versions actions with record gates', async () => {
		const loaded = await getLoadedTool('tool_media_versions');
		expect(loaded).toBeDefined();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual(
			[
				'build_version',
				'conform_headers',
				'delete_quality',
				'delete_version',
				'get_files_info',
				'rotate',
				'sync_files',
			].sort(),
		);
		expect(actions.build_version!.permission).toBe('record_tipo');
		expect(actions.build_version!.minLevel).toBe(2);
		expect(actions.get_files_info!.minLevel).toBe(1);
		// component-specific mutations are WRITE-gated like the rest.
		expect(actions.conform_headers!.minLevel).toBe(2);
		expect(actions.rotate!.minLevel).toBe(2);
		// build_version is the ONLY background-runnable action: the gate runs
		// before the fork, so anything added here must stay permission-gated.
		expect(loaded!.module.backgroundRunnable).toEqual(['build_version']);
		// every mutating action is level 2; only the read is level 1.
		for (const action of [
			'build_version',
			'sync_files',
			'delete_version',
			'delete_quality',
			'conform_headers',
			'rotate',
		]) {
			expect(actions[action]?.permission).toBe('record_tipo');
			expect(actions[action]?.minLevel).toBe(2);
		}
	});

	test('tool_image_rotation + tool_pdf_extractor load', async () => {
		const rot = await getLoadedTool('tool_image_rotation');
		expect(rot?.module.apiActions.apply_rotation?.minLevel).toBe(2);
		expect(rot?.module.apiActions.apply_rotation?.permission).toBe('record_tipo');
		expect(rot?.module.backgroundRunnable).toBeUndefined();
		const pdfTool = await getLoadedTool('tool_pdf_extractor');
		expect(pdfTool?.module.apiActions.get_pdf_data?.permission).toBe('record_tipo');
		expect(pdfTool?.module.apiActions.get_pdf_data?.minLevel).toBe(1);
	});
});
