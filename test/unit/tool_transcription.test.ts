/**
 * R1 gate: tool_transcription LOCAL half + the remote-ASR seam. The core builds
 * the audio_tr WAV from a scratch AV original with the REAL ffmpeg binary, is
 * idempotent, and hard-deletes. The tool module loads with the full action
 * surface (permission: null → imperative media_ddo gates). The remote seam is
 * exercised through stubs: status-poll body construction, SSRF fail-closed,
 * segment→TC-text conversion (seg2tc parity), and the bounded completion poll
 * with an injected save. Full tool_request→DB drive is ledgered (media not
 * synced here), matching the media_tools.test.ts convention.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';
import {
	deleteTranscribableAudio,
	ensureTranscribableAudio,
	transcribableAudioLocation,
} from '../../src/core/media/tools/transcription.ts';
import { secondsToTc } from '../../src/core/resolve/tr_marks.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import {
	type TranscriberStatusRequest,
	babelTranscriberStatusProvider,
	buildTranscriberStatusBody,
	hasExistingTranscription,
	mapTranscriberEngine,
	pollTranscriptionCompletion,
	resolveTranscriberConfig,
	resolveTranscriberProvider,
	resolveTranscriberStatusProvider,
	segmentsToTcText,
} from '../../src/core/tools/transcription_asr.ts';
import { mustGet } from '../helpers/assert.ts';

const ROOT = `${tmpdir()}/dedalo_transcription_${process.pid}`;
const av = mediaTypeOf('component_av')!;
const HAVE_FFMPEG = existsSync(config.media.binaries.ffmpeg);
const identity: MediaIdentity = {
	componentTipo: 'rsc439',
	sectionTipo: 'rsc170',
	sectionId: 7,
	lang: null,
};
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

/** Make a scratch AV original: a short mp4 with an audio stream (sine tone). */
async function makeAvOriginal(): Promise<void> {
	const abs = `${ROOT}/av/original/rsc439_rsc170_7.mp4`;
	mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
	await runBinary(
		[
			config.media.binaries.ffmpeg,
			'-y',
			'-f',
			'lavfi',
			'-i',
			'sine=frequency=440:duration=1',
			'-c:a',
			'aac',
			abs,
		],
		{ nice: false },
	);
}

beforeAll(() => rmSync(ROOT, { recursive: true, force: true }));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('tool_transcription local core', () => {
	test.if(HAVE_FFMPEG)(
		'ensureTranscribableAudio builds the audio_tr WAV from the AV original',
		async () => {
			await makeAvOriginal();
			const rel = await ensureTranscribableAudio(av, identity, pathOpts);
			expect(rel).toBe('/av/audio_tr/rsc439_rsc170_7.wav');
			expect(existsSync(transcribableAudioLocation(av, identity, pathOpts).absolutePath)).toBe(
				true,
			);
		},
	);

	test.if(HAVE_FFMPEG)('ensure is idempotent — reuses the existing WAV', async () => {
		const rel = await ensureTranscribableAudio(av, identity, pathOpts);
		expect(rel).toBe('/av/audio_tr/rsc439_rsc170_7.wav');
	});

	test.if(HAVE_FFMPEG)('delete removes it (true), then is a no-op (false)', () => {
		expect(deleteTranscribableAudio(av, identity, pathOpts)).toBe(true);
		expect(existsSync(transcribableAudioLocation(av, identity, pathOpts).absolutePath)).toBe(false);
		expect(deleteTranscribableAudio(av, identity, pathOpts)).toBe(false);
	});

	test('ensure rejects a non-av component', async () => {
		const image = mediaTypeOf('component_image')!;
		await expect(ensureTranscribableAudio(image, identity, pathOpts)).rejects.toThrow(
			/component_av/,
		);
	});
});

describe('tool_transcription module', () => {
	test('loads with the full action surface', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'automatic_transcription',
			'build_subtitles_file',
			'check_server_transcriber_status',
			'create_transcribable_audio_file',
			'delete_transcribable_audio_file',
		]);
		// permission: null → each handler gates imperatively against its ddo.
		expect(
			mustGet(actions.create_transcribable_audio_file, 'create_transcribable_audio_file')
				.permission,
		).toBeNull();
		expect(
			mustGet(actions.automatic_transcription, 'automatic_transcription').permission,
		).toBeNull();
		expect(
			mustGet(actions.check_server_transcriber_status, 'check_server_transcriber_status')
				.permission,
		).toBeNull();
		expect(mustGet(actions.build_subtitles_file, 'build_subtitles_file').permission).toBeNull();
	});

	test('the background poll is allowlisted but NOT client-routable', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		expect(loaded!.module.backgroundRunnable).toEqual(['check_background_transcriber_status']);
		// absent from apiActions — an action not in the map is unroutable.
		expect(loaded!.module.apiActions.check_background_transcriber_status).toBeUndefined();
	});
});

const stubPrincipal: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: false };

describe('check_server_transcriber_status handler', () => {
	test('denies fail-closed on an invalid media_ddo record target (READ gate)', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.check_server_transcriber_status!.handler;
		const response = await handler({
			principal: stubPrincipal,
			userId: 7,
			options: {
				media_ddo: { component_tipo: 'rsc439', section_tipo: 'bad tipo!', section_id: 1 },
				transcriber_engine: 'babel_transcriber',
				pid: 123,
			},
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toContain('invalid record target');
	});

	test('reports the missing required parameters (PHP message shape)', async () => {
		const loaded = await getLoadedTool('tool_transcription');
		const handler = loaded!.module.apiActions.check_server_transcriber_status!.handler;
		const response = await handler({
			principal: stubPrincipal,
			userId: 7,
			options: {},
			background: false,
		});
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Missing required parameters: media_ddo, transcriber_engine, pid');
	});
});

describe('remote ASR status seam', () => {
	const statusRequest: TranscriberStatusRequest = {
		uri: 'https://babel.example.org:8011/api/',
		key: 'k',
		avUrl: 'https://dedalo.example.org/dedalo/media/av/404/rsc35_rsc167_1.mp3',
		engine: 'babel_transcriber',
		userId: 7,
		entityName: 'mib',
		pid: 4321,
		deleteResult: false,
	};

	test('buildTranscriberStatusBody POSTs the exact PHP field set', () => {
		const body = buildTranscriberStatusBody(statusRequest);
		expect([...body.keys()].sort()).toEqual([
			'av_url',
			'delete_result',
			'engine',
			'entity_name',
			'key',
			'method_name',
			'pid',
			'url',
			'user_id',
		]);
		expect(body.get('key')).toBe('k');
		expect(body.get('url')).toBe('https://babel.example.org:8011/api/'); // PHP posts the uri as 'url'
		expect(body.get('av_url')).toBe(statusRequest.avUrl);
		expect(body.get('engine')).toBe('babel_transcriber');
		expect(body.get('method_name')).toBe('check_status');
		expect(body.get('user_id')).toBe('7');
		expect(body.get('entity_name')).toBe('mib');
		expect(body.get('pid')).toBe('4321');
		expect(body.get('delete_result')).toBe('false');
	});

	test('the background variant carries lang + delete_result true', () => {
		const body = buildTranscriberStatusBody({
			...statusRequest,
			deleteResult: true,
			lang: 'lg-spa',
		});
		expect(body.get('delete_result')).toBe('true');
		expect(body.get('lang')).toBe('lg-spa');
	});

	test('SSRF guard fails closed without any network call', async () => {
		for (const uri of ['http://127.0.0.1/x', 'http://169.254.169.254/x', 'file:///etc/passwd']) {
			const result = (await babelTranscriberStatusProvider({ ...statusRequest, uri })) as {
				result: unknown;
				msg: string;
			};
			expect(result.result).toBe(false);
			expect(result.msg).toBe('invalid transcriber URL');
		}
	});

	test('status provider resolution mirrors the PHP switch', () => {
		expect(resolveTranscriberStatusProvider('babel_transcriber').provider).not.toBeNull();
		expect(resolveTranscriberStatusProvider('local').provider).not.toBeNull();
		expect(resolveTranscriberStatusProvider('google_translation').provider).toBeNull();
		expect(resolveTranscriberStatusProvider('google_translation').error).toContain(
			'not implemented',
		);
	});

	test("engine 'local' maps to babel (PHP fall-through) for submit too", () => {
		expect(mapTranscriberEngine('local')).toBe('babel_transcriber');
		expect(mapTranscriberEngine('babel_transcriber')).toBe('babel_transcriber');
		expect(resolveTranscriberProvider('local').provider).not.toBeNull();
	});
});

describe('ASR write-back (process_file port)', () => {
	test('seg2tc parity (OptimizeTC::seg2tc)', () => {
		expect(secondsToTc(0)).toBe('00:00:00.000');
		expect(secondsToTc(1.85)).toBe('00:00:01.850');
		expect(secondsToTc(3.45)).toBe('00:00:03.450');
		expect(secondsToTc(322.342)).toBe('00:05:22.342');
		expect(secondsToTc(3661.007)).toBe('01:01:01.007');
		expect(secondsToTc(7322.5)).toBe('02:02:02.500');
		expect(secondsToTc(59)).toBe('00:00:59.000');
	});

	test('segmentsToTcText builds the PHP TC-tagged paragraph text', () => {
		const segments = [
			{ start: 1.85, text: ' Can you say me...' },
			{ start: 3.45, text: ' blah blah...' },
		];
		expect(segmentsToTcText(segments)).toBe(
			'[TC_00:00:01.850_TC] Can you say me...<p>[TC_00:00:03.450_TC] blah blah...',
		);
		expect(segmentsToTcText([])).toBe('');
	});

	test('hasExistingTranscription: any item in the target lang blocks the save', () => {
		expect(hasExistingTranscription([], 'lg-spa')).toBe(false);
		expect(hasExistingTranscription([{ value: 'x', lang: 'lg-eng' }], 'lg-spa')).toBe(false);
		// PHP: an object item is non-empty even with an empty value → skip.
		expect(hasExistingTranscription([{ value: '', lang: 'lg-spa' }], 'lg-spa')).toBe(true);
		expect(hasExistingTranscription([{ value: 'manual edit', lang: 'lg-spa' }], 'lg-spa')).toBe(
			true,
		);
	});

	const pollJob = {
		status: {
			uri: 'https://babel.example.org/api/',
			key: 'k',
			avUrl: 'https://x/a.mp3',
			engine: 'babel_transcriber',
			userId: 7,
			entityName: 'mib',
			pid: 99,
			lang: 'lg-spa',
		},
		lang: 'lg-spa',
		transcriptionDdo: { component_tipo: 'rsc36', section_tipo: 'rsc167', section_id: 1 },
		userId: 7,
	};

	test('poll: waits on status 2, saves segments on status 3 (delete_result=true)', async () => {
		const seen: TranscriberStatusRequest[] = [];
		const sequence: unknown[] = [
			{ status: 2 },
			{ status: 2 },
			{ status: 3, transcription_data: { segments: [{ start: 1.85, text: ' hi' }] } },
		];
		let sleeps = 0;
		const saves: unknown[] = [];
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async (req) => {
				seen.push(req);
				return sequence.shift();
			},
			save: async (input) => {
				saves.push(input);
				return { saved: true, msg: 'OK. Transcription saved' };
			},
			maxAttempts: 10,
			intervalMs: 1,
			sleep: async () => {
				sleeps += 1;
			},
		});
		expect(outcome.result).toBe(true);
		expect(sleeps).toBe(2);
		expect(seen).toHaveLength(3);
		// server-side polls are the destructive ones (PHP delete_result=true)
		expect(seen.every((req) => req.deleteResult === true)).toBe(true);
		expect(saves).toHaveLength(1);
		expect(saves[0]).toMatchObject({
			lang: 'lg-spa',
			transcriptionDdo: pollJob.transcriptionDdo,
			segments: [{ start: 1.85, text: ' hi' }],
			userId: 7,
		});
	});

	test('poll: the save guard outcome propagates (skip is not a crash)', async () => {
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({
				status: 3,
				transcription_data: { segments: [{ start: 0, text: 'x' }] },
			}),
			save: async () => ({ saved: false, msg: 'component already has data — skipped' }),
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('already has data');
	});

	test('poll: bounded — gives up loudly after maxAttempts, never throws', async () => {
		const outcome = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ status: 2 }),
			save: async () => ({ saved: true, msg: 'unreachable' }),
			maxAttempts: 3,
			sleep: async () => {},
		});
		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('gave up after 3 poll attempts');
	});

	test('poll: status 1 and invalid statuses terminate without saving', async () => {
		const status1 = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ status: 1 }),
			save: async () => {
				throw new Error('must not save');
			},
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(status1.result).toBe(false);
		expect(status1.msg).toContain('status 1');

		const invalid = await pollTranscriptionCompletion(pollJob, {
			provider: async () => ({ result: false, msg: 'invalid transcriber URL' }),
			save: async () => {
				throw new Error('must not save');
			},
			maxAttempts: 2,
			sleep: async () => {},
		});
		expect(invalid.result).toBe(false);
		expect(invalid.msg).toContain('status not valid');
	});
});

describe('remote ASR seam', () => {
	test('resolveTranscriberProvider: babel default, others rejected', () => {
		expect(resolveTranscriberProvider('babel_transcriber').provider).not.toBeNull();
		expect(resolveTranscriberProvider('whisper_x').provider).toBeNull();
		expect(resolveTranscriberProvider('whisper_x').error).toContain('not implemented');
	});
	test('resolveTranscriberConfig finds engine uri/key', () => {
		const toolConfig = {
			config: {
				transcriber_config: { value: [{ name: 'babel_transcriber', uri: 'u', key: 'k' }] },
			},
		};
		expect(resolveTranscriberConfig(toolConfig, 'babel_transcriber')).toEqual({
			uri: 'u',
			key: 'k',
		});
		expect(resolveTranscriberConfig({}, 'babel_transcriber')).toBeNull();
	});
});
