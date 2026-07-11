/**
 * Remote ASR seam (PHP tool_transcription::automatic_transcription /
 * ::check_server_transcriber_status + transcribers/babel/class.babel_transcriber.php).
 * The REMOTE alternative to the browser-Whisper flow: submit the record's audio
 * URL to an external transcriber server, which returns a job PID and processes
 * asynchronously. Completion is handled two ways, matching PHP:
 *  - the CLIENT polls check_server_transcriber_status (delete_result=false,
 *    non-destructive);
 *  - the SERVER runs a detached background poll (PHP
 *    exec_background_check_transcription → check_background_transcriber_status)
 *    that, on Babel status 3, converts the segments to TC-tagged text and saves
 *    them into the transcription component (process_file).
 *
 * The transcriber is a PROVIDER seam: the real babel providers POST to the
 * configured server (external, ledgered); tests inject stubs. Background
 * identity/lang are CAPTURED AT ENQUEUE TIME and threaded explicitly through
 * the job payload — nothing here reads the ALS stores (isolation Rule 6).
 */

import { secondsToTc } from '../resolve/tr_marks.ts';

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

/**
 * Minimal SSRF guard for the outbound transcriber URL (PHP is_safe_remote_url,
 * SEC-076). Local twin of translation.ts::isSafeTranslatorUrl (that helper is
 * file-private; duplicated here rather than widening another module's surface).
 * PHP allows custom ports (babel often runs on non-standard ports) — so do we;
 * we block non-http(s), loopback, link-local metadata and private ranges.
 */
function isSafeTranscriberUrl(uri: string): boolean {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return false;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	if (
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '::1' ||
		host === '[::1]' ||
		host === '169.254.169.254'
	) {
		return false;
	}
	if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
	return true;
}

// ---------------------------------------------------------------------------
// Submit (PHP babel_transcriber::transcribe)
// ---------------------------------------------------------------------------

export interface TranscribeRequest {
	uri: string;
	key: string;
	/** Engine name as POSTed to babel — already mapped through mapTranscriberEngine. */
	engine: string;
	quality: string;
	/** Full fetchable URL of the 'audio' quality file (PHP av_url). */
	audioUrl: string;
	/** ISO 639-1 code (PHP lang_tld2 — babel wants alpha-2, not lg-*). */
	langTld2: string;
	userId: number;
	entityName: string;
}

export interface TranscribeResult {
	/** A job handle (async processing) or false on failure. */
	result: { pid: string | number } | false;
	msg: string;
}

export type TranscriberProvider = (req: TranscribeRequest) => Promise<TranscribeResult>;

/**
 * Real babel transcriber — submits the audio URL, returns the server job PID.
 * Field names + method_name mirror PHP babel_transcriber::transcribe exactly;
 * babel answers { result: { pid } } (PHP reads $transcriber_response->result->pid).
 */
export const babelTranscriberProvider: TranscriberProvider = async (req) => {
	if (!isSafeTranscriberUrl(req.uri)) return { result: false, msg: 'invalid transcriber URL' };
	try {
		const res = await fetch(req.uri, {
			method: 'POST',
			body: new URLSearchParams({
				key: req.key,
				engine: req.engine,
				quality: req.quality,
				user_id: String(req.userId),
				entity_name: req.entityName,
				lang_tld2: req.langTld2,
				av_url: req.audioUrl,
				method_name: 'transcribe',
			}),
		});
		if (!res.ok) return { result: false, msg: `transcriber HTTP ${res.status}` };
		const body = (await res.json()) as { result?: { pid?: string | number } | false };
		const pid = body.result !== false && body.result !== undefined ? body.result.pid : undefined;
		if (pid === undefined || pid === null) {
			return { result: false, msg: 'transcriber returned no pid' };
		}
		return { result: { pid }, msg: 'ok' };
	} catch (error) {
		return { result: false, msg: (error as Error).message };
	}
};

/** PHP switch fall-through: engine 'local' is served by babel_transcriber. */
export function mapTranscriberEngine(engine: string): string {
	return engine === 'local' ? 'babel_transcriber' : engine;
}

/** Resolve a transcriber provider by engine name (PHP transcriber switch). */
export function resolveTranscriberProvider(engine: string): {
	provider: TranscriberProvider | null;
	error: string | null;
} {
	switch (engine) {
		case 'local': // PHP fall-through: local → babel_transcriber
		case 'babel_transcriber':
		case '':
		case undefined as unknown as string:
			return { provider: babelTranscriberProvider, error: null };
		default:
			return { provider: null, error: `Sorry. '${engine}' is not implemented yet` };
	}
}

/** Resolve the {uri, key} for a transcriber engine from tool config (dd996). */
export function resolveTranscriberConfig(
	toolConfig: Record<string, unknown>,
	engine: string,
): { uri: string; key: string } | null {
	const configs = (toolConfig?.config as { transcriber_config?: { value?: unknown[] } } | undefined)
		?.transcriber_config?.value;
	if (!Array.isArray(configs)) return null;
	const entry = configs.find(
		(item) =>
			item !== null && typeof item === 'object' && (item as { name?: string }).name === engine,
	) as { uri?: string; key?: string } | undefined;
	if (!entry || !entry.uri || !entry.key) return null;
	return { uri: entry.uri, key: entry.key };
}

// ---------------------------------------------------------------------------
// Status poll (PHP babel_transcriber::check_transcriber_status)
// ---------------------------------------------------------------------------

export interface TranscriberStatusRequest {
	/** The transcriber server endpoint (also POSTed as the 'url' field — PHP does the same). */
	uri: string;
	key: string;
	/** Must match the av_url submitted at transcribe time (babel keys the job by it). */
	avUrl: string;
	/** Engine name as POSTed — already mapped through mapTranscriberEngine. */
	engine: string;
	userId: number;
	entityName: string;
	pid: string | number;
	/** false = client poll (non-destructive); true = server poll (babel cleans up on status 3). */
	deleteResult: boolean;
	/** Dédalo lang (lg-*) — present on the background path only (PHP params descriptor). */
	lang?: string | null;
}

/**
 * A status provider returns the DECODED INNER `result` of babel's response
 * (PHP check_transcriber_status returns $response->result): typically
 * { status: 1|2|3, transcription_data? }. Failures return { result: false, msg }
 * (the PHP SSRF-guard shape).
 */
export type TranscriberStatusProvider = (req: TranscriberStatusRequest) => Promise<unknown>;

/** The exact POST body of a babel check_status call (pure — unit-testable). */
export function buildTranscriberStatusBody(req: TranscriberStatusRequest): URLSearchParams {
	const body = new URLSearchParams({
		key: req.key,
		url: req.uri,
		av_url: req.avUrl,
		engine: req.engine,
		method_name: 'check_status',
		user_id: String(req.userId),
		entity_name: req.entityName,
		pid: String(req.pid),
		delete_result: req.deleteResult ? 'true' : 'false',
	});
	if (req.lang != null && req.lang !== '') body.set('lang', req.lang);
	return body;
}

/** Real babel status poll — POSTs check_status, returns the decoded inner result. */
export const babelTranscriberStatusProvider: TranscriberStatusProvider = async (req) => {
	if (!isSafeTranscriberUrl(req.uri)) return { result: false, msg: 'invalid transcriber URL' };
	try {
		const res = await fetch(req.uri, { method: 'POST', body: buildTranscriberStatusBody(req) });
		if (!res.ok) return { result: false, msg: `transcriber HTTP ${res.status}` };
		const body = (await res.json()) as { result?: unknown };
		return body.result ?? null;
	} catch (error) {
		return { result: false, msg: (error as Error).message };
	}
};

/**
 * Resolve a STATUS provider by engine name. Mirrors the PHP
 * check_server_transcriber_status switch: google_translation is not
 * implemented; 'local' falls through to babel; unknown engines default to
 * babel (PHP `case 'babel_transcriber': default:`).
 */
export function resolveTranscriberStatusProvider(engine: string): {
	provider: TranscriberStatusProvider | null;
	error: string | null;
} {
	switch (engine) {
		case 'google_translation':
			return { provider: null, error: `Sorry. '${engine}' is not implemented yet` };
		default:
			return { provider: babelTranscriberStatusProvider, error: null };
	}
}

// ---------------------------------------------------------------------------
// Write-back (PHP babel_transcriber::process_file)
// ---------------------------------------------------------------------------

/** One babel transcription segment ({ start: seconds(float), text }). */
export interface TranscriptionSegment {
	start: number;
	text: string;
}

/**
 * PHP process_file segment formatting: each segment becomes
 * `[TC_HH:MM:SS.mmm_TC]<text>` (OptimizeTC::seg2tc — ported as
 * resolve/tr_marks.ts::secondsToTc), joined by '<p>'.
 */
export function segmentsToTcText(segments: readonly TranscriptionSegment[]): string {
	return segments
		.map((segment) => `[TC_${secondsToTc(segment.start)}_TC]${segment.text}`)
		.join('<p>');
}

/** The target transcription component locator (PHP transcription_ddo). */
export interface TranscriptionDdo {
	component_tipo: string;
	section_tipo: string;
	section_id: number;
}

/**
 * PHP process_file guard: the target component's existing data in the target
 * lang is NEVER overwritten — the user must delete it before re-transcribing.
 * (PHP checks !empty($current_data[0]); any object item is non-empty in PHP,
 * so ANY item in the lang slice blocks the save.)
 */
export function hasExistingTranscription(items: readonly unknown[], lang: string): boolean {
	return items.some(
		(item) =>
			item !== null && typeof item === 'object' && (item as { lang?: string }).lang === lang,
	);
}

/**
 * PHP babel_transcriber::process_file — convert babel segments to TC-tagged
 * text and persist it into the transcription component through the tx+TM save
 * chokepoint (saveComponentData). Identity arrives EXPLICITLY (userId) — never
 * from ALS (this runs in a detached background job).
 *
 * NOTE (PHP divergence, deliberate): PHP passes a raw STRING to the
 * array-typed component_common::set_data_lang (a latent TypeError). We write
 * the intended shape — one { value, lang } item in the target lang slice.
 */
export async function saveTranscriptionResult(input: {
	lang: string;
	transcriptionDdo: TranscriptionDdo;
	segments: readonly TranscriptionSegment[];
	userId: number;
}): Promise<{ saved: boolean; msg: string }> {
	const { lang, transcriptionDdo, segments, userId } = input;
	if (!Array.isArray(segments) || segments.length === 0) {
		return { saved: false, msg: 'transcription has no segments — nothing to save' };
	}
	const data = segmentsToTcText(segments);

	const { getModelByTipo, getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const { readComponentItems } = await import('../resolve/component_data.ts');

	const model = await getModelByTipo(transcriptionDdo.component_tipo);
	if (model === null) {
		return { saved: false, msg: `unknown component tipo '${transcriptionDdo.component_tipo}'` };
	}
	const table = await getMatrixTableFromTipo(transcriptionDdo.section_tipo);
	if (table === null) {
		return { saved: false, msg: `no matrix table for section '${transcriptionDdo.section_tipo}'` };
	}
	const record = await readMatrixRecord(
		table,
		transcriptionDdo.section_tipo,
		transcriptionDdo.section_id,
	);
	const items =
		record !== null
			? (readComponentItems(record, transcriptionDdo.component_tipo, model) ?? [])
			: [];
	if (hasExistingTranscription(items, lang)) {
		return {
			saved: false,
			msg: 'component already has data — skipped (delete the existing data to re-transcribe)',
		};
	}

	const { saveComponentData } = await import('../section/record/save_component.ts');
	const result = await saveComponentData({
		componentTipo: transcriptionDdo.component_tipo,
		sectionTipo: transcriptionDdo.section_tipo,
		sectionId: transcriptionDdo.section_id,
		lang,
		changedData: [{ action: 'update', id: null, value: { value: data, lang } }],
		userId,
	});
	return {
		saved: result.ok,
		msg: result.ok ? 'OK. Transcription saved' : result.message,
	};
}

// ---------------------------------------------------------------------------
// Background completion poll (PHP check_background_transcriber_status)
// ---------------------------------------------------------------------------

/** Everything a detached poll needs — captured at ENQUEUE time (no ALS reads). */
export interface TranscriptionPollJob {
	/** The status request minus deleteResult (the poll sets true — PHP background rule). */
	status: Omit<TranscriberStatusRequest, 'deleteResult'>;
	/** Dédalo lang the transcript is written into (the audio's source lang). */
	lang: string;
	transcriptionDdo: TranscriptionDdo;
	userId: number;
}

export interface TranscriptionPollOptions {
	provider?: TranscriberStatusProvider;
	/** Injectable save fn (tests stub it — the real one writes through the tx+TM chokepoint). */
	save?: typeof saveTranscriptionResult;
	/** PHP recurses forever every 4 s; we BOUND the loop (default ~30 min). */
	maxAttempts?: number;
	intervalMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

/**
 * Poll babel until the job completes, then persist the transcript
 * (PHP check_background_transcriber_status). Status semantics:
 *   1 → no pid / no result file on the server: terminal, nothing to do;
 *   2 → still processing: sleep (PHP sleep(4)) and poll again;
 *   3 → done: process_file-equivalent save (guarded against overwrite).
 * Bounded: after maxAttempts the poll gives up LOUDLY (console.error + a
 * failed job record) — it never throws into the server.
 */
export async function pollTranscriptionCompletion(
	job: TranscriptionPollJob,
	opts: TranscriptionPollOptions = {},
): Promise<{ result: boolean; msg: string }> {
	const provider = opts.provider ?? babelTranscriberStatusProvider;
	const save = opts.save ?? saveTranscriptionResult;
	const maxAttempts = opts.maxAttempts ?? 450;
	const intervalMs = opts.intervalMs ?? 4000;
	const sleep =
		opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		// delete_result=true: only the server-side poll may let babel clean up
		// the finished result (PHP check_background_transcriber_status).
		const status = await provider({ ...job.status, deleteResult: true });
		const statusCode =
			status !== null && typeof status === 'object'
				? Number((status as { status?: unknown }).status)
				: Number.NaN;

		if (statusCode === 2) {
			await sleep(intervalMs);
			continue;
		}
		if (statusCode === 1) {
			return { result: false, msg: 'Babel: no pid, no file to get data (status 1)' };
		}
		if (statusCode === 3) {
			const data = (status as { transcription_data?: { segments?: TranscriptionSegment[] } })
				.transcription_data;
			const segments = Array.isArray(data?.segments) ? data.segments : [];
			const outcome = await save({
				lang: job.lang,
				transcriptionDdo: job.transcriptionDdo,
				segments,
				userId: job.userId,
			});
			return { result: outcome.saved, msg: outcome.msg };
		}
		const detail =
			status !== null && typeof status === 'object'
				? JSON.stringify(status).slice(0, 256)
				: String(status);
		return { result: false, msg: `Error. status not valid: ${detail}` };
	}

	console.error(
		`[tool_transcription] gave up polling babel pid ${job.status.pid} after ${maxAttempts} attempts (the job may still be running on the transcriber server; the client can keep polling via check_server_transcriber_status)`,
	);
	return {
		result: false,
		msg: `gave up after ${maxAttempts} poll attempts (pid ${job.status.pid})`,
	};
}
