/**
 * Phase D gate: the ingest pipeline (staging → add_file SEC-063 → regenerate →
 * files_info) with a REAL image, and the supervised job manager (concurrency
 * cap, progress, stop, status frames). Scratch media root — never the shared dir.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { addFile, sanitizeSegment, stagingDir } from '../../src/core/media/ingest/add_file.ts';
import { processUploadedFile } from '../../src/core/media/ingest/process_uploaded_file.ts';
import { MediaJobManager, mediaJobs } from '../../src/core/media/jobs.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	buildMediaLocation,
} from '../../src/core/media/path.ts';

const ROOT = `${tmpdir()}/dedalo_media_ingest_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const av = mediaTypeOf('component_av')!;
const HAVE_MAGICK = existsSync(resolveMagick());
const HAVE_FFMPEG = Bun.which(config.media.binaries.ffmpeg) !== null;
const identity: MediaIdentity = {
	componentTipo: 'rsc29',
	sectionTipo: 'rsc170',
	sectionId: 42,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: 1000, mediaRoot: ROOT };
const USER_ID = 7;

/** Stage a real jpg in the upload tmp dir and return its tmp name. */
async function stageImage(tmpName: string, size = '2500x1800'): Promise<void> {
	const dir = stagingDir(USER_ID, 'kd1', ROOT);
	mkdirSync(dir, { recursive: true });
	await runBinary([resolveMagick(), '-size', size, 'xc:green', `${dir}/${tmpName}`], {
		nice: false,
	});
}

/** Stage a real tiny 16x9 mp4 (via ffmpeg lavfi) in the upload tmp dir. */
async function stageVideo(tmpName: string): Promise<void> {
	const dir = stagingDir(USER_ID, 'kdav', ROOT);
	mkdirSync(dir, { recursive: true });
	// 320x180 (16:9), 1s, silent stereo track so the audio derivative has a stream.
	await runBinary(
		[
			config.media.binaries.ffmpeg,
			'-y',
			'-f',
			'lavfi',
			'-i',
			'testsrc=duration=1:size=320x180:rate=10',
			'-f',
			'lavfi',
			'-i',
			'anullsrc=r=44100:cl=stereo',
			'-t',
			'1',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-c:a',
			'aac',
			'-shortest',
			`${dir}/${tmpName}`,
		],
		{ nice: false },
	);
}

/** Stage a real tiny 16x9 mp4 with NO audio stream (video-only). */
async function stageSilentVideo(tmpName: string): Promise<void> {
	const dir = stagingDir(USER_ID, 'kdav', ROOT);
	mkdirSync(dir, { recursive: true });
	await runBinary(
		[
			config.media.binaries.ffmpeg,
			'-y',
			'-f',
			'lavfi',
			'-i',
			'testsrc=duration=1:size=320x180:rate=10',
			'-t',
			'1',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			`${dir}/${tmpName}`,
		],
		{ nice: false },
	);
}

/** Poll a media job to a terminal state (or timeout). */
async function awaitJob(jobId: string): Promise<void> {
	for (let i = 0; i < 240; i++) {
		const s = mediaJobs.status(jobId)?.status;
		if (s !== 'queued' && s !== 'running') return;
		await new Promise((r) => setTimeout(r, 250));
	}
}

beforeAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('add_file (SEC-063 confinement)', () => {
	test('sanitizeSegment blocks traversal / bad charset', () => {
		expect(sanitizeSegment('abc.jpg')).toBe('abc.jpg');
		expect(() => sanitizeSegment('../etc')).toThrow();
		expect(() => sanitizeSegment('a/b')).toThrow();
		expect(() => sanitizeSegment('..')).toThrow();
	});

	test('stagingDir confines under the upload root', () => {
		const dir = stagingDir(USER_ID, 'kd1', ROOT);
		expect(dir).toContain(`${config.media.upload.tmpSubdir}/${USER_ID}/kd1`);
		expect(() => stagingDir(USER_ID, '../../escape', ROOT)).toThrow();
	});

	test('the ROOT user (id -1) is a valid staging owner', () => {
		// Regression: root's userId is -1 (PHP logged_user_id()); the old
		// `userId <= 0` guard rejected it, so EVERY root upload failed 400
		// ("Invalid user id for staging dir"). Negative ids are valid; only
		// non-integers and 0 are refused.
		const dir = stagingDir(-1, 'kd1', ROOT);
		expect(dir).toContain(`${config.media.upload.tmpSubdir}/-1/kd1`);
		expect(() => stagingDir(0, 'kd1', ROOT)).toThrow();
		expect(() => stagingDir(1.5, 'kd1', ROOT)).toThrow();
	});

	test.if(HAVE_MAGICK)('moves the staged file into the original tier', async () => {
		await stageImage('up1.jpg');
		const result = addFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER_ID,
			keyDir: 'kd1',
			tmpName: 'up1.jpg',
			extension: 'jpg',
		});
		expect(result.originalFilePath).toContain('/image/original/0/rsc29_rsc170_42.jpg');
		expect(existsSync(result.originalFilePath)).toBe(true);
	});
});

describe('processUploadedFile (ingest → derivatives → files_info)', () => {
	test.if(HAVE_MAGICK)('image ingest builds derivatives and returns files_info', async () => {
		await stageImage('up2.jpg', '2500x1800');
		const id2: MediaIdentity = { ...identity, sectionId: 43 };
		const result = await processUploadedFile({
			spec: image,
			identity: id2,
			pathOpts,
			userId: USER_ID,
			keyDir: 'kd1',
			tmpName: 'up2.jpg',
			extension: 'jpg',
		});
		expect(result.jobId).toBeNull(); // image is synchronous
		const qualities = new Set(result.filesInfo.map((e) => e.quality));
		expect(qualities.has('original')).toBe(true);
		expect(qualities.has('1.5MB')).toBe(true);
		expect(qualities.has('thumb')).toBe(true);
		// every entry points at a real file
		for (const e of result.filesInfo) {
			expect(existsSync(`${ROOT}${e.file_path}`)).toBe(true);
		}
	});

	test.if(HAVE_FFMPEG)(
		'av ingest transcodes the default derivative into a freshly-created tier dir',
		async () => {
			// Regression: submitAvTranscode wrote the two-pass passlog + output into
			// the quality tier dir (e.g. av/404/0/) WITHOUT creating it first — only
			// the original tier existed (addFile made it). ffmpeg pass 1 then died with
			// "ratecontrol_init: can't open stats file", so NO derivative was produced
			// and the client (which defaults to quality '404') showed no video.
			await stageVideo('upav.mp4');
			const idAv: MediaIdentity = {
				componentTipo: 'test94',
				sectionTipo: 'test3',
				sectionId: 44,
				lang: null,
			};
			const result = await processUploadedFile({
				spec: av,
				identity: idAv,
				pathOpts,
				userId: USER_ID,
				keyDir: 'kdav',
				tmpName: 'upav.mp4',
				extension: 'mp4',
			});
			expect(result.jobId).not.toBeNull(); // av transcode is async

			await awaitJob(result.jobId as string);
			const job = mediaJobs.status(result.jobId as string);
			expect(job?.errors ?? ['no job']).toEqual([]);
			expect(job?.status).toBe('done');

			// The default-quality derivative exists → the tier dir was created.
			const q404 = buildMediaLocation(
				av,
				idAv,
				av.defaultQuality,
				av.defaultExtension,
				pathOpts,
			).absolutePath;
			expect(existsSync(q404)).toBe(true);
			// No two-pass passlog scratch left littering the media tree.
			expect(existsSync(`${q404}.passlog-0.log`)).toBe(false);
			expect(existsSync(`${q404}.passlog-0.log.mbtree`)).toBe(false);
		},
	);

	test.if(HAVE_FFMPEG)(
		'av ingest of a SILENT (no-audio) source still succeeds (skips the audio tier)',
		async () => {
			// Regression: extractAudio on a video-only source makes ffmpeg emit
			// "Output file does not contain any stream" and exit non-zero. Letting
			// that throw failed the WHOLE transcode job even though the video
			// derivative was built — the client then saw a failed job and never
			// played the (existing) video. A silent source must transcode the video
			// tier and simply skip audio.
			await stageSilentVideo('upsilent.mp4');
			const idAv: MediaIdentity = {
				componentTipo: 'test94',
				sectionTipo: 'test3',
				sectionId: 45,
				lang: null,
			};
			const result = await processUploadedFile({
				spec: av,
				identity: idAv,
				pathOpts,
				userId: USER_ID,
				keyDir: 'kdav',
				tmpName: 'upsilent.mp4',
				extension: 'mp4',
			});
			await awaitJob(result.jobId as string);
			const job = mediaJobs.status(result.jobId as string);
			expect(job?.errors ?? ['no job']).toEqual([]);
			expect(job?.status).toBe('done');

			// Video tier built; audio tier skipped (no audio to extract).
			const q404 = buildMediaLocation(
				av,
				idAv,
				av.defaultQuality,
				av.defaultExtension,
				pathOpts,
			).absolutePath;
			const audio = buildMediaLocation(
				av,
				idAv,
				'audio',
				av.defaultExtension,
				pathOpts,
			).absolutePath;
			expect(existsSync(q404)).toBe(true);
			expect(existsSync(audio)).toBe(false);
		},
	);
});

describe('job manager (supervised, capped, cancellable)', () => {
	test('runs a job to completion with progress + status frame', async () => {
		let tick = 0;
		const mgr = new MediaJobManager(2, () => {
			tick += 10;
			return tick;
		});
		const rec = mgr.submit('probe', async ({ onProgress }) => {
			onProgress(50);
			return { ok: true };
		});
		expect(rec.status).toBe('queued');
		// let the microtask/worker run
		await new Promise((r) => setTimeout(r, 20));
		const done = mgr.status(rec.id)!;
		expect(done.status).toBe('done');
		expect(done.data).toEqual({ ok: true });
		const frame = mgr.frame(rec.id)!;
		expect(frame.is_running).toBe(false);
		expect(frame.pfile).toContain(`${rec.id}.json`);
	});

	test('concurrency cap: only N run at once', async () => {
		const mgr = new MediaJobManager(2, () => 0);
		let concurrent = 0;
		let maxConcurrent = 0;
		const gate = (): Promise<unknown> =>
			new Promise((resolve) => {
				concurrent++;
				maxConcurrent = Math.max(maxConcurrent, concurrent);
				setTimeout(() => {
					concurrent--;
					resolve({ done: true });
				}, 15);
			});
		const jobs = Array.from({ length: 5 }, () => mgr.submit('slow', gate));
		await new Promise((r) => setTimeout(r, 120));
		expect(maxConcurrent).toBeLessThanOrEqual(2);
		for (const j of jobs) expect(mgr.status(j.id)!.status).toBe('done');
	});

	test('stop() cancels a running job', async () => {
		const mgr = new MediaJobManager(1, () => 0);
		const rec = mgr.submit(
			'cancellable',
			({ signal }) =>
				new Promise((resolve, reject) => {
					const timer = setTimeout(() => resolve({ finished: true }), 200);
					signal.addEventListener('abort', () => {
						clearTimeout(timer);
						reject(new Error('aborted'));
					});
				}),
		);
		await new Promise((r) => setTimeout(r, 10));
		expect(mgr.stop(rec.id)).toBe(true);
		await new Promise((r) => setTimeout(r, 20));
		expect(mgr.status(rec.id)!.status).toBe('stopped');
	});
});
