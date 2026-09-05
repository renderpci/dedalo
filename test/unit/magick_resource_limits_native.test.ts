/**
 * MAGICK RESOURCE LIMITS — BEHAVIOURAL (audit MEDIA-01).
 *
 * `magick_policy_tripwire` asserts the SHAPE: the shipped policy declares a
 * `domain="resource"` ceiling, every ImageMagick spawn splices the `-limit` argv,
 * a deploy artifact installs the file system-wide. Shape is not effect. This gate
 * asserts the EFFECT, by running the real binary against a real file:
 *
 *   an image that DECLARES more pixels than the bound is REFUSED, and refused at
 *   header-parse time — before a pixel is allocated — while a legitimate image of
 *   ordinary size still probes and still converts.
 *
 * THE SITUATION IS BUILT, NEVER BORROWED. The oversized file is a 68-byte PNG this
 * gate WRITES: a valid signature and a valid IHDR declaring 150000x150000, and
 * ten bytes of IDAT. That is the whole decode-bomb shape — a few bytes on the wire
 * that ask ImageMagick for a 22-gigapixel canvas — and it means the gate needs no
 * fixture, no corpus and no gigabyte of scratch disk. It is written into a MARKED
 * scratch media root (test/helpers/media_scratch_root.ts), never the
 * installation's tree.
 *
 * THE TWO HALVES ARE SEPARATELY DEMONSTRATED, each with its own control:
 *  - the ARGV limit: the engine's own doors (`probeImageSource`, `buildThumb`)
 *    refuse the oversized file and produce nothing, while a 64x64 PNG passes both;
 *  - the POLICY ceiling: a process that tries to RAISE the width limit above the
 *    shipped policy's value is still refused — and the identical command WITHOUT
 *    MAGICK_CONFIGURE_PATH succeeds, which is what proves the refusal comes from
 *    the shipped file and not from a malformed test fixture.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { config } from '../../src/config/config.ts';
import {
	magickResourceLimitArgs,
	resolveIdentify,
	resolveMagick,
} from '../../src/core/media/engine/binaries.ts';
import { buildThumb } from '../../src/core/media/engine/imagemagick.ts';
import { probeImageSource } from '../../src/core/media/engine/probe.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';

const HAVE_MAGICK = existsSync(resolveMagick());
const ROOT = scratchMediaRoot('dedalo_magick_limits_');
const POLICY_DIR = join(
	import.meta.dir,
	'..',
	'..',
	'src',
	'core',
	'media',
	'engine',
	'imagemagick-policy',
);

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

/** A PNG chunk: length, type, payload, CRC32 of type+payload. */
function pngChunk(type: string, payload: Buffer): Buffer {
	const head = Buffer.alloc(4);
	head.writeUInt32BE(payload.length, 0);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body) >>> 0, 0);
	return Buffer.concat([head, body, crc]);
}

/**
 * Write a structurally VALID PNG whose IHDR declares `width x height`. The pixel
 * data is nonsense on purpose: the point of a decode bomb is that the header is
 * read — and the allocation decided — long before any pixel is.
 */
function writeDeclaredSizePng(path: string, width: number, height: number): string {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour
	writeFileSync(
		path,
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			pngChunk('IHDR', ihdr),
			pngChunk('IDAT', deflateSync(Buffer.alloc(10))),
			pngChunk('IEND', Buffer.alloc(0)),
		]),
	);
	return path;
}

test.skipIf(HAVE_MAGICK)(
	'SKIPPED on this host: ImageMagick is not installed, so no converter behaviour can be measured here',
	() => {
		expect(HAVE_MAGICK).toBe(false);
	},
);

describe.if(HAVE_MAGICK)('the engine refuses an image that declares more than the bound', () => {
	test('CONTROL: the bound is real and it is above an ordinary image', () => {
		// Without this the refusals below could pass on limits of zero, or on a
		// magickResourceLimitArgs() that emits nothing at all.
		const argv = magickResourceLimitArgs();
		expect(argv.length).toBeGreaterThanOrEqual(21);
		expect(config.media.magickLimits.width).toBeGreaterThan(10000);
		expect(config.media.magickLimits.height).toBeGreaterThan(10000);
	});

	test('CONTROL: an ordinary 64x64 image still probes and still converts', async () => {
		const source = join(ROOT, 'ordinary.png');
		const made = await runBinary([resolveMagick(), '-size', '64x64', 'xc:teal', source], {
			nice: false,
		});
		expect(made.ok, `could not build the control image: ${made.stderr}`).toBe(true);

		const probe = await probeImageSource(source);
		expect(probe.canvasWidth).toBe(64);
		expect(probe.canvasHeight).toBe(64);

		const thumb = join(ROOT, 'ordinary_thumb.jpg');
		await buildThumb(source, thumb, { selection: 'representative', background: '#ffffff' });
		expect(existsSync(thumb)).toBe(true);
	});

	test('probeImageSource REFUSES a file declaring 150000x150000', async () => {
		const bomb = writeDeclaredSizePng(join(ROOT, 'bomb_probe.png'), 150_000, 150_000);
		// The declared size is ABOVE the operating limit and BELOW the policy ceiling,
		// so this measures the argv half specifically.
		expect(150_000).toBeGreaterThan(config.media.magickLimits.width);
		await expect(probeImageSource(bomb)).rejects.toThrow();
	});

	test('buildThumb REFUSES the same file and writes no derivative', async () => {
		const bomb = writeDeclaredSizePng(join(ROOT, 'bomb_thumb.png'), 150_000, 150_000);
		const target = join(ROOT, 'bomb_thumb_out.jpg');
		await expect(
			buildThumb(bomb, target, { selection: 'representative', background: '#ffffff' }),
		).rejects.toThrow();
		expect(
			existsSync(target),
			'a refused conversion left a derivative behind — a partial file must never be published',
		).toBe(false);
	});

	test('the refusal is at HEADER parse, not after an allocation', async () => {
		const bomb = writeDeclaredSizePng(join(ROOT, 'bomb_header.png'), 150_000, 150_000);
		const started = Date.now();
		const result = await runBinary(
			[...resolveIdentify(), ...magickResourceLimitArgs(), '-ping', '-format', '%w', bomb],
			{ nice: false, env: { MAGICK_CONFIGURE_PATH: `${POLICY_DIR}/` } },
		);
		expect(result.ok).toBe(false);
		expect(result.stderr).toMatch(
			/exceeds (user )?limit|cache resources exhausted|width or height/i,
		);
		// A 22-gigapixel canvas that was actually attempted cannot come back in a second.
		expect(Date.now() - started).toBeLessThan(5000);
	});
});

describe.if(HAVE_MAGICK)('the shipped policy is a ceiling a process cannot raise', () => {
	test('a raised -limit is still refused UNDER the policy, and accepted without it', async () => {
		// 300000 is above the shipped policy's width ceiling (200000). The command asks
		// for 400000 — more than both — so the only thing that can refuse it is the
		// policy file.
		const wide = writeDeclaredSizePng(join(ROOT, 'wide.png'), 300_000, 1000);
		const argv = [
			...resolveIdentify(),
			'-limit',
			'width',
			'400000',
			'-ping',
			'-format',
			'%w',
			wide,
		];

		const withPolicy = await runBinary(argv, {
			nice: false,
			env: { MAGICK_CONFIGURE_PATH: `${POLICY_DIR}/` },
		});
		expect(
			withPolicy.ok,
			'the shipped policy did not cap a raised -limit — the resource block is the only bound that reaches an ImageMagick this engine did not spawn',
		).toBe(false);

		// CONTROL: the identical command with no policy SUCCEEDS. This is what makes
		// the assertion above a statement about the policy rather than about a
		// malformed file.
		const withoutPolicy = await runBinary(argv, {
			nice: false,
			env: { MAGICK_CONFIGURE_PATH: '/nonexistent-magick-config' },
		});
		expect(
			withoutPolicy.ok,
			`the control run failed too, so the refusal above proves nothing about the policy: ${withoutPolicy.stderr}`,
		).toBe(true);
		expect(withoutPolicy.stdout.trim()).toBe('300000');
	});
});
