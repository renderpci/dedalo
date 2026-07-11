/**
 * R1 gate: tool_posterframe. The media CORE extracts a frame from a scratch AV
 * (real ffmpeg) into the image original path and regenerates image derivatives
 * (real ImageMagick); audio-only sources yield no frame. The tool module loads
 * with both actions. The DB portal-create + inverse-reference walk are ledgered
 * (media/DB not synced here), matching the media_tools.test.ts convention.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { stagingDir } from '../../src/core/media/ingest/add_file.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import {
	createAvPosterframe,
	createIdentifyingImageCore,
	deletePosterframe,
	getAvMediaStreams,
	moveUploadedToMediaDir,
	posterframeAbsolutePath,
} from '../../src/core/media/tools/posterframe.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const ROOT = `${tmpdir()}/dedalo_posterframe_${process.pid}`;
const av = mediaTypeOf('component_av')!;
const image = mediaTypeOf('component_image')!;
const HAVE_FFMPEG = existsSync(config.media.binaries.ffmpeg);
const HAVE_MAGICK = existsSync(resolveMagick());
const HAVE_BOTH = HAVE_FFMPEG && HAVE_MAGICK;

const avIdentity: MediaIdentity = {
	componentTipo: 'rsc439',
	sectionTipo: 'rsc170',
	sectionId: 8,
	lang: null,
};
const imageIdentity: MediaIdentity = {
	componentTipo: 'rsc29',
	sectionTipo: 'rsc200',
	sectionId: 3,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

async function makeAv(name: string, withVideo: boolean): Promise<void> {
	const abs = `${ROOT}/av/original/${name}.mp4`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	const argv = withVideo
		? [
				config.media.binaries.ffmpeg,
				'-y',
				'-f',
				'lavfi',
				'-i',
				'testsrc=size=320x240:duration=1',
				'-f',
				'lavfi',
				'-i',
				'sine=frequency=440:duration=1',
				'-shortest',
				abs,
			]
		: [
				config.media.binaries.ffmpeg,
				'-y',
				'-f',
				'lavfi',
				'-i',
				'sine=frequency=440:duration=1',
				'-c:a',
				'aac',
				abs,
			];
	await runBinary(argv, { nice: false });
}

const avCtx = () => ({ spec: av, identity: avIdentity, pathOpts });
const imageCtx = () => ({ spec: image, identity: imageIdentity, pathOpts });

beforeAll(() => rmSync(ROOT, { recursive: true, force: true }));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('tool_posterframe core', () => {
	test.if(HAVE_BOTH)(
		'extracts a frame into the image original + regenerates derivatives',
		async () => {
			await makeAv('rsc439_rsc170_8', true);
			const out = await createIdentifyingImageCore(avCtx(), imageCtx(), '00:00:00');
			expect(out.created).toBe(true);
			expect(out.posterframePath).toContain('/image/original/rsc29_rsc200_3.jpg');
			expect(existsSync(out.posterframePath as string)).toBe(true);
			// derivatives were scanned (at least the original tier is present)
			expect(out.filesInfo.some((e) => e.quality === 'original')).toBe(true);
		},
	);

	test.if(HAVE_FFMPEG)('audio-only source yields no frame (created:false)', async () => {
		await makeAv('rsc439_rsc170_8', false);
		rmSync(`${ROOT}/image`, { recursive: true, force: true });
		const out = await createIdentifyingImageCore(avCtx(), imageCtx(), '00:00:00');
		expect(out.created).toBe(false);
		expect(out.posterframePath).toBeNull();
	});

	test('rejects a non-av source / non-image target', async () => {
		await expect(createIdentifyingImageCore(imageCtx(), imageCtx(), '0')).rejects.toThrow(
			/component_av/,
		);
		await expect(createIdentifyingImageCore(avCtx(), avCtx(), '0')).rejects.toThrow(
			/component_image/,
		);
	});
});

describe('component_av posterframe (the tool_posterframe primary path)', () => {
	// This is the create/delete-posterframe path dd_component_av_api serves — the
	// tool's main two buttons. Distinct from the identifying-image (portal) path.
	test.if(HAVE_BOTH)(
		'creates the posterframe under av/posterframe + regenerates the thumb',
		async () => {
			rmSync(ROOT, { recursive: true, force: true });
			await makeAv('rsc439_rsc170_8', true);
			const ok = await createAvPosterframe(avCtx(), '00:00:00');
			expect(ok).toBe(true);
			const target = posterframeAbsolutePath(av, avIdentity, pathOpts);
			expect(target).toContain('/av/posterframe/rsc439_rsc170_8.jpg');
			expect(existsSync(target)).toBe(true);
			// PHP create_posterframe → create_thumb: the thumb is derived from it.
			expect(
				existsSync(
					`${ROOT}/av/${config.media.thumb.quality}/rsc439_rsc170_8.${config.media.thumb.extension}`,
				),
			).toBe(true);
		},
	);

	test.if(HAVE_FFMPEG)('audio-only source yields no posterframe (result:false)', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		await makeAv('rsc439_rsc170_8', false);
		const ok = await createAvPosterframe(avCtx(), '00:00:00');
		expect(ok).toBe(false);
		expect(existsSync(posterframeAbsolutePath(av, avIdentity, pathOpts))).toBe(false);
	});

	test('missing source returns false (never throws)', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		expect(await createAvPosterframe(avCtx(), '0')).toBe(false);
	});

	test.if(HAVE_BOTH)(
		'a timecode past the source duration is clamped to a valid frame (short/truncated video)',
		async () => {
			rmSync(ROOT, { recursive: true, force: true });
			await makeAv('rsc439_rsc170_8', true); // 1-second source
			// Request a frame 30s in — far past EOF. ffmpeg input-seeking (`-ss` before
			// `-i`) past the end yields NO frame → the mjpeg encoder errors and the whole
			// extraction fails. createPosterframe clamps the seek into range, so a poster
			// is still produced instead of silently failing (the tool_posterframe report).
			const ok = await createAvPosterframe(avCtx(), '30');
			expect(ok).toBe(true);
			expect(existsSync(posterframeAbsolutePath(av, avIdentity, pathOpts))).toBe(true);
		},
	);

	test.if(HAVE_BOTH)('delete removes the posterframe; a second delete returns false', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		await makeAv('rsc439_rsc170_8', true);
		await createAvPosterframe(avCtx(), '00:00:00');
		expect(deletePosterframe(avCtx())).toBe(true);
		expect(existsSync(posterframeAbsolutePath(av, avIdentity, pathOpts))).toBe(false);
		expect(deletePosterframe(avCtx())).toBe(false);
	});

	test('rejects an unsupported model', () => {
		expect(() => deletePosterframe(imageCtx())).toThrow(/component_av or component_3d/);
	});
});

describe('component_3d posterframe (move staged upload + delete)', () => {
	// The 3D "create posterframe" path: the client renders a canvas snapshot,
	// uploads it to the staging tree, then move_file_to_dir binds it to the record.
	const threeD = mediaTypeOf('component_3d')!;
	const tdIdentity: MediaIdentity = {
		componentTipo: 'rsc36',
		sectionTipo: 'rsc170',
		sectionId: 8,
		lang: null,
	};
	const tdCtx = () => ({ spec: threeD, identity: tdIdentity, pathOpts });
	const USER = 42;

	async function stageJpg(tmpName: string): Promise<void> {
		const dir = stagingDir(USER, '3d', ROOT);
		mkdirSync(dir, { recursive: true });
		await runBinary(
			[
				config.media.binaries.ffmpeg,
				'-y',
				'-f',
				'lavfi',
				'-i',
				'color=c=red:s=64x64:d=1',
				'-frames:v',
				'1',
				`${dir}/${tmpName}`,
			],
			{ nice: false },
		);
	}

	test.if(HAVE_BOTH)(
		'moves the staged snapshot into 3d/posterframe + regenerates the thumb',
		async () => {
			rmSync(ROOT, { recursive: true, force: true });
			await stageJpg('up_abc.jpg');
			const ok = await moveUploadedToMediaDir({
				ctx: tdCtx(),
				userId: USER,
				keyDir: '3d',
				tmpName: 'up_abc.jpg',
				fileName: 'rsc36_rsc170_8.jpg',
				targetDir: 'posterframe',
			});
			expect(ok).toBe(true);
			const target = posterframeAbsolutePath(threeD, tdIdentity, pathOpts);
			expect(target).toContain('/3d/posterframe/rsc36_rsc170_8.jpg');
			expect(existsSync(target)).toBe(true);
			// staged source consumed by the move
			expect(existsSync(`${stagingDir(USER, '3d', ROOT)}/up_abc.jpg`)).toBe(false);
			// thumb derived from the posterframe
			expect(
				existsSync(
					`${ROOT}/3d/${config.media.thumb.quality}/rsc36_rsc170_8.${config.media.thumb.extension}`,
				),
			).toBe(true);
		},
	);

	test('missing staged source returns false', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		const ok = await moveUploadedToMediaDir({
			ctx: tdCtx(),
			userId: USER,
			keyDir: '3d',
			tmpName: 'nope.jpg',
			fileName: 'rsc36_rsc170_8.jpg',
			targetDir: 'posterframe',
		});
		expect(ok).toBe(false);
	});

	test('rejects a traversal tmp_name (fail-closed)', async () => {
		await expect(
			moveUploadedToMediaDir({
				ctx: tdCtx(),
				userId: USER,
				keyDir: '3d',
				tmpName: '../../etc/passwd',
				fileName: 'rsc36_rsc170_8.jpg',
				targetDir: 'posterframe',
			}),
		).rejects.toThrow();
	});

	test.if(HAVE_BOTH)(
		'delete removes the 3D posterframe; a second delete returns false',
		async () => {
			rmSync(ROOT, { recursive: true, force: true });
			await stageJpg('up_del.jpg');
			await moveUploadedToMediaDir({
				ctx: tdCtx(),
				userId: USER,
				keyDir: '3d',
				tmpName: 'up_del.jpg',
				fileName: 'rsc36_rsc170_8.jpg',
				targetDir: 'posterframe',
			});
			expect(deletePosterframe(tdCtx())).toBe(true);
			expect(deletePosterframe(tdCtx())).toBe(false);
		},
	);
});

describe('component_av get_media_streams (player render path)', () => {
	// The AV player edit view calls this on every render; the tool can't open
	// without it (PHP dd_component_av_api::get_media_streams → ffprobe).
	test.if(HAVE_FFMPEG)('probes the streams of an existing quality file', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		await makeAv('rsc439_rsc170_8', true);
		const probe = await getAvMediaStreams(avCtx(), 'original');
		expect(probe).not.toBeNull();
		expect(Array.isArray(probe!.streams)).toBe(true);
		expect(probe!.streams.some((s) => (s as { codec_type?: string }).codec_type === 'video')).toBe(
			true,
		);
	});

	test('returns null when no file exists at the quality (client degrades to [])', async () => {
		rmSync(ROOT, { recursive: true, force: true });
		expect(await getAvMediaStreams(avCtx(), 'original')).toBeNull();
	});

	test('rejects a non-av context', async () => {
		await expect(getAvMediaStreams(imageCtx())).rejects.toThrow(/component_av/);
	});
});

describe('tool_posterframe module', () => {
	test('loads with both actions gated at record level', async () => {
		const loaded = await getLoadedTool('tool_posterframe');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'create_identifying_image',
			'get_ar_identifying_image',
		]);
		expect(mustGet(actions.create_identifying_image, 'create_identifying_image').permission).toBe(
			'record',
		);
		expect(mustGet(actions.get_ar_identifying_image, 'get_ar_identifying_image').permission).toBe(
			'record',
		);
	});
});
