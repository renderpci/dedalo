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
import { fetchBoundedText, isPrivateIp, mappedIpv4 } from '../security/ssrf_guard.ts';
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
 * ONE BOUNDED CALL to the sidecar, as a TAGGED union: either the parsed `body`,
 * or the reason it failed reduced to an `httpStatus` (null when there was no
 * HTTP answer at all).
 *
 * The distinction is NOT decoration. The status poll's caller treats any reply
 * without a numeric `status` field as TERMINAL, so collapsing every failure into
 * one "did not answer" abandoned a transcription the sidecar was still working
 * on the first time the network hiccuped for 30 seconds. A missing job is
 * terminal; a blip is not, and only the status can tell them apart.
 *
 * TAGGED (`kind`) rather than probed (`'body' in answer`): all three callers
 * below decide on that tag, so the failure branch is a case the compiler knows
 * about instead of something a happy-path edit can quietly leave out.
 */
type SidecarAnswer =
	| { kind: 'body'; body: unknown }
	| { kind: 'failed'; httpStatus: number | null };

/**
 * The call itself.
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
): Promise<SidecarAnswer> {
	try {
		const text = await fetchBoundedText(url, { init, timeoutMs, maxBytes });
		return { kind: 'body', body: JSON.parse(text) };
	} catch (error) {
		// The HTTP status when there was one, so a caller can tell "this job is
		// GONE" (terminal) from "the box hiccuped" (retry). Anything else — a
		// timeout, a refused connection, an unparseable body — has no status.
		const coordinates = (error as { coordinates?: { status?: unknown } }).coordinates;
		const status = typeof coordinates?.status === 'number' ? coordinates.status : null;
		return { kind: 'failed', httpStatus: status };
	}
}

/**
 * The sidecar's bearer header, or none at all. An unconfigured key must not
 * travel as an empty `Bearer ` — a sidecar that checks the header would refuse
 * the job outright rather than run it unauthenticated.
 */
function authHeaders(key: string): Record<string, string> | undefined {
	return key !== '' ? { Authorization: `Bearer ${key}` } : undefined;
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
 * The host a transcriber URI addresses — lowercased, unbracketed and
 * NORMALISED — or null when the URI is not a usable http(s) address at all.
 *
 * NORMALISE FIRST. An IPv4-mapped IPv6 address is the same address wearing a
 * different spelling, and the WHATWG parser rewrites the dotted form into hex
 * on the way in — so `[::ffff:169.254.169.254]` arrives as `::ffff:a9fe:a9fe`
 * and matched no literal in the refusals its caller applies. With the
 * private-host exemption ON (which is this provider's whole purpose) that made
 * the metadata-endpoint refusal reachable.
 */
function asrUrlHost(uri: string): string | null {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	const rawHost = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	return mappedIpv4(rawHost) ?? rawHost;
}

/**
 * Is the target inside the engine's own network?
 *
 * For IP LITERALS this is comprehensive via the shared isPrivateIp (SSRF-02
 * closed the old bypasses: 0.0.0.0, 127.0.0.0/8, ::ffff:a.b.c.d, decimal/octal
 * IPs, 100.64/10, all of 169.254/16). For NAMES, the localhost family is
 * treated as private; any other name is treated as public here — a name that
 * RESOLVES to an internal IP is a documented residual, and the
 * attacker-supplied-URL path uses the resolving assertPublicUrl guard instead.
 */
function isInternalAsrHost(host: string): boolean {
	if (isIP(host) !== 0) return isPrivateIp(host);
	const localNames = new Set([
		'localhost',
		'localhost.localdomain',
		'ip6-localhost',
		'ip6-loopback',
	]);
	return localNames.has(host) || host.endsWith('.local') || host.endsWith('.localhost');
}

/**
 * URL guard for the on-premise engine. http(s) only; private/reserved ranges
 * only when the exemption is on. Kept synchronous (no DNS) so it stays hermetic.
 *
 * SSRF-02 (2026-07-28 audit): the old string blocklist missed 0.0.0.0,
 * 127.0.0.0/8 (only .1), ::, ::ffff:, decimal/octal IPs, 100.64/10 and the rest
 * of 169.254/16 — so with the exemption OFF it still reached the engine's own
 * network through any of those IP-literal forms. The two helpers above carry
 * that vetting now; what is left here is the POLICY, in three sentences.
 */
export function isSafeLocalAsrUrl(uri: string): boolean {
	const host = asrUrlHost(uri);
	if (host === null) return false;

	// The cloud metadata endpoints are never a transcriber, exemption or not:
	// they hand out the instance's credentials to anything that can address them.
	const METADATA_HOSTS = new Set(['169.254.169.254', '169.254.170.2', 'metadata.google.internal']);
	if (METADATA_HOSTS.has(host)) return false;

	return isInternalAsrHost(host) ? privateTranscriberHostsAllowed() : true;
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
 * THIS REQUEST'S OWN PRECONDITIONS, decided before anything leaves the machine:
 * either the audio path to post, or the message the operator has to act on.
 *
 * A union rather than a boolean because the ready case CARRIES the value the
 * caller needs — which is what stops `localAsrProvider` re-checking a path that
 * has already been checked (and re-checking it with a `??` that would quietly
 * accept the very emptiness this refuses).
 */
type SubmitPrecondition = { kind: 'ready'; audioPath: string } | { kind: 'refused'; msg: string };

function submitPrecondition(req: LocalTranscribeRequest): SubmitPrecondition {
	if (!isSafeLocalAsrUrl(req.uri)) {
		return {
			kind: 'refused',
			// Naming the key is the difference between a dead end and a fix: with the
			// exemption OFF, a private/loopback sidecar is the expected mistake.
			msg: privateTranscriberHostsAllowed()
				? 'invalid transcriber URL'
				: 'invalid transcriber URL (a private/loopback address needs DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS=true)',
		};
	}
	if (req.audioPath === undefined || req.audioPath === '') {
		return { kind: 'refused', msg: 'the on-premise transcriber needs the audio file path' };
	}
	return { kind: 'ready', audioPath: req.audioPath };
}

/**
 * The multipart body one submission carries: the audio bytes off the engine's
 * own disk, plus what the sidecar needs to transcribe them.
 */
async function submitForm(req: LocalTranscribeRequest, audioPath: string): Promise<FormData> {
	const read = req.readFile ?? (async (path: string) => Bun.file(path) as unknown as Blob);
	const form = new FormData();
	form.set('audio', await read(audioPath), 'audio_tr.wav');
	form.set('language', req.langTld2);
	form.set('model', req.quality);
	// Identity travels for the sidecar's own logging, never for authorisation:
	// the engine has already gated the request before reaching here.
	form.set('entity_name', req.entityName);
	form.set('user_id', String(req.userId));
	return form;
}

/**
 * Why a submission that produced no parsed body failed, in one line for the
 * operator.
 *
 * The SUBMIT side only ever needs the message: a submit that failed IS terminal
 * — nothing was started, so there is no job to keep waiting for. That is the
 * whole difference from `pollTransportStatus`, which must decide between "gone"
 * and "hiccup" because on the poll side a job may well still be running.
 */
function submitFailureMessage(httpStatus: number | null): string {
	return httpStatus === null ? 'the transcriber did not answer' : `transcriber HTTP ${httpStatus}`;
}

/** The job id the sidecar answered with, or null when it named none. */
function submittedJobId(body: unknown): string | number | null {
	const id = (body as { id?: string | number }).id;
	return id === undefined || id === null ? null : id;
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
	const precondition = submitPrecondition(req);
	if (precondition.kind === 'refused') return { ok: false, msg: precondition.msg };

	try {
		const answer = await sidecarJson(
			endpoint(req.uri, 'jobs'),
			{
				method: 'POST',
				headers: authHeaders(req.key),
				body: await submitForm(req, precondition.audioPath),
			},
			SUBMIT_TIMEOUT_MS,
			SMALL_MAX_BYTES,
		);
		if (answer.kind === 'failed') {
			return { ok: false, msg: submitFailureMessage(answer.httpStatus) };
		}
		const pid = submittedJobId(answer.body);
		if (pid === null) return { ok: false, msg: 'transcriber returned no job id' };
		return { ok: true, pid, msg: 'ok' };
	} catch (error) {
		return { ok: false, msg: (error as Error).message };
	}
}

/**
 * WHAT THE SHARED COMPLETION POLL READS BACK (transcription_asr.ts): a NUMERIC
 * `status` — 1 nothing / 2 working / 3 done — plus what belongs to it. A reply
 * WITHOUT one is read as terminal (`Number(undefined)` is NaN), which is why
 * every branch of the poll below returns this shape and none returns a bare
 * failure.
 *
 * `unreachable` is carried SEPARATELY from the status because the two consumers
 * need opposite things from the same fact. The background completion loop must
 * keep waiting — the sidecar may still be working — while the CLIENT poll must
 * be able to say so: it fails only on `ok === false`, so a bare `{status:2}`
 * left a curator watching 'Processing' every four seconds, forever, against an
 * unplugged box, with nothing anywhere reporting the outage.
 */
interface PollStatus {
	status: 1 | 2 | 3;
	msg?: string;
	/** The poll never reached the sidecar (as opposed to it saying "still working"). */
	unreachable?: true;
	transcription_data?: { segments: TranscriptionSegment[] };
}

/**
 * THE JOB IS GONE vs THE BOX HICCUPED — a poll that got no parsed body,
 * translated into a status.
 *
 * The caller's loop reads any reply with no numeric `status` as terminal, so
 * returning a flat failure here abandoned a transcription still running on the
 * sidecar — a curator's hour of audio, dropped by one 30-second stall. Only
 * 404/410 actually says the job is not there; everything else is 'keep
 * waiting', and the loop's own attempt ceiling is what stops it going on
 * forever.
 */
function pollTransportStatus(httpStatus: number | null, pid: string): PollStatus {
	if (httpStatus === 404 || httpStatus === 410) {
		return { status: 1, msg: `the transcriber no longer has job ${pid}` };
	}
	return {
		status: 2,
		unreachable: true,
		msg:
			httpStatus === null
				? 'the transcriber did not answer this poll — still waiting'
				: `transcriber HTTP ${httpStatus} on poll — still waiting`,
	};
}

/**
 * The sidecar's own job states, mapped onto the status codes the shared
 * completion poll understands:
 *   queued/running → 2 (keep waiting)
 *   done           → 3 + the segments
 *   error/unknown  → 1 (terminal, nothing to save)
 *
 * Segments are passed through with their `end` and `speaker` intact — the
 * paragraph grouper uses both, and dropping them here would silently cost the
 * transcript its structure.
 */
function pollStateStatus(body: {
	state?: string;
	segments?: TranscriptionSegment[];
	error?: string;
}): PollStatus {
	if (body.state === 'queued' || body.state === 'running') return { status: 2 };
	if (body.state === 'done') {
		return {
			status: 3,
			transcription_data: { segments: Array.isArray(body.segments) ? body.segments : [] },
		};
	}
	return { status: 1, msg: body.error ?? `unknown transcriber state: ${String(body.state)}` };
}

/**
 * Poll a sidecar job. The two translations it needs — a transport failure into
 * "gone or hiccup", and a job state into a status code — are the two functions
 * above, so what is left here is the one call and the two arms of SidecarAnswer.
 */
export const localAsrStatusProvider: TranscriberStatusProvider = async (
	req: TranscriberStatusRequest,
) => {
	if (!isSafeLocalAsrUrl(req.uri)) return { ok: false, msg: 'invalid transcriber URL' };

	try {
		const answer = await sidecarJson(
			endpoint(req.uri, `jobs/${encodeURIComponent(String(req.pid))}`),
			{ method: 'GET', headers: authHeaders(req.key) },
			POLL_TIMEOUT_MS,
			TRANSCRIPT_MAX_BYTES,
		);
		return answer.kind === 'failed'
			? pollTransportStatus(answer.httpStatus, String(req.pid))
			: pollStateStatus(
					answer.body as { state?: string; segments?: TranscriptionSegment[]; error?: string },
				);
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
		const answer = await sidecarJson(
			endpoint(uri, 'models'),
			{ headers: authHeaders(key) },
			MODELS_TIMEOUT_MS,
			SMALL_MAX_BYTES,
		);
		if (answer.kind === 'failed') return [];
		const body = answer.body as { models?: { name?: string }[] };
		return Array.isArray(body.models)
			? (body.models.filter((model) => typeof model.name === 'string') as { name: string }[])
			: [];
	} catch {
		return [];
	}
}
