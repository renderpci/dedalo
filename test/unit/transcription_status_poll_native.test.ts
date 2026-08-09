/**
 * THE STATUS POLL AND THE PUBLISHED AUDIO URL (audit 2026-08 §5.6).
 *
 * `engineering/TRANSCRIPTION.md`'s law: *recorded interviews are personal data;
 * recognition happens on hardware the institution controls*. The on-premise
 * sidecar (`local_whisper`) is handed the audio AS BYTES precisely so nothing
 * about a recording is ever published — `DEDALO_MEDIA_EXPORT_BASE` is
 * irrelevant to it, and an install running only the sidecar has no reason to
 * configure one.
 *
 * `check_server_transcriber_status` nevertheless built the EXTERNAL media URL
 * for every engine, so an on-premise poll died with a configuration error: the
 * client stopped polling, kept the pid and left the transcribe button disabled
 * forever. Building a public URL for the on-premise path is a privacy smell as
 * much as a bug.
 *
 * These gates pin the rule at three places:
 *
 *  - the pure seam — which engines need the published URL (the decision the
 *    handler must consult BEFORE building one);
 *  - the SERVER-SIDE completion poll, which is the on-premise status path that
 *    actually runs: it defaulted to the babel provider for every engine, so a
 *    `local_whisper` job was polled by POSTing babel's `check_status` to a
 *    sidecar that speaks `GET jobs/<id>` — the transcript never landed;
 *  - the babel provider's refusal to poll without the URL that identifies the
 *    job, which must reach the caller as a THROW rather than be laundered into
 *    the `{result:false, msg}` envelope reserved for transcriber failures.
 *
 * The remaining half (the CLIENT poll handler must not COMPUTE the URL for an
 * engine that does not need it) is in `tools/tool_transcription/server/index.ts`.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
	babelTranscriberStatusProvider,
	buildTranscriberStatusBody,
	LOCAL_ASR_ENGINE,
	pollTranscriptionCompletion,
	statusPollNeedsExternalAudioUrl,
	type TranscriberStatusRequest,
	type TranscriptionSegment,
} from '../../src/core/tools/transcription_asr.ts';

const BASE: Omit<TranscriberStatusRequest, 'engine'> = {
	uri: 'https://asr.example.org/api',
	key: 'k',
	/** No published URL — the caller SAYING so, not forgetting it. */
	avUrl: null,
	userId: 16,
	entityName: 'test_entity',
	pid: 4242,
	deleteResult: false,
};

const REAL_FETCH = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = REAL_FETCH;
});

describe('statusPollNeedsExternalAudioUrl', () => {
	test('the on-premise engine never needs a published audio URL', () => {
		expect(statusPollNeedsExternalAudioUrl(LOCAL_ASR_ENGINE)).toBe(false);
	});

	test('the external babel engines DO — babel keys the job by that URL', () => {
		for (const engine of ['babel_transcriber', 'local', '']) {
			expect(statusPollNeedsExternalAudioUrl(engine)).toBe(true);
		}
	});
});

describe('pollTranscriptionCompletion — the provider follows the ENGINE', () => {
	// THE defect audit §5.6/3 names on the server side. The completion poll
	// defaulted to `babelTranscriberStatusProvider` whatever engine had produced
	// the job, so an on-premise job — enqueued with engine 'local_whisper' — was
	// polled by POSTing babel's `check_status` form to a sidecar whose only
	// status endpoint is `GET jobs/<id>`. The job never reported done and the
	// transcript was never written back. The engine chose the submit provider; it
	// must choose the status provider too.
	test('an on-premise job polls the SIDECAR, never babel check_status', async () => {
		const seen: { url: string; method: string }[] = [];
		globalThis.fetch = (async (url: unknown, init?: { method?: string }) => {
			seen.push({ url: String(url), method: String(init?.method ?? 'GET') });
			return new Response(
				JSON.stringify({ state: 'done', segments: [{ start: 0, end: 1.5, text: 'hola' }] }),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}) as unknown as typeof fetch;

		const savedSegments: TranscriptionSegment[][] = [];
		const outcome = await pollTranscriptionCompletion(
			{
				status: { ...BASE, engine: LOCAL_ASR_ENGINE, pid: 'job-7' },
				lang: 'lg-spa',
				transcriptionDdo: { component_tipo: 'rsc36', section_tipo: 'rsc167', section_id: 1 },
				userId: 16,
			},
			{
				maxAttempts: 1,
				save: async ({ segments }) => {
					savedSegments.push([...segments]);
					return { saved: true, msg: 'OK. Transcription saved' };
				},
			},
		);

		expect(outcome.result).toBe(true);
		expect(seen).toEqual([{ url: 'https://asr.example.org/api/jobs/job-7', method: 'GET' }]);
		expect(savedSegments).toEqual([[{ start: 0, end: 1.5, text: 'hola' }]]);
	});

	test('an engine with NO status provider refuses loudly instead of polling babel', async () => {
		globalThis.fetch = (async () => {
			throw new Error('the poll must not reach the network for an unimplemented engine');
		}) as unknown as typeof fetch;

		const outcome = await pollTranscriptionCompletion({
			status: { ...BASE, engine: 'google_translation', avUrl: 'https://media.example.org/a.mp3' },
			lang: 'lg-spa',
			transcriptionDdo: { component_tipo: 'rsc36', section_tipo: 'rsc167', section_id: 1 },
			userId: 16,
		});

		expect(outcome.result).toBe(false);
		expect(outcome.msg).toContain('not implemented');
	});

	test('an explicit provider still wins (the test/DI seam is unchanged)', async () => {
		const outcome = await pollTranscriptionCompletion(
			{
				status: { ...BASE, engine: LOCAL_ASR_ENGINE },
				lang: 'lg-spa',
				transcriptionDdo: { component_tipo: 'rsc36', section_tipo: 'rsc167', section_id: 1 },
				userId: 16,
			},
			{ provider: async () => ({ status: 1 }), maxAttempts: 1 },
		);
		expect(outcome.msg).toContain('status 1');
	});
});

describe('babelTranscriberStatusProvider — a caller error is not a transcriber failure', () => {
	test('a missing av_url THROWS out of the provider, never a {result:false} envelope', async () => {
		globalThis.fetch = (async () => {
			throw new Error('the provider must not reach the network without an av_url');
		}) as unknown as typeof fetch;

		// The `{result:false, msg}` shape means "the transcriber said no / is
		// unreachable". A caller that forgot the job key is a PROGRAMMING error and
		// must not be reported as a server problem: swallowed into that envelope it
		// reached the poll as an unrecognised status and lost the real message.
		expect(
			babelTranscriberStatusProvider({ ...BASE, engine: 'babel_transcriber' }),
		).rejects.toThrow(/av_url/);
	});
});

describe('buildTranscriberStatusBody', () => {
	test('a body is built with NO av_url for an engine that does not need one', () => {
		const body = buildTranscriberStatusBody({ ...BASE, engine: LOCAL_ASR_ENGINE });
		expect(body.get('av_url')).toBeNull();
		expect(body.get('pid')).toBe('4242');
		expect(body.get('method_name')).toBe('check_status');
	});

	test('an external poll WITHOUT the audio URL throws instead of sending garbage', () => {
		// It used to POST the literal string "undefined" as av_url, so babel
		// answered "no job for this url" and the client polled a dead handle.
		expect(() => buildTranscriberStatusBody({ ...BASE, engine: 'babel_transcriber' })).toThrow(
			/av_url/,
		);
		expect(() =>
			buildTranscriberStatusBody({ ...BASE, engine: 'babel_transcriber', avUrl: '' }),
		).toThrow(/av_url/);
	});

	test('an external poll WITH the audio URL sends it unchanged', () => {
		const avUrl = 'https://media.example.org/dedalo/media/av/audio/rsc167_rsc167_1.mp3';
		const body = buildTranscriberStatusBody({ ...BASE, engine: 'babel_transcriber', avUrl });
		expect(body.get('av_url')).toBe(avUrl);
	});
});
