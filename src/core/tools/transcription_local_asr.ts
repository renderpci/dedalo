/**
 * THE ON-PREMISE ASR ENGINE — speech recognition on a machine the institution
 * owns, for the institutions whose staff computers cannot run it themselves.
 *
 * WHY IT IS SEPARATE FROM THE BABEL SEAM. The existing remote engine talks to an
 * EXTERNAL service: it is handed a public URL to fetch the audio from, and the
 * SSRF guard deliberately refuses loopback and private address ranges, because an
 * external service has no business asking the engine to fetch from inside the
 * network. An on-premise sidecar is the exact opposite case — it lives at
 * 192.168.x.x, it must never be reachable from outside, and handing it a public
 * media URL would be both pointless and a leak. So it gets its own provider:
 *
 *   - the audio is POSTed AS BYTES from the engine's own disk, so nothing about
 *     the recording is published and DEDALO_MEDIA_EXPORT_BASE is irrelevant;
 *   - private/loopback hosts are permitted, but ONLY behind an explicit,
 *     config-gated, named exemption (DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS).
 *     Silence is never the permissive answer.
 *
 * The sidecar contract is deliberately tiny (documented in
 * engineering/TRANSCRIPTION.md), so faster-whisper, WhisperX, whisper.cpp or
 * anything else can sit behind it:
 *
 *   GET  <uri>/models          → { models: [ { name, label, languages, notes } ] }
 *   POST <uri>/jobs            → multipart { audio, language, model } → { id }
 *   GET  <uri>/jobs/<id>       → { state: 'queued'|'running'|'done'|'error',
 *                                  segments?: [ { start, end, text, speaker? } ],
 *                                  error?: string }
 *
 * Job states are adapted to the SAME status codes the existing background poll
 * understands (1 nothing / 2 working / 3 done), so completion, the transcript
 * write-back and the time-machine-audited save are shared with the other engine
 * instead of duplicated.
 */

import { readString } from '../../config/readers.ts';
import type {
	TranscribeRequest,
	TranscribeResult,
	TranscriberStatusProvider,
	TranscriberStatusRequest,
	TranscriptionSegment,
} from './transcription_asr.ts';

/**
 * Whether a transcriber may live on a private/loopback address.
 *
 * OFF by default: with it off, this provider behaves exactly like the external
 * one and cannot be pointed at the engine's own network. An institution running
 * a recognition box on its LAN turns it on deliberately, and the reason is
 * recorded here rather than implied by a missing check.
 */
export function privateTranscriberHostsAllowed(): boolean {
	return (readString('DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS') ?? '').trim() === 'true';
}

/**
 * URL guard for the on-premise engine. http(s) only, and private ranges only
 * when the exemption above is on.
 */
export function isSafeLocalAsrUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

	const host = url.hostname.toLowerCase();
	const isPrivate =
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '::1' ||
		host === '[::1]' ||
		/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

	// The cloud metadata endpoint is never a transcriber, exemption or not.
	if (host === '169.254.169.254') return false;

	return isPrivate ? privateTranscriberHostsAllowed() : true;
}

/** Join a base URI and a path without doubling or dropping the separator. */
function endpoint(uri: string, path: string): string {
	return `${uri.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** A transcribe request that carries the audio's LOCAL path (bytes, not a URL). */
export interface LocalTranscribeRequest extends TranscribeRequest {
	/** Absolute path of the audio file on the engine's own disk. */
	audioPath?: string;
	/** Injectable reader (tests); defaults to Bun.file. */
	readFile?: (path: string) => Promise<Blob>;
}

/**
 * Submit a job to the on-premise engine: the audio bytes, the language and the
 * model, in one multipart POST. Returns the sidecar's job id as the pid, so the
 * rest of the pipeline (the client poll, the background completion poll, the
 * write-back) is byte-for-byte the same as for the external engine.
 */
export async function localAsrProvider(req: LocalTranscribeRequest): Promise<TranscribeResult> {
	if (!isSafeLocalAsrUrl(req.uri)) {
		return {
			result: false,
			msg: privateTranscriberHostsAllowed()
				? 'invalid transcriber URL'
				: 'invalid transcriber URL (a private/loopback address needs DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS=true)',
		};
	}
	if (req.audioPath === undefined || req.audioPath === '') {
		return { result: false, msg: 'the on-premise transcriber needs the audio file path' };
	}

	try {
		const read = req.readFile ?? (async (path: string) => Bun.file(path) as unknown as Blob);
		const audio = await read(req.audioPath);

		const form = new FormData();
		form.set('audio', audio, 'audio_tr.wav');
		form.set('language', req.langTld2);
		form.set('model', req.quality);
		// Identity travels for the sidecar's own logging, never for authorisation:
		// the engine has already gated the request before reaching here.
		form.set('entity_name', req.entityName);
		form.set('user_id', String(req.userId));

		const res = await fetch(endpoint(req.uri, 'jobs'), {
			method: 'POST',
			headers: req.key !== '' ? { Authorization: `Bearer ${req.key}` } : undefined,
			body: form,
		});
		if (!res.ok) return { result: false, msg: `transcriber HTTP ${res.status}` };

		const body = (await res.json()) as { id?: string | number };
		if (body.id === undefined || body.id === null) {
			return { result: false, msg: 'transcriber returned no job id' };
		}
		return { result: { pid: body.id }, msg: 'ok' };
	} catch (error) {
		return { result: false, msg: (error as Error).message };
	}
}

/**
 * Poll a sidecar job and translate its answer into the status shape the shared
 * completion poll consumes:
 *   queued/running → 2 (keep waiting)
 *   done           → 3 + the segments
 *   error/unknown  → 1 (terminal, nothing to save)
 *
 * Segments are passed through with their `end` and `speaker` intact — the
 * paragraph grouper uses both, and dropping them here would silently cost the
 * transcript its structure.
 */
export const localAsrStatusProvider: TranscriberStatusProvider = async (
	req: TranscriberStatusRequest,
) => {
	if (!isSafeLocalAsrUrl(req.uri)) return { result: false, msg: 'invalid transcriber URL' };

	try {
		const res = await fetch(endpoint(req.uri, `jobs/${encodeURIComponent(String(req.pid))}`), {
			method: 'GET',
			headers: req.key !== '' ? { Authorization: `Bearer ${req.key}` } : undefined,
		});
		if (!res.ok) return { result: false, msg: `transcriber HTTP ${res.status}` };

		const body = (await res.json()) as {
			state?: string;
			segments?: TranscriptionSegment[];
			error?: string;
		};

		if (body.state === 'queued' || body.state === 'running') return { status: 2 };
		if (body.state === 'done') {
			return {
				status: 3,
				transcription_data: { segments: Array.isArray(body.segments) ? body.segments : [] },
			};
		}
		return { status: 1, msg: body.error ?? `unknown transcriber state: ${String(body.state)}` };
	} catch (error) {
		return { result: false, msg: (error as Error).message };
	}
};

/** The models the sidecar offers, for the UI's model picker. Empty on failure. */
export async function localAsrModels(
	uri: string,
	key: string,
): Promise<{ name: string; label?: string; languages?: string; notes?: string }[]> {
	if (!isSafeLocalAsrUrl(uri)) return [];
	try {
		const res = await fetch(endpoint(uri, 'models'), {
			headers: key !== '' ? { Authorization: `Bearer ${key}` } : undefined,
		});
		if (!res.ok) return [];
		const body = (await res.json()) as { models?: { name?: string }[] };
		return Array.isArray(body.models)
			? (body.models.filter((model) => typeof model.name === 'string') as { name: string }[])
			: [];
	} catch {
		return [];
	}
}
