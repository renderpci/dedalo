/**
 * ON-PREMISE ASR GATE.
 *
 * The institution's own recognition box lives at a private address — exactly the
 * addresses the outbound SSRF guard exists to refuse. That refusal is correct for
 * an EXTERNAL service and fatal for a local one, so the exemption is explicit,
 * config-gated and asserted in both directions here: private hosts are refused
 * until `DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS=true` is set, and the cloud
 * metadata address stays refused either way.
 *
 * The other load-bearing assertion is that the audio travels as BYTES. A sidecar
 * on the LAN cannot fetch a public media URL, and publishing one to give it the
 * chance would defeat the reason the institution runs recognition locally.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
	isSafeLocalAsrUrl,
	localAsrProvider,
	localAsrStatusProvider,
	privateTranscriberHostsAllowed,
} from '../../src/core/tools/transcription_local_asr.ts';

/** The exemption is read through the config chain; set it the same way tests do elsewhere. */
function setExemption(value: string | undefined): void {
	if (value === undefined) {
		// biome-ignore lint/performance/noDelete: unsetting an env var is the point
		delete process.env.DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS;
		return;
	}
	process.env.DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS = value;
}

afterEach(() => {
	setExemption(undefined);
});

describe('the private-host exemption', () => {
	test('is OFF by default — a LAN transcriber is refused until it is configured', () => {
		expect(privateTranscriberHostsAllowed()).toBe(false);
		expect(isSafeLocalAsrUrl('http://192.168.1.20:9000')).toBe(false);
		expect(isSafeLocalAsrUrl('http://localhost:9000')).toBe(false);
		expect(isSafeLocalAsrUrl('http://10.0.0.5:9000')).toBe(false);
		expect(isSafeLocalAsrUrl('http://172.16.4.4:9000')).toBe(false);
	});

	test('allows exactly the private ranges once it is on', () => {
		setExemption('true');
		expect(privateTranscriberHostsAllowed()).toBe(true);
		expect(isSafeLocalAsrUrl('http://192.168.1.20:9000')).toBe(true);
		expect(isSafeLocalAsrUrl('http://localhost:9000')).toBe(true);
		expect(isSafeLocalAsrUrl('http://[::1]:9000')).toBe(true);
	});

	test('NEVER allows the cloud metadata endpoint, exemption or not', () => {
		setExemption('true');
		expect(isSafeLocalAsrUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
	});

	test('non-http protocols and malformed URLs are refused', () => {
		setExemption('true');
		expect(isSafeLocalAsrUrl('file:///etc/passwd')).toBe(false);
		expect(isSafeLocalAsrUrl('gopher://192.168.1.20')).toBe(false);
		expect(isSafeLocalAsrUrl('not a url')).toBe(false);
	});

	test('a public transcriber is allowed without the exemption', () => {
		expect(isSafeLocalAsrUrl('https://asr.example.org/api')).toBe(true);
	});
});

describe('localAsrProvider', () => {
	test('POSTs the audio BYTES and returns the job id as the pid', async () => {
		setExemption('true');

		let seen: { url: string; form: FormData } | null = null;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			seen = { url: String(url), form: init?.body as FormData };
			return new Response(JSON.stringify({ id: 'job-42' }), { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const result = await localAsrProvider({
				uri: 'http://192.168.1.20:9000/',
				key: 'secret',
				engine: 'local_whisper',
				quality: 'large-v3',
				audioUrl: '',
				audioPath: '/media/av/audio_tr/rsc35_rsc167_506.wav',
				langTld2: 'es',
				userId: 7,
				entityName: 'mib',
				readFile: async () => new Blob([new Uint8Array([1, 2, 3])]),
			});

			expect(result.result).toEqual({ pid: 'job-42' });
			expect(seen!.url).toBe('http://192.168.1.20:9000/jobs');
			expect(seen!.form.get('language')).toBe('es');
			expect(seen!.form.get('model')).toBe('large-v3');
			// The audio is a file part, not a URL string anywhere in the request.
			expect(seen!.form.get('audio')).toBeInstanceOf(Blob);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('refuses to submit without the audio path (never falls back to a URL)', async () => {
		setExemption('true');
		const result = await localAsrProvider({
			uri: 'http://192.168.1.20:9000',
			key: '',
			engine: 'local_whisper',
			quality: 'large-v3',
			audioUrl: 'https://public.example.org/media/audio.mp4',
			langTld2: 'es',
			userId: 7,
			entityName: 'mib',
		});

		expect(result.result).toBe(false);
		expect(result.msg).toContain('audio file path');
	});

	test('a refused URL explains what to configure', async () => {
		const result = await localAsrProvider({
			uri: 'http://192.168.1.20:9000',
			key: '',
			engine: 'local_whisper',
			quality: 'large-v3',
			audioUrl: '',
			audioPath: '/tmp/x.wav',
			langTld2: 'es',
			userId: 7,
			entityName: 'mib',
		});

		expect(result.result).toBe(false);
		expect(result.msg).toContain('DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS');
	});
});

describe('localAsrStatusProvider', () => {
	const request = {
		uri: 'http://192.168.1.20:9000',
		key: '',
		avUrl: '',
		engine: 'local_whisper',
		userId: 7,
		entityName: 'mib',
		pid: 'job-42',
		deleteResult: true,
	};

	/** Answer the next status GET with `body`. */
	function stubFetch(body: unknown): () => void {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
		return () => {
			globalThis.fetch = originalFetch;
		};
	}

	test('maps the sidecar states onto the shared poll codes', async () => {
		setExemption('true');

		let restore = stubFetch({ state: 'queued' });
		expect(await localAsrStatusProvider(request)).toEqual({ status: 2 });
		restore();

		restore = stubFetch({ state: 'running' });
		expect(await localAsrStatusProvider(request)).toEqual({ status: 2 });
		restore();

		restore = stubFetch({ state: 'error', error: 'model not found' });
		expect(await localAsrStatusProvider(request)).toEqual({
			status: 1,
			msg: 'model not found',
		});
		restore();
	});

	test('a finished job carries the segments through WITH their end and speaker', async () => {
		setExemption('true');
		const restore = stubFetch({
			state: 'done',
			segments: [
				{ start: 0, end: 4, text: 'Pues nos fuimos', speaker: 'INFORMANTE' },
				{ start: 4, end: 8, text: 'al pueblo de mi abuela.', speaker: 'INFORMANTE' },
			],
		});

		try {
			const status = (await localAsrStatusProvider(request)) as {
				status: number;
				transcription_data: { segments: { end: number; speaker: string }[] };
			};

			expect(status.status).toBe(3);
			// `end` and `speaker` are what the paragraph grouper breaks on; dropping
			// them here would silently cost the transcript its structure.
			expect(status.transcription_data.segments[0]!.end).toBe(4);
			expect(status.transcription_data.segments[0]!.speaker).toBe('INFORMANTE');
		} finally {
			restore();
		}
	});
});
