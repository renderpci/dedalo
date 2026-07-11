/**
 * Phase A unit gate: the binary-adapter ARGV recipes + MIME sniffer + ffmpeg
 * profile table. These pin the PHP command shapes (engineering/MEDIA_SPEC.md §4) as
 * argv arrays WITHOUT spawning any binary — the recipe is the parity contract;
 * the actual binary output is gated in Phase C against ffprobe/identify.
 */

import { describe, expect, test } from 'bun:test';
import {
	buildConformHeaderArgv,
	buildPosterframeArgv,
	buildTranscodePass1Argv,
	buildTranscodePass2Argv,
	standardFromFps,
} from '../../src/core/media/engine/ffmpeg.ts';
import {
	ffmpegProfileNames,
	getFfmpegProfile,
	settingName,
} from '../../src/core/media/engine/ffmpeg_profiles.ts';
import {
	buildCropArgv,
	buildRotateArgv,
	buildThumbArgv,
} from '../../src/core/media/engine/imagemagick.ts';
import { sniffAndValidate, sniffBytes } from '../../src/core/media/engine/mime.ts';
import { buildExtractArgv, buildOcrArgv } from '../../src/core/media/engine/pdf.ts';

describe('ffmpeg profiles (37 settings files → typed data)', () => {
	test('all 37 profiles present', () => {
		expect(ffmpegProfileNames().length).toBe(37);
	});

	test('404_pal_16x9 matches the PHP settings file verbatim', () => {
		const p = getFfmpegProfile('404_pal_16x9')!;
		expect(p.videoBitrate).toBe('1024k');
		expect(p.scale).toBe('720x404');
		expect(p.gop).toBe(25);
		expect(p.videoCodec).toBe('libx264');
		expect(p.audioRate).toBe(44100);
		expect(p.audioBitrate).toBe('64k');
		expect(p.audioChannels).toBe(1);
		expect(p.force).toBe('mp4');
		expect(p.targetPath).toBe('404');
		expect(p.deinterlace).toBe('-vf yadif');
		expect(p.gammaFilter).toContain('lutyuv=u=gammaval(1.01)');
	});

	test('1080i has NO deinterlace fragment; audio tiers are video-null', () => {
		expect(getFfmpegProfile('1080i_pal')!.deinterlace).toBe('');
		const audio = getFfmpegProfile('audio')!;
		expect(audio.videoCodec).toBeNull();
		expect(audio.force).toBe('mp4');
		expect(getFfmpegProfile('audio_tr')!.force).toBe('wav');
	});

	test('setting_name derivation (get_setting_name)', () => {
		expect(settingName('404', 'pal', '16x9')).toBe('404_pal_16x9');
		expect(settingName('720', 'ntsc', null)).toBe('720_ntsc');
		expect(settingName('audio', 'pal', '16x9')).toBe('audio'); // audio ignores standard/aspect
	});

	test('standardFromFps: ≥29 → ntsc else pal', () => {
		expect(standardFromFps('30000/1001')).toBe('ntsc');
		expect(standardFromFps('25/1')).toBe('pal');
		expect(standardFromFps(undefined)).toBe('pal');
	});
});

describe('ffmpeg argv recipes (PHP class.Ffmpeg.php)', () => {
	test('two-pass pass1: -an -pass 1 … -passlogfile … -y /dev/null', () => {
		const argv = buildTranscodePass1Argv(getFfmpegProfile('404_pal_16x9')!, '/src.mov', '/log');
		const s = argv.join(' ');
		expect(s).toContain('-i /src.mov');
		expect(s).toContain('-an -pass 1');
		expect(s).toContain('-vcodec libx264');
		expect(s).toContain('-vb 1024k');
		expect(s).toContain('-s 720x404');
		expect(s).toContain('-g 25');
		expect(s).toContain('-vf yadif');
		expect(s).toContain('-passlogfile /log');
		expect(argv[argv.length - 1]).toBe('/dev/null');
		// no shell tokens ever
		expect(argv).not.toContain('sh');
		expect(argv.some((t) => t.includes('"'))).toBe(false);
	});

	test('two-pass pass2 adds the audio track + temp target', () => {
		const argv = buildTranscodePass2Argv(
			getFfmpegProfile('404_pal_16x9')!,
			'/src.mov',
			'/log',
			'/tmp.mp4',
			'aac',
		);
		const s = argv.join(' ');
		expect(s).toContain('-pass 2');
		expect(s).toContain('-acodec aac');
		expect(s).toContain('-ar 44100');
		expect(s).toContain('-ab 64k');
		expect(s).toContain('-ac 1');
		expect(argv[argv.length - 1]).toBe('/tmp.mp4');
	});

	test('posterframe: -ss <tc.3f> -i src -y -vframes 1 -f rawvideo -an -vcodec mjpeg -s WxH', () => {
		const argv = buildPosterframeArgv('/v.mp4', '12.5', '/poster.jpg', {
			width: 1280,
			height: 720,
		});
		const s = argv.join(' ');
		expect(s).toContain('-ss 12.500');
		expect(s).toContain('-vframes 1 -f rawvideo -an -vcodec mjpeg');
		expect(s).toContain('-s 1280x720');
		expect(argv[argv.length - 1]).toBe('/poster.jpg');
	});

	test('conform_header: -c:v copy -c:a copy', () => {
		expect(buildConformHeaderArgv('/s.mp4', '/t.mp4').join(' ')).toContain('-c:v copy -c:a copy');
	});
});

describe('imagemagick argv recipes (PHP class.ImageMagick.php)', () => {
	test("dd_thumb: -define jpeg:size … -thumbnail 'WxH>' -auto-orient …", () => {
		const argv = buildThumbArgv('/s.tif', '/t.jpg', 222, 148);
		const s = argv.join(' ');
		expect(s).toContain('-define jpeg:size=400x400');
		expect(s).toContain('-thumbnail 222x148>');
		expect(s).toContain('-auto-orient -gravity center -unsharp 0x.5 -quality 90');
		expect(argv[argv.length - 1]).toBe('/t.jpg');
	});

	test('rotate expanded: +distort SRT <deg> +repage', () => {
		const s = buildRotateArgv('/s.jpg', '/t.jpg', 90, 'expanded', '#ffffff').join(' ');
		expect(s).toContain('+distort SRT 90 +repage');
		expect(s).toContain('-background #ffffff');
	});

	test('crop: -crop WxH+x+y +repage', () => {
		const s = buildCropArgv('/s.jpg', '/t.jpg', { x: 10, y: 20, width: 100, height: 50 }).join(' ');
		expect(s).toContain('-crop 100x50+10+20 +repage');
	});
});

describe('pdf argv recipes (PHP component_pdf)', () => {
	test('text extraction: -enc UTF-8 -f -l', () => {
		const s = buildExtractArgv('/s.pdf', '/o.txt', { method: 'text', pageIn: 2, pageOut: 5 }).join(
			' ',
		);
		expect(s).toContain('-enc UTF-8');
		expect(s).toContain('-f 2');
		expect(s).toContain('-l 5');
	});

	test('html extraction adds -i -p -noframes -layout', () => {
		const s = buildExtractArgv('/s.pdf', '/o.html', { method: 'html' }).join(' ');
		expect(s).toContain('-i -p -noframes -layout');
	});

	test('ocr: --pdfa-image-compression lossless -l <lang> --force-ocr', () => {
		const s = buildOcrArgv('/s.pdf', '/s.pdf', 'spa').join(' ');
		expect(s).toContain('--pdfa-image-compression lossless -l spa --force-ocr');
	});
});

describe('mime sniffer (magic bytes, no library)', () => {
	const bytesOf = (...n: number[]) => new Uint8Array(n);

	test('images', () => {
		expect(sniffBytes(bytesOf(0xff, 0xd8, 0xff, 0xe0))?.kind).toBe('jpeg');
		expect(sniffBytes(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.kind).toBe('png');
		expect(sniffBytes(bytesOf(0x49, 0x49, 0x2a, 0x00))?.kind).toBe('tiff');
		expect(sniffBytes(bytesOf(0x38, 0x42, 0x50, 0x53))?.kind).toBe('psd');
	});

	test('RIFF + ftyp dispatch', () => {
		const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
		expect(sniffBytes(webp)?.kind).toBe('webp');
		const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
		expect(sniffBytes(wav)?.kind).toBe('wav');
		const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
		expect(sniffBytes(mp4)?.kind).toBe('mp4');
	});

	test('pdf, zip, svg text, glb', () => {
		expect(sniffBytes(new TextEncoder().encode('%PDF-1.7'))?.kind).toBe('pdf');
		expect(sniffBytes(bytesOf(0x50, 0x4b, 0x03, 0x04))?.kind).toBe('zip');
		expect(sniffBytes(new TextEncoder().encode('<?xml version="1.0"?><svg xmlns='))?.kind).toBe(
			'svg',
		);
		expect(sniffBytes(new TextEncoder().encode('glTF'))?.kind).toBe('glb');
	});

	test('sniffAndValidate: matches, mismatches fail closed', () => {
		expect(sniffAndValidate(new TextEncoder().encode('%PDF-1.4'), 'pdf')).toBe('pdf');
		expect(sniffAndValidate(bytesOf(0xff, 0xd8, 0xff), 'jpg')).toBe('jpg');
		// jpeg bytes declared as png → rejected
		expect(() => sniffAndValidate(bytesOf(0xff, 0xd8, 0xff), 'png')).toThrow();
		// unknown signature declared as an image → rejected (fail closed)
		expect(() => sniffAndValidate(bytesOf(0x00, 0x01, 0x02, 0x03), 'jpg')).toThrow();
		// text-based 3D (.obj) with no magic → accepted when not a known binary
		expect(sniffAndValidate(new TextEncoder().encode('v 0.0 0.0 0.0\n'), 'obj')).toBe('obj');
	});
});
