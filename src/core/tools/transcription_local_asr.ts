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

import { isIP } from 'node:net';
import { readString } from '../../config/readers.ts';
import { fetchBoundedText, isPrivateIp } from '../security/ssrf_guard.ts';
import type {
	TranscribeRequest,
	TranscribeResult,
	TranscriberStatusProvider,
	TranscriberStatusRequest,
	TranscriptionSegment,
} from './transcription_asr.ts';

/**
 * TRANSPORT BUDGETS for the sidecar (CARRY-14).
 *
 * These three calls carried no signal, no timeout and no byte ceiling: a sidecar
 * that accepted the connection and then stalled held a BACKGROUND JOB LANE — of
 * which the engine has three, shared by every class of background work — for as
 * long as it liked, and one that answered without bound fed the process without
 * bound. Neither is a write hazard (an awaited fetch blocks no event loop and
 * holds no transaction, per Wave 5's correction), but lane occupancy is exactly
 * how a museum's media processing stops.
 *
 * The submit budget is generous because it UPLOADS the recording — an hour of
 * WAV over a LAN is minutes, and a transcription job that dies at the door is
 * worse than one that takes a while. Poll and models are interactive and small.
 */
const SUBMIT_TIMEOUT_MS = 10 * 60_000;
const POLL_TIMEOUT_MS = 30_000;
const MODELS_TIMEOUT_MS = 15_000;
/** A transcript of a long recording is large; a job id or a model list is not. */
const TRANSCRIPT_MAX_BYTES = 32 * 1024 * 1024;
const SMALL_MAX_BYTES = 1 * 1024 * 1024;

/**
 * One bounded call to the sidecar, parsed. Returns null when the peer refused,
 * timed out, exceeded the ceiling or did not answer JSON — every caller here
 * already has a "could not reach the transcriber" branch, and none of them can
 * do anything more useful with the distinction.
 *
 * It deliberately does NOT apply an address policy: `isSafeLocalAsrUrl` is this
 * module's policy, and it PERMITS private hosts behind the named exemption,
 * which is the whole reason this provider exists.
 */
async function sidecarJson(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	maxBytes: number,
): Promise<unknown | null> {
	const text = await fetchBoundedText(url, { init, timeoutMs, maxBytes });
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

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
 * URL guard for the on-premise engine. http(s) only; private/reserved ranges
 * only when the exemption above is on.
 *
 * SSRF-02 (2026-07-28 audit): the old string blocklist missed 0.0.0.0,
 * 127.0.0.0/8 (only .1), ::, ::ffff:, decimal/octal IPs, 100.64/10 and the rest
 * of 169.254/16 — so with the exemption OFF it still reached the engine's own
 * network through any of those IP-literal forms. It now vets IP-literal hosts
 * through the shared isPrivateIp (comprehensive v4+v6 range set) and treats the
 * localhost NAME family as private. Kept synchronous (no DNS) so it stays
 * hermetic; a NAME that resolves to an internal IP is a documented residual —
 * the attacker-supplied-URL path (RDF import) uses the resolving assertPublicUrl
 * guard instead.
 */
export function isSafeLocalAsrUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

	// The cloud metadata endpoint is never a transcriber, exemption or not.
	if (host === '169.254.169.254') return false;

	// Is the target private/internal? For IP LITERALS this is now comprehensive
	// via the shared isPrivateIp (SSRF-02 closed the old bypasses: 0.0.0.0,
	// 127.0.0.0/8, ::ffff:a.b.c.d, decimal/octal IPs, 100.64/10, all of
	// 169.254/16). For NAMES, the localhost family is treated as private; any
	// other name is treated as public here (a name that RESOLVES to an internal
	// IP is a documented residual — the attacker-supplied-URL path uses the
	// resolving assertPublicUrl guard instead).
	const localNames = new Set([
		'localhost',
		'localhost.localdomain',
		'ip6-localhost',
		'ip6-loopback',
	]);
	const isPrivate =
		isIP(host) !== 0
			? isPrivateIp(host)
			: localNames.has(host) || host.endsWith('.local') || host.endsWith('.localhost');

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
/*
 * COVERAGE-EXEMPT — the PROVIDER CALL below (coverage plan §5.2; reason
 * registered in engineering/crap_coverage_exempt.json): it posts to a
 * third-party / sidecar service over the network. Never fetch in a test — a gate
 * would be non-hermetic and hostage to someone else's uptime. The pure halves in
 * these files (engine mapping, config resolution, URL safety, segment folding)
 * ARE gateable and are not covered by this exemption.
 */
export async function localAsrProvider(req: LocalTranscribeRequest): Promise<TranscribeResult> {
	if (!isSafeLocalAsrUrl(req.uri)) {
		return {
			ok: false,
			msg: privateTranscriberHostsAllowed()
				? 'invalid transcriber URL'
				: 'invalid transcriber URL (a private/loopback address needs DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS=true)',
		};
	}
	if (req.audioPath === undefined || req.audioPath === '') {
		return { ok: false, msg: 'the on-premise transcriber needs the audio file path' };
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

		const body = (await sidecarJson(
			endpoint(req.uri, 'jobs'),
			{
				method: 'POST',
				headers: req.key !== '' ? { Authorization: `Bearer ${req.key}` } : undefined,
				body: form,
			},
			SUBMIT_TIMEOUT_MS,
			SMALL_MAX_BYTES,
		)) as { id?: string | number } | null;
		if (body === null) return { ok: false, msg: 'the transcriber did not answer' };
		if (body.id === undefined || body.id === null) {
			return { ok: false, msg: 'transcriber returned no job id' };
		}
		return { ok: true, pid: body.id, msg: 'ok' };
	} catch (error) {
		return { ok: false, msg: (error as Error).message };
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
	if (!isSafeLocalAsrUrl(req.uri)) return { ok: false, msg: 'invalid transcriber URL' };

	try {
		const body = (await sidecarJson(
			endpoint(req.uri, `jobs/${encodeURIComponent(String(req.pid))}`),
			{
				method: 'GET',
				headers: req.key !== '' ? { Authorization: `Bearer ${req.key}` } : undefined,
			},
			POLL_TIMEOUT_MS,
			TRANSCRIPT_MAX_BYTES,
		)) as {
			state?: string;
			segments?: TranscriptionSegment[];
			error?: string;
		} | null;
		if (body === null) return { ok: false, msg: 'the transcriber did not answer' };

		if (body.state === 'queued' || body.state === 'running') return { status: 2 };
		if (body.state === 'done') {
			return {
				status: 3,
				transcription_data: { segments: Array.isArray(body.segments) ? body.segments : [] },
			};
		}
		return { status: 1, msg: body.error ?? `unknown transcriber state: ${String(body.state)}` };
	} catch (error) {
		return { ok: false, msg: (error as Error).message };
	}
};

/** The models the sidecar offers, for the UI's model picker. Empty on failure. */
export async function localAsrModels(
	uri: string,
	key: string,
): Promise<{ name: string; label?: string; languages?: string; notes?: string }[]> {
	if (!isSafeLocalAsrUrl(uri)) return [];
	try {
		const body = (await sidecarJson(
			endpoint(uri, 'models'),
			{ headers: key !== '' ? { Authorization: `Bearer ${key}` } : undefined },
			MODELS_TIMEOUT_MS,
			SMALL_MAX_BYTES,
		)) as { models?: { name?: string }[] } | null;
		if (body === null) return [];
		return Array.isArray(body.models)
			? (body.models.filter((model) => typeof model.name === 'string') as { name: string }[])
			: [];
	} catch {
		return [];
	}
}
