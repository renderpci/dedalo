/**
 * CONVERTER ADMISSION — BEHAVIOURAL (audit MEDIA-01, the PLURAL half).
 *
 * `magick_policy_tripwire` asserts the SHAPE: every pixel converter spawns inside
 * `withConverterSlot`, the exemptions are enumerated, `magickPolicyEnv` names a
 * spill directory. Shape is not effect. This gate runs the real admission logic
 * and the real binaries and asserts the two statements the finding is about:
 *
 *   1. K CONCURRENT CONVERSIONS ARE NOT K CONCURRENT DECODES. Measured on the
 *      shipped defaults before this landed: one 2.4 MB 20000x20000 TIFF spent the
 *      whole `-limit disk` budget (16 GiB apparent / 8.2 GiB real) over 22 s on
 *      the authenticated upload request, and two at once held 16 GiB of real disk
 *      simultaneously — the per-process bound multiplied by K is not a bound. The
 *      pool never lets more than its limit decode at once, grants every waiter,
 *      releases on failure, and REFUSES (rate.limited, 429, retryable) rather
 *      than holding a request lane forever.
 *   2. THE SPILL HAS A CHOSEN FILESYSTEM. `-limit disk` budgets the spill, it does
 *      not prevent it, and ImageMagick picks the filesystem from MAGICK_TMPDIR —
 *      unset, the OS temp dir, which on both shipped compose stacks is the volume
 *      the DATABASE lives on. This gate WATCHES the cache files appear in the
 *      directory `magickPolicyEnv()` names, with a control run that has the
 *      variable stripped, so the redirection is observed and not assumed.
 *
 *   3. A HEADER READ IS BOUNDED TOO, and takes a permit like everything else.
 *      `-ping` was exempted from admission on the ground that it costs ~12 ms.
 *      That is true of a single-scene file and false in general: `-ping` skips the
 *      PIXELS and still ENUMERATES EVERY SCENE, so a 4.6 MB GIF of 200000 1x1
 *      frames cost the upload preview's own argv 26.3 s / 8.73 GB RSS with every
 *      pixel-cache limit armed, and four concurrent probes were four concurrent
 *      identify processes. Both halves are asserted against the REAL
 *      `probeImageSource`: the sequence ceiling refuses such a source in
 *      milliseconds (with a legitimate multi-frame animation as the control), and
 *      eight concurrent probes are never more than `concurrency` decodes.
 *
 * THE SITUATION IS BUILT: the source image is written here by ImageMagick itself
 * into a MARKED scratch media root, and the multi-scene sources are BYTES THIS
 * FILE WRITES (a hand-assembled GIF89a). No fixture, no corpus, no install's
 * records, no database — this gate touches none.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	avAdmission,
	ConverterAdmission,
	converterAdmission,
	withAvSlot,
	withConverterSlot,
} from '../../src/core/media/engine/admission.ts';
import { magickPolicyEnv, resolveMagick } from '../../src/core/media/engine/binaries.ts';
import { createPosterframe } from '../../src/core/media/engine/ffmpeg.ts';
import { probeImageSource } from '../../src/core/media/engine/probe.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';

const ROOT = scratchMediaRoot('dedalo_admission_');
const POLICY_PATH = join(
	import.meta.dir,
	'..',
	'..',
	'src',
	'core',
	'media',
	'engine',
	'imagemagick-policy',
	'policy.xml',
);
const MAGICK = resolveMagick();
const HAVE_MAGICK = existsSync(MAGICK);
const FFMPEG = config.media.binaries.ffmpeg;
const HAVE_FFMPEG = existsSync(FFMPEG);

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

/** A promise plus its resolver — how a test holds a permit open deterministically. */
function gate(): { promise: Promise<void>; open: () => void } {
	let open = (): void => {};
	const promise = new Promise<void>((resolve) => {
		open = () => {
			resolve();
		};
	});
	return { promise, open };
}

describe('converter admission: the pool bounds how many decode at once', () => {
	test('never more than the limit run at once, and every caller is served', async () => {
		const pool = new ConverterAdmission(2, 30);
		let concurrent = 0;
		let peak = 0;
		const done: number[] = [];
		await Promise.all(
			Array.from({ length: 8 }, (_unused, index) =>
				pool.run('probe', async () => {
					concurrent += 1;
					peak = Math.max(peak, concurrent);
					// A real await, so the runs genuinely overlap in the event loop.
					await Bun.sleep(5);
					concurrent -= 1;
					done.push(index);
				}),
			),
		);
		expect(peak, 'more conversions decoded at once than the pool admits').toBe(2);
		expect(pool.peak).toBe(2);
		expect(done.length, 'a waiter was never granted a permit').toBe(8);
		expect(pool.active, 'permits leaked — the pool is permanently narrower').toBe(0);
		expect(pool.queued).toBe(0);
	});

	test('the permit is released when the work THROWS', async () => {
		// Without the `finally`, ONE failed conversion narrows the pool for the life of
		// the process and a handful of them close it entirely — a self-inflicted denial
		// of service that only shows up in production.
		const pool = new ConverterAdmission(1, 30);
		await expect(
			pool.run('failing', () => Promise.reject(new Error('convert exploded'))),
		).rejects.toThrow('convert exploded');
		expect(pool.active).toBe(0);
		let ran = false;
		await pool.run('after', async () => {
			ran = true;
			await Bun.sleep(1);
		});
		expect(ran, 'the pool never granted another permit after a failure').toBe(true);
	});

	test('waiters are granted in the order they arrived', async () => {
		const pool = new ConverterAdmission(1, 30);
		const held = gate();
		const order: string[] = [];
		const first = pool.run('first', async () => {
			order.push('first');
			await held.promise;
		});
		// Yield so `first` has actually taken the permit before the others queue.
		await Bun.sleep(1);
		const second = pool.run('second', async () => {
			order.push('second');
			await Bun.sleep(1);
		});
		await Bun.sleep(1);
		const third = pool.run('third', async () => {
			order.push('third');
			await Bun.sleep(1);
		});
		await Bun.sleep(1);
		expect(order, 'a queued conversion started while the permit was held').toEqual(['first']);
		expect(pool.queued).toBe(2);
		held.open();
		await Promise.all([first, second, third]);
		expect(order).toEqual(['first', 'second', 'third']);
	});

	test('a waiter that waits past the ceiling is REFUSED with rate.limited', async () => {
		// The queue is bounded in TIME because a waiter holds a request lane: an
		// unbounded queue trades the disk exhaustion for a lane exhaustion, and the
		// caller learns nothing until its socket dies. 429 + retryable is the honest
		// answer, and the client can act on it.
		const pool = new ConverterAdmission(1, 1);
		const held = gate();
		const holder = pool.run('holder', async () => {
			await held.promise;
		});
		await Bun.sleep(1);
		const started = Date.now();
		const refusal = await pool
			.run('waiter', () => Promise.resolve('rendered'))
			.then(
				(value) => value,
				(error: unknown) => error,
			);
		const waited = Date.now() - started;
		expect(refusal, 'the pool served a permit it never had').toBeInstanceOf(DedaloError);
		expect((refusal as DedaloError).code).toBe('rate.limited');
		expect(
			waited,
			'the waiter was refused before it had actually waited the configured ceiling',
		).toBeGreaterThanOrEqual(900);
		held.open();
		await holder;
		expect(pool.queued, 'the refused waiter was left in the queue').toBe(0);
		expect(pool.active).toBe(0);
	});

	test('the PROCESS-WIDE pool is the configured one, and every door shares it', () => {
		// A per-call pool would bound each conversion against itself and nothing
		// against K of them — which is the defect, wearing the fix's clothes.
		const pool = converterAdmission();
		expect(pool).toBe(converterAdmission());
		expect(pool.concurrency).toBe(Math.max(1, config.media.convert.concurrency));
		expect(config.media.convert.queueSeconds).toBeGreaterThan(0);
	});

	test('withConverterSlot runs its work inside the process-wide pool', async () => {
		const before = converterAdmission().active;
		let seen = -1;
		const value = await withConverterSlot('gate probe', async () => {
			seen = converterAdmission().active;
			await Bun.sleep(1);
			return 'done';
		});
		expect(value).toBe('done');
		expect(seen, 'the work ran without the pool counting it').toBe(before + 1);
		expect(converterAdmission().active).toBe(before);
	});
});

// --- effect: where the pixel cache actually lands ---------------------------

/**
 * A conversion whose pixel cache CANNOT fit in memory, so ImageMagick must put it
 * on a filesystem. 2 MiB of memory and map for a 1200x1200 resize guarantees the
 * spill; the cache files themselves are deleted when the process exits, which is
 * why the observation below is made on the RUN's outcome and not on a listing.
 */
async function forcedSpill(
	env: Record<string, string>,
	source: string,
	target: string,
): Promise<{ exitCode: number; stderr: string; wrote: boolean }> {
	const child = Bun.spawn(
		[
			MAGICK,
			'-limit',
			'memory',
			'2MiB',
			'-limit',
			'map',
			'2MiB',
			source,
			'-resize',
			'150%',
			target,
		],
		{ env, stdout: 'ignore', stderr: 'pipe' },
	);
	const stderr = await new Response(child.stderr).text();
	const exitCode = await child.exited;
	return { exitCode, stderr, wrote: existsSync(target) };
}

describe.if(HAVE_MAGICK)('converter admission: the pixel-cache spill is redirected', () => {
	const source = join(ROOT, 'source.png');
	const unwritable = join(ROOT, 'spill_unwritable');

	test('magickPolicyEnv names the spill directory and ensures it exists', () => {
		const scratch = join(ROOT, 'spill');
		const env = magickPolicyEnv(scratch);
		expect(
			env.MAGICK_TMPDIR,
			'magickPolicyEnv sets no MAGICK_TMPDIR — the pixel cache follows the OS temp dir, which on both shipped compose stacks is the volume the DATABASE lives on',
		).toBe(scratch);
		expect(existsSync(scratch), 'the spill directory was not ensured').toBe(true);
	});

	test('ImageMagick really puts its pixel cache in that directory (and nowhere else)', async () => {
		// THE MEASUREMENT, made without a race: point MAGICK_TMPDIR at a directory the
		// process may not write to and force a spill. The OS temp dir is writable, so a
		// refusal can only mean the cache was attempted THERE — i.e. the variable, and
		// not the operating system's default, decides the filesystem. Measured on this
		// host: `unable to open pixel cache … Permission denied @ error/cache.c`.
		await Bun.spawn([MAGICK, '-size', '1200x1200', 'xc:red', source]).exited;
		expect(existsSync(source), 'the situation was not built — no source image').toBe(true);
		mkdirSync(unwritable, { recursive: true });
		chmodSync(unwritable, 0o500);
		const run = await forcedSpill(
			{ ...(process.env as Record<string, string>), ...magickPolicyEnv(unwritable) },
			source,
			join(ROOT, 'refused.png'),
		);
		chmodSync(unwritable, 0o700);
		expect(run.exitCode, 'the forced spill did not fail — the cache never went there').not.toBe(0);
		expect(run.stderr).toMatch(/pixel cache/i);
		expect(run.stderr).toMatch(/denied/i);
		expect(run.wrote).toBe(false);
	}, 120_000);

	test('CONTROL: the same conversion succeeds when that directory is writable', async () => {
		// The half that makes the leg above a statement about MAGICK_TMPDIR rather than
		// about a conversion that was going to fail anyway: identical argv, identical
		// forced spill, a writable directory — and it converts.
		const target = join(ROOT, 'spilled.png');
		const run = await forcedSpill(
			{ ...(process.env as Record<string, string>), ...magickPolicyEnv(join(ROOT, 'spill_ok')) },
			source,
			target,
		);
		expect(run.exitCode, `the control conversion failed: ${run.stderr}`).toBe(0);
		expect(run.wrote, 'the control wrote nothing — the refusal above proves nothing').toBe(true);
	}, 120_000);
});

// --- effect: the header read is bounded, and holds a permit like everything else

/**
 * A GIF89a of `frames` 1x1 images, written byte by byte here.
 *
 * BUILT, never fetched: this is the smallest file that declares an enormous NUMBER
 * of images, which is the exposure — 23 bytes per frame, so the 200000-frame twin
 * of the measurement is 4.6 MB, 0.2 % of the upload cap, and `gif` is on the
 * thumbnailable extension list the upload preview uses.
 */
function multiSceneGif(path: string, frames: number): void {
	const header = Buffer.from([
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255,
	]);
	const frame = Buffer.from([
		0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02,
		0x44, 0x01, 0x00,
	]);
	const parts: Buffer[] = [header];
	for (let i = 0; i < frames; i++) parts.push(frame);
	parts.push(Buffer.from([0x3b]));
	writeFileSync(path, Buffer.concat(parts));
}

describe.if(HAVE_MAGICK)('converter admission: a header read is bounded and admitted', () => {
	const bomb = join(ROOT, 'sequence_bomb.gif');
	const legit = join(ROOT, 'animation.gif');

	test('the situation is built: two multi-scene GIFs, one over the ceiling', () => {
		multiSceneGif(bomb, 200_000);
		multiSceneGif(legit, 63);
		expect(statSync(bomb).size).toBeGreaterThan(4_000_000);
		expect(statSync(bomb).size).toBeLessThan(config.media.magickLimits.listLength * 100_000);
		expect(statSync(legit).size).toBeGreaterThan(1000);
		// The control must be UNDER the configured ceiling or it proves nothing.
		expect(config.media.magickLimits.listLength).toBeGreaterThan(63);
	});

	test('a 200000-scene source is REFUSED by the probe, in milliseconds', async () => {
		// The reproduction, through the exact function `createStagedThumbnail` awaits
		// on the authenticated upload. Before the sequence ceiling this call took
		// 26.3 s and 8.73 GB RSS and then SUCCEEDED, so K uploads were K of those.
		const started = Date.now();
		const outcome = await probeImageSource(bomb).then(
			(probe) => probe,
			(error: unknown) => error,
		);
		const elapsed = Date.now() - started;
		expect(
			outcome,
			'the probe enumerated 200000 scenes and returned a report — the sequence ceiling is not armed',
		).toBeInstanceOf(Error);
		// THE CAUSE, not merely a refusal: this probe now queues for a converter
		// permit, so `instanceof Error` alone would also accept a `rate.limited`
		// admission refusal or any spawn failure — a green leg that says nothing
		// about `-limit list-length`. The message must name the ceiling that fired.
		const message = `${String((outcome as Error).message)} ${String((outcome as { cause?: unknown }).cause ?? '')}`;
		expect(
			message.toLowerCase(),
			`the probe failed for some OTHER reason than the sequence ceiling: ${message}`,
		).toMatch(/list length|list-length/);
		expect(
			elapsed,
			`the refusal took ${String(elapsed)} ms — a bounded read must not pay for the enumeration it refuses`,
		).toBeLessThan(10_000);
	}, 120_000);

	test('CONTROL: a legitimate 63-frame animation still probes, with every scene', async () => {
		// The half that keeps the refusal above a statement about the CEILING and not
		// about GIFs, or about multi-scene sources, or about a file this suite wrote.
		const probe = await probeImageSource(legit);
		expect(probe.sceneCount, 'the ceiling refused a legitimate animation').toBe(63);
		expect(probe.canvasWidth).toBe(1);
		expect(probe.scenes.length).toBe(63);
	}, 120_000);

	test('eight concurrent probes are never more than `concurrency` decodes', async () => {
		// The other half of the finding: a bounded cost multiplied by K is not a bound.
		// Measured before this landed, on the real engine code: four parallel
		// `probeImageSource` calls = 4 concurrent identify processes, 6.55 GB combined.
		// Sampled from the pool itself, so a probe that spawns without a permit is
		// invisible to it — which is exactly what makes the floor below load-bearing.
		const pool = converterAdmission();
		let observed = 0;
		const sampler = setInterval(() => {
			observed = Math.max(observed, pool.active);
		}, 1);
		try {
			await Promise.all(Array.from({ length: 8 }, () => probeImageSource(legit)));
		} finally {
			clearInterval(sampler);
		}
		expect(
			observed,
			'the pool never saw a probe — `runIdentify` spawns ImageMagick outside converter admission',
		).toBeGreaterThanOrEqual(1);
		expect(
			observed,
			`${String(observed)} identify processes decoded at once against a ceiling of ${String(pool.concurrency)}`,
		).toBeLessThanOrEqual(pool.concurrency);
	}, 120_000);
});

// --- effect: the shipped policy really arms inside a real ImageMagick --------

describe.if(HAVE_MAGICK)('the shipped policy arms in a real ImageMagick', () => {
	test('every ceiling the file declares is the one the binary reports', async () => {
		// SHAPE IS NOT ARMING, and this file has now silently disarmed itself TWICE in
		// ways that a reader of the XML cannot see: a multi-line comment inside
		// <policymap> drops every policy after it, and (measured 2026-09-05) so does a
		// single BACKTICK inside one — the `list-length` row read back as `unlimited`
		// with the file parsing as valid XML. This leg asks the binary instead of the
		// text, so the NEXT unknown disarming spelling is caught by the same assertion.
		const declared = [
			...readFileSync(POLICY_PATH, 'utf8').matchAll(
				/<policy\s+domain="resource"\s+name="([^"]+)"\s+value="([^"]+)"/g,
			),
		].map((m) => m[1] as string);
		expect(declared.length, 'the policy declares no resource ceilings at all').toBeGreaterThan(6);
		const child = Bun.spawn([MAGICK, '-list', 'resource'], {
			env: {
				...(process.env as Record<string, string>),
				MAGICK_CONFIGURE_PATH: join(POLICY_PATH, '..'),
			},
			stderr: 'pipe',
		});
		const report = await new Response(child.stdout).text();
		await child.exited;
		expect(report).toMatch(/Resource limits/);
		for (const name of declared) {
			// `list-length` prints as `List length`; the report is title-cased words.
			const label = name.replace(/-/g, ' ');
			const row = report
				.split('\n')
				.find((line) => line.trim().toLowerCase().startsWith(`${label}:`));
			expect(row, `the binary reports no ${name} row at all`).toBeDefined();
			expect(
				(row as string).toLowerCase(),
				`ImageMagick loaded the shipped policy but ${name} is UNLIMITED — a policy row after a disarming comment is dropped silently`,
			).not.toMatch(/unlimited/);
		}
	}, 120_000);
});

// --- effect: the AV producers are admitted too --------------------------------

/**
 * THE FFMPEG HALF of the same finding. Two audiovisual API actions are awaited
 * INLINE on an authenticated request and belong to NO media job:
 * `create_posterframe` (dd_component_av_api.ts) and `download_fragment` (which
 * re-encodes the whole clip when a watermark is asked for, with a client that
 * waits an hour by contract). They were exempted from admission on the stated
 * ground that "media/jobs.ts caps how many transcodes run at once" — an
 * exemption whose reason was untrue, so K readers pressing the button were K
 * unbounded ffmpeg processes. These legs run the REAL producer door.
 */
describe('AV admission: ffmpeg is bounded too, by its own pool', () => {
	test('the AV pool is a SECOND pool, configured from the AV keys', () => {
		const av = avAdmission();
		expect(av, 'avAdmission() is not a singleton — a per-call pool bounds nothing').toBe(
			avAdmission(),
		);
		expect(
			av,
			'the AV producers share the image pool — an hour-long transcode would then hold a lane every upload thumbnail waits behind',
		).not.toBe(converterAdmission());
		expect(av.concurrency).toBe(Math.max(1, config.media.convertAv.concurrency));
		expect(config.media.convertAv.queueSeconds).toBeGreaterThan(0);
		// The default is the job supervisor's lanes plus one, so a full job queue
		// still leaves room for one interactive fragment.
		expect(av.concurrency).toBeGreaterThanOrEqual(1);
	});

	test('an AV refusal names the AV keys, not the image ones', async () => {
		// A waiter refused by the wrong parameter name sends the operator to a
		// ceiling that is not the one that refused them.
		const pool = new ConverterAdmission(
			1,
			1,
			'DEDALO_MEDIA_AV_CONCURRENCY / DEDALO_MEDIA_AV_QUEUE_SECONDS',
		);
		const held = gate();
		const holder = pool.run('holder', async () => {
			await held.promise;
		});
		const refusal = await pool
			.run('ffmpeg', async () => 'granted')
			.then(
				(value) => value,
				(error: unknown) => error,
			);
		held.open();
		await holder;
		expect(refusal).toBeInstanceOf(DedaloError);
		expect((refusal as DedaloError).message).toContain('DEDALO_MEDIA_AV_CONCURRENCY');
		expect((refusal as DedaloError).message).not.toContain('DEDALO_MEDIA_CONVERT_CONCURRENCY');
	}, 20_000);

	test('withAvSlot runs its work inside the process-wide AV pool', async () => {
		const before = avAdmission().active;
		let seen = -1;
		const value = await withAvSlot('gate probe', async () => {
			seen = avAdmission().active;
			await Bun.sleep(1);
			return 'done';
		});
		expect(value).toBe('done');
		expect(seen, 'the work ran without the AV pool counting it').toBe(before + 1);
		expect(avAdmission().active).toBe(before);
	});
});

describe.if(HAVE_FFMPEG)('AV admission: the REAL producer takes a permit', () => {
	const source = join(ROOT, 'clip.mp4');

	test('the situation is built: a real two-second video, written by ffmpeg', async () => {
		const built = Bun.spawnSync([
			FFMPEG,
			'-y',
			'-f',
			'lavfi',
			'-i',
			'testsrc=size=160x120:rate=10:duration=2',
			'-pix_fmt',
			'yuv420p',
			source,
		]);
		expect(built.exitCode, new TextDecoder().decode(built.stderr).slice(-400)).toBe(0);
		expect(statSync(source).size).toBeGreaterThan(1000);
	}, 60_000);

	test('eight concurrent posterframes are never more than the AV ceiling', async () => {
		// `createPosterframe` is the function `create_posterframe` awaits inline, two
		// frames down from the API handler. Sampled from the pool itself, so a
		// producer spawning without a permit is INVISIBLE to it — which is what makes
		// the floor below load-bearing rather than decorative.
		const pool = avAdmission();
		let observed = 0;
		const sampler = setInterval(() => {
			observed = Math.max(observed, pool.active);
		}, 1);
		let produced = 0;
		try {
			const results = await Promise.all(
				Array.from({ length: 8 }, (_unused, index) =>
					createPosterframe(source, '1', join(ROOT, `poster_${String(index)}.jpg`), {
						width: 80,
						height: 60,
					}),
				),
			);
			produced = results.filter((made) => made === true).length;
		} finally {
			clearInterval(sampler);
		}
		expect(produced, 'the admitted producers did not all deliver their frame').toBe(8);
		expect(
			observed,
			'the AV pool never saw a producer — ffmpeg spawns outside withAvSlot(), so K requests are K transcodes',
		).toBeGreaterThanOrEqual(1);
		expect(
			observed,
			`${String(observed)} ffmpeg processes ran at once against a ceiling of ${String(pool.concurrency)}`,
		).toBeLessThanOrEqual(pool.concurrency);
	}, 120_000);
});

test.if(!HAVE_FFMPEG)(
	'SKIPPED on this host: ffmpeg is not installed, so the real-producer admission leg cannot run',
	() => {
		expect(HAVE_FFMPEG).toBe(false);
	},
);

test.if(!HAVE_MAGICK)(
	'SKIPPED on this host: ImageMagick is not installed, so the spill, sequence-ceiling and policy-arming legs cannot run',
	() => {
		expect(HAVE_MAGICK).toBe(false);
	},
);
