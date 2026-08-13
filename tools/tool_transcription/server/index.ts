/**
 * tool_transcription server module (PHP tool_transcription) — full surface.
 *
 * LOCAL half (browser-Whisper flow):
 *   create_transcribable_audio_file: build (idempotently) the audio_tr WAV from
 *     the AV original and return its fetchable media URL — the browser Whisper
 *     worker fetches that URL and transcribes client-side.
 *   delete_transcribable_audio_file: hard-delete that throwaway WAV (idempotent).
 *
 * REMOTE half (external ASR seam):
 *   automatic_transcription: ensure the 'audio' quality, submit its URL to the
 *     configured transcriber server (job PID returned), then detach a bounded
 *     background poll (PHP exec_background_check_transcription) that writes the
 *     transcript back on completion.
 *   check_server_transcriber_status: the CLIENT's non-destructive poll of a
 *     running job (delete_result=false).
 *
 * VTT builder:
 *   build_subtitles_file: build a WEBVTT file from the transcription text and
 *     write it under the AV subtitles folder (dir must already exist — PHP).
 *
 * PERMISSION: PHP gates imperatively inside each method against the NESTED
 * `media_ddo`/top-level locator (write level 2 — or READ level 1 for the status
 * poll — plus record-in-scope), not a top-level target. So apiActions uses
 * `permission: null` and each handler runs the exact same gate via
 * assertActionPermission on the lifted locator.
 *
 * BACKGROUND: check_background_transcriber_status is in backgroundRunnable but
 * deliberately NOT in apiActions — it is unroutable from the client and only
 * enqueued by automatic_transcription itself, with principal/lang/identity
 * captured at enqueue time (ALS Rule 6: the detached poll never reads request
 * state).
 */

import { existsSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../../src/config/config.ts';
import {
	COMMON_FILES,
	DIARIZATION_COMMON_FILES,
	type DownloadReport,
	downloadModel,
	headContentLength,
	OPTIONAL_FILES,
	resolveFetchTarget,
} from '../../../src/core/ai/model_fetch.ts';
import { forgetFile, recordFileComplete } from '../../../src/core/ai/model_manifest.ts';
import {
	AI_MODEL_URL_PREFIX,
	fileEvidence,
	type ModelFileEvidence,
	type ModelState,
	type ModelStateReport,
	modelHubAllowed,
	modelState,
	modelStoreAvailable,
	modelStoreRoot,
} from '../../../src/core/ai/model_store.ts';
import type { MediaTypeSpec } from '../../../src/core/concepts/media.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import { probeFormat } from '../../../src/core/media/engine/ffmpeg.ts';
import {
	absoluteFromRelative,
	buildMediaLocation,
	type MediaIdentity,
	type MediaPathOptions,
	subtitlesPath,
	subtitlesUrl,
} from '../../../src/core/media/path.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import { buildSubtitlesText } from '../../../src/core/media/tools/subtitles.ts';
import {
	deleteTranscribableAudio,
	ensureAudioQuality,
	ensureTranscribableAudio,
} from '../../../src/core/media/tools/transcription.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	relatedTipoByModel,
} from '../../../src/core/ontology/resolver.ts';
import { filterItemsByLang, readComponentItems } from '../../../src/core/resolve/component_data.ts';
import { getAlpha2FromCode } from '../../../src/core/resolve/lang_names.ts';
import { scheduleBackground } from '../../../src/core/tools/background.ts';
import { getToolConfig } from '../../../src/core/tools/config.ts';
import { getLoadedTool } from '../../../src/core/tools/loader.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { assertActionPermission } from '../../../src/core/tools/security.ts';
import {
	LOCAL_ASR_ENGINE,
	mapTranscriberEngine,
	pollTranscriptionCompletion,
	resolveTranscriberConfig,
	resolveTranscriberProvider,
	resolveTranscriberStatusProvider,
	statusPollNeedsExternalAudioUrl,
} from '../../../src/core/tools/transcription_asr.ts';

export interface MediaDdo {
	component_tipo?: unknown;
	section_id?: unknown;
	section_tipo?: unknown;
}

/** The background poll action name (PHP babel_transcriber BACKGROUND_RUNNABLE). */
const BACKGROUND_POLL_ACTION = 'check_background_transcriber_status';

function fail(message: string): ToolResponse {
	return { result: false, msg: message, errors: [message] };
}

/** PHP empty() for required-parameter checks. */
function phpEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === '' ||
		value === 0 ||
		value === '0' ||
		value === false
	);
}

/** Read the nested media_ddo locator and normalize it to the media-tool option shape. */
function readMediaDdo(options: Record<string, unknown>): MediaDdo {
	const raw = (options.media_ddo ?? {}) as MediaDdo;
	return {
		component_tipo: raw.component_tipo,
		section_id: raw.section_id,
		section_tipo: raw.section_tipo,
	};
}

/** PHP in-method gate: level `minLevel` on the ddo section + record-in-scope. */
async function gateRecord(
	ddo: MediaDdo,
	ctx: ToolActionContext,
	minLevel: number,
): Promise<ToolResponse | null> {
	const check = await assertActionPermission(
		{ permission: 'record', minLevel, handler: async () => fail('unreachable') },
		{ section_tipo: ddo.section_tipo, section_id: ddo.section_id },
		ctx.principal,
	);
	return check.ok ? null : fail(check.msg);
}

/** PHP in-method gate: WRITE level 2 on the media_ddo section + record-in-scope. */
async function gateRecordWrite(
	ddo: MediaDdo,
	ctx: ToolActionContext,
): Promise<ToolResponse | null> {
	return gateRecord(ddo, ctx, 2);
}

/**
 * The URL the BROWSER fetches this media path at (client audience): the
 * configured web base, which already carries `/dedalo/<mediaDir>` and defaults
 * to the same-origin relative form.
 */
function clientMediaUrl(relativePath: string): string {
	return `${config.media.webBase}${relativePath}`;
}

/**
 * The URL an EXTERNAL transcriber fetches this media path at. The provider is a
 * different host: a relative URL is meaningless to it, so this REQUIRES
 * DEDALO_MEDIA_EXPORT_BASE and throws when it is unset instead of handing the
 * service an address it cannot resolve (the same unset-means-unresolved law the
 * export cells follow).
 *
 * These two audiences used to share one helper built on the old
 * DEDALO_MEDIA_BASE_URL, which it appended `/dedalo/<mediaDir>` to — so the one
 * value that worked here (a bare origin) was the one that broke the export
 * cells, which append the same relative path to the base UNCHANGED. Splitting
 * the helper is what makes both correct with a single configured value.
 */
function externalMediaUrl(relativePath: string): string {
	const base = config.media.exportBase;
	if (base === undefined || base === '') {
		throw new Error(
			'DEDALO_MEDIA_EXPORT_BASE is not set: an external transcriber cannot fetch a relative media URL. Set it to the public media base (e.g. https://host/dedalo/media) in ../private/.env.',
		);
	}
	return `${base}${relativePath}`;
}

/**
 * The `av_url` a status poll must send for this engine — the CLIENT poll's half
 * of the rule `statusPollNeedsExternalAudioUrl` states (audit 2026-08 §5.6/3).
 *
 * `null` is the caller SAYING there is no published URL, which is the only
 * correct answer for the on-premise sidecar: it was POSTed the audio BYTES and
 * keys its job by its own id, and `engineering/TRANSCRIPTION.md` forbids making
 * on-premise inference depend on publishing the recording. Asking for one there
 * is not merely useless — on an install that publishes nothing (the normal
 * on-premise state) `externalMediaUrl` throws, which is exactly how the client
 * poll died with a live pid and a permanently disabled transcribe button.
 *
 * Exported so the seam itself is gated
 * (test/unit/transcription_client_poll_av_url_native.test.ts). That is only HALF
 * a gate, though, and the weaker half: pinning a helper proves the helper is
 * right, never that the handler still calls it — which is exactly how the
 * unconditional call site survived the first fix. `StatusPollSeams` exists so
 * the other half (the HANDLER's observed av_url) is gated too.
 */
export function statusPollAvUrl(engine: string, audioRelativePath: string): string | null {
	return statusPollNeedsExternalAudioUrl(engine) ? externalMediaUrl(audioRelativePath) : null;
}

/**
 * The WORLD-TOUCHING collaborators of `check_server_transcriber_status`, each
 * defaulting to the production one — the same dependency seam
 * `pollTranscriptionCompletion` already uses for its provider/save pair.
 *
 * It exists for ONE reason, and the reason is an invariant rather than a
 * convenience: `engineering/TRANSCRIPTION.md` forbids on-premise inference from
 * depending on publishing the recording, so the poll this handler performs must
 * never ask the media publication layer for a URL when the engine is the local
 * sidecar. That is a property OF THE HANDLER — of the argument it actually
 * passes — and the only honest way to assert it is to run the handler and read
 * the request the provider received. Everything the handler needs to get that
 * far (the permission gate, the tool config row, the media context) is a
 * database read; injecting exactly those three, and nothing else, keeps the
 * av_url decision and the path build on the REAL code path.
 *
 * Gate: test/unit/transcription_client_poll_av_url_native.test.ts (it also pins
 * that `tool.apiActions.check_server_transcriber_status.handler` IS this
 * function, so the gate cannot drift onto a copy the wire never reaches).
 */
export interface StatusPollSeams {
	/** PHP's in-method READ gate (level 1) on the media_ddo record. */
	readonly gate?: (ddo: MediaDdo, ctx: ToolActionContext) => Promise<ToolResponse | null>;
	/** The transcriber's uri/key entry for this engine, or null when unconfigured. */
	readonly transcriberConfig?: (engine: string) => Promise<{ uri: string; key: string } | null>;
	/** Media spec/identity/path options for the polled component_av record. */
	readonly mediaContext?: typeof resolveMediaToolContext;
	/** Engine → status provider routing. */
	readonly statusProvider?: typeof resolveTranscriberStatusProvider;
}

/** Config entry by the ORIGINAL engine name (PHP $transcriber_name). */
async function defaultTranscriberConfig(
	engine: string,
): Promise<{ uri: string; key: string } | null> {
	return resolveTranscriberConfig(await getToolConfig('tool_transcription'), engine);
}

async function createTranscribableAudioFile(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const ddo = readMediaDdo(ctx.options);
		const denied = await gateRecordWrite(ddo, ctx);
		if (denied !== null) return denied;

		const { spec, identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: ddo.component_tipo,
			section_tipo: ddo.section_tipo,
			section_id: ddo.section_id,
		});
		const relativePath = await ensureTranscribableAudio(spec, identity, pathOpts);
		return { result: clientMediaUrl(relativePath), msg: 'OK: file was created', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

async function deleteTranscribableAudioFile(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const ddo = readMediaDdo(ctx.options);
		const denied = await gateRecordWrite(ddo, ctx);
		if (denied !== null) return denied;

		const { spec, identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: ddo.component_tipo,
			section_tipo: ddo.section_tipo,
			section_id: ddo.section_id,
		});
		const deleted = deleteTranscribableAudio(spec, identity, pathOpts);
		return {
			result: true,
			msg: deleted ? 'Ok: file was deleted' : 'OK. File not exist in server, nothing to delete',
			errors: [],
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * automatic_transcription — the REMOTE ASR submit (external seam). Ensure the
 * audio quality, submit its URL to the configured transcriber server (which
 * returns a job PID), then detach the bounded background completion poll that
 * writes the transcript back (PHP exec_background_check_transcription →
 * check_background_transcriber_status → process_file).
 */
async function automaticTranscription(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const transcriptionDdo = (o.transcription_ddo ?? {}) as MediaDdo;
		const mediaDdo = (o.media_ddo ?? {}) as MediaDdo;
		const sourceLang = String(o.source_lang ?? '');
		const engine = String(o.transcriber_engine ?? 'babel_transcriber');
		const quality = String(o.transcriber_quality ?? '');
		if (
			sourceLang === '' ||
			quality === '' ||
			!mediaDdo.component_tipo ||
			!transcriptionDdo.section_tipo
		) {
			return fail(
				'Missing required parameters: source_lang, transcriber_quality, media_ddo, transcription_ddo',
			);
		}

		// WRITE gate on the transcription target (PHP assert_section_permission 2 + scope).
		const denied = await gateRecordWrite(transcriptionDdo, ctx);
		if (denied !== null) return denied;

		// TOOLS-06 (2026-07-28 audit): ALSO gate READ on the media SOURCE.
		// Transcription reads the audio CONTENT of media_ddo — without this a
		// caller who can write their OWN transcription target could transcribe the
		// restricted audio of ANY AV record (one they cannot read) into a record
		// they control. Read level 1 + record-in-scope on the source media record.
		const mediaDenied = await gateRecord(mediaDdo, ctx, 1);
		if (mediaDenied !== null) return mediaDenied;

		const { provider, error: providerError } = resolveTranscriberProvider(engine);
		if (provider === null) return fail(providerError ?? 'unknown transcriber engine');
		// Config entry is looked up by the ORIGINAL engine name; the POSTed
		// engine field uses the mapped one ('local' → babel) — PHP does both.
		const cfg = resolveTranscriberConfig(await getToolConfig('tool_transcription'), engine);
		if (cfg === null) return fail(`Transcriber config (uri/key) is not defined for '${engine}'`);
		const mappedEngine = mapTranscriberEngine(engine);

		const { spec, identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: mediaDdo.component_tipo,
			section_tipo: mediaDdo.section_tipo,
			section_id: mediaDdo.section_id,
		});

		// Two ways to hand a recogniser the audio, and the choice is not cosmetic:
		//  - an EXTERNAL service fetches a public URL (and so needs one to exist);
		//  - the institution's OWN box is POSTed the bytes of the speech-optimised
		//    WAV, so the recording is never published anywhere. That WAV is a
		//    throwaway derivative, deleted by the completion poll.
		const isLocalEngine = engine === LOCAL_ASR_ENGINE;
		const audioRel = isLocalEngine
			? await ensureTranscribableAudio(spec, identity, pathOpts)
			: await ensureAudioQuality(spec, identity, pathOpts);
		const audioPath = isLocalEngine
			? absoluteFromRelative(audioRel, pathOpts.mediaRoot)
			: undefined;
		// An on-premise engine never receives a URL; asking for one would throw
		// when DEDALO_MEDIA_EXPORT_BASE is unset, which is the normal state of an
		// install that publishes nothing.
		const audioUrl = isLocalEngine ? '' : externalMediaUrl(audioRel);

		const result = await provider({
			uri: cfg.uri,
			key: cfg.key,
			engine: mappedEngine,
			quality,
			audioUrl,
			audioPath,
			langTld2: getAlpha2FromCode(sourceLang) ?? '',
			userId: ctx.userId,
			entityName: config.entity,
		});
		if (result.result === false) return fail(result.msg);

		// Detach the completion poll (PHP exec_background_check_transcription).
		// EVERYTHING the poll needs — principal, user, lang, target ddo, the
		// exact submitted av_url — is captured HERE at enqueue time; the
		// detached handler never reads ALS (isolation Rule 6).
		const loaded = await getLoadedTool('tool_transcription');
		if (loaded !== undefined) {
			scheduleBackground(
				loaded,
				BACKGROUND_POLL_ACTION,
				{ permission: null, handler: backgroundTranscriberPoll },
				{
					key: cfg.key,
					url: cfg.uri,
					lang: sourceLang,
					av_url: audioUrl,
					// The throwaway WAV the on-premise engine was fed. The poll
					// deletes it when the job ends, whichever way it ends — this
					// file is a copy of an interview and must not linger.
					cleanup_path: audioPath,
					engine: mappedEngine,
					user_id: ctx.userId,
					entity_name: config.entity,
					transcription_ddo: {
						component_tipo: String(transcriptionDdo.component_tipo ?? ''),
						section_tipo: String(transcriptionDdo.section_tipo ?? ''),
						section_id: Number(transcriptionDdo.section_id ?? 0),
					},
					pid: result.result.pid,
				},
				ctx.principal,
				ctx.userId,
			);
		} else {
			console.error(
				'[tool_transcription] could not schedule the background completion poll (module not loaded); the client can still poll check_server_transcriber_status',
			);
		}

		// WC-007: truthful success msg (PHP leaves its initial error msg on success).
		return { result: result.result, msg: 'OK. Transcription job submitted', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * The detached completion poll (PHP babel_transcriber::
 * check_background_transcriber_status). Runs under the background executor;
 * reads its whole world from the options captured at enqueue time.
 */
async function backgroundTranscriberPoll(ctx: ToolActionContext): Promise<ToolResponse> {
	const o = ctx.options;
	const ddo = (o.transcription_ddo ?? {}) as MediaDdo;
	const lang = String(o.lang ?? '');
	const cleanupPath = String(o.cleanup_path ?? '');
	const outcome = await pollTranscriptionCompletion({
		status: {
			uri: String(o.url ?? ''),
			key: String(o.key ?? ''),
			avUrl: String(o.av_url ?? ''),
			engine: String(o.engine ?? ''),
			userId: Number(o.user_id ?? ctx.userId),
			entityName: String(o.entity_name ?? ''),
			pid: (o.pid ?? '') as string | number,
			lang,
		},
		lang,
		transcriptionDdo: {
			component_tipo: String(ddo.component_tipo ?? ''),
			section_tipo: String(ddo.section_tipo ?? ''),
			section_id: Number(ddo.section_id ?? 0),
		},
		userId: ctx.userId,
	});

	// The job is over (saved, failed or given up on): drop the temporary audio.
	// Unconditional on purpose — the one previous cleanup path ran on success
	// only, which left a copy of the recording on disk after every failure.
	if (cleanupPath !== '' && existsSync(cleanupPath)) {
		try {
			unlinkSync(cleanupPath);
		} catch (error) {
			console.error(
				`[tool_transcription] could not delete the temporary audio ${cleanupPath}:`,
				error,
			);
		}
	}

	return { result: outcome.result, msg: outcome.msg, errors: outcome.result ? [] : [outcome.msg] };
}

/**
 * check_server_transcriber_status — the CLIENT's poll of a running job (PHP
 * :669-788). READ gate (level 1) on media_ddo: polling reconstructs the audio
 * URL but writes nothing. delete_result=false — only the server-side
 * background poll may let babel clean up the finished result.
 *
 * `seams` defaults to the production collaborators; see StatusPollSeams for why
 * the gate that matters has to invoke THIS function.
 */
export async function checkServerTranscriberStatus(
	ctx: ToolActionContext,
	seams: StatusPollSeams = {},
): Promise<ToolResponse> {
	// PHP gates BEFORE validation, only when media_ddo->section_tipo is present.
	const ddo = readMediaDdo(ctx.options);
	if (!phpEmpty(ddo.section_tipo)) {
		const gate = seams.gate ?? ((target, context) => gateRecord(target, context, 1));
		const denied = await gate(ddo, ctx);
		if (denied !== null) return denied;
	}

	try {
		const rawDdo = ctx.options.media_ddo ?? null;
		const engine = String(ctx.options.transcriber_engine ?? '');
		const pid = ctx.options.pid;

		const missing: string[] = [];
		if (rawDdo === null) missing.push('media_ddo');
		if (phpEmpty(engine)) missing.push('transcriber_engine');
		if (phpEmpty(pid)) missing.push('pid');
		if (missing.length > 0) {
			return fail(`Missing required parameters: ${missing.join(', ')}`);
		}

		const cfg = await (seams.transcriberConfig ?? defaultTranscriberConfig)(engine);
		if (cfg === null) return fail(`Transcriber config (uri/key) is not defined for '${engine}'`);

		const { provider, error: providerError } = (
			seams.statusProvider ?? resolveTranscriberStatusProvider
		)(engine);
		if (provider === null) {
			return {
				result: false,
				msg: providerError ?? `Sorry. '${engine}' is not implemented yet`,
				errors: ['transcriber not implemented'],
			};
		}

		// Rebuild av_url EXACTLY as automatic_transcription submitted it (same
		// context resolution, same URL builder) — an EXTERNAL transcriber backend
		// identifies the job by this URL, so it must match byte-for-byte. The
		// on-premise engine was submitted no URL at all (audioUrl '') and must be
		// polled with none: see statusPollAvUrl.
		const { spec, identity, pathOpts } = await (seams.mediaContext ?? resolveMediaToolContext)({
			component_tipo: ddo.component_tipo,
			section_tipo: ddo.section_tipo,
			section_id: ddo.section_id,
		});
		if (spec.model !== 'component_av') {
			return fail(
				`check_server_transcriber_status: '${String(ddo.component_tipo)}' is not component_av`,
			);
		}
		// PURE path build (PHP: $component->get_url('audio')) — a READ-gated poll
		// must NEVER transcode. Only automatic_transcription ENSURES the audio
		// quality, and that action is WRITE-gated.
		const audioRel = buildMediaLocation(
			spec,
			identity,
			'audio',
			spec.defaultExtension,
			pathOpts,
		).relativePath;

		const result = await provider({
			uri: cfg.uri,
			key: cfg.key,
			avUrl: statusPollAvUrl(engine, audioRel),
			engine: mapTranscriberEngine(engine),
			userId: ctx.userId,
			entityName: config.entity,
			pid: pid as string | number,
			deleteResult: false,
		});

		// The transcriber is EXTERNAL: an unreachable server, an HTTP error or a
		// blocked (SSRF) URI comes back as the provider's `{result:false, msg}`
		// envelope, NOT as a thrown error. Report it as a FAILURE — WC-007 rewrites
		// the msg on the SUCCESS branch only; a down ASR server must never read OK.
		if (result === null || result === undefined) {
			return fail('Transcriber server returned no status');
		}
		if (typeof result === 'object' && (result as { result?: unknown }).result === false) {
			const detail = String((result as { msg?: unknown }).msg ?? 'transcriber request failed');
			return fail(detail);
		}

		// WC-007: truthful success msg (PHP leaves its initial error msg on success).
		return { result, msg: 'OK. Request done [check_server_transcriber_status]', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * PHP component_av::get_duration — the AV file's duration in seconds via
 * ffprobe on the default-quality file. The stored files_info entry locates the
 * file first (DB order); the computed grammar location is the fallback. 0 when
 * no file / probe failure (PHP returns 0.0).
 */
async function resolveAvDuration(
	spec: MediaTypeSpec,
	identity: MediaIdentity,
	pathOpts: MediaPathOptions,
	items: Record<string, unknown>[],
): Promise<number> {
	let absolute: string | null = null;

	// 1) stored files_info entry for the default quality
	const filesInfo = (items[0]?.files_info ?? null) as
		| { quality?: unknown; file_exist?: unknown; file_path?: unknown; external?: unknown }[]
		| null;
	if (Array.isArray(filesInfo)) {
		const stored = filesInfo.find(
			(entry) =>
				entry !== null &&
				typeof entry === 'object' &&
				entry.quality === spec.defaultQuality &&
				entry.file_exist === true &&
				entry.external !== true &&
				typeof entry.file_path === 'string',
		);
		if (stored !== undefined) {
			try {
				const candidate = absoluteFromRelative(stored.file_path as string, pathOpts.mediaRoot);
				if (existsSync(candidate)) absolute = candidate;
			} catch {
				absolute = null;
			}
		}
	}

	// 2) fallback: the deterministic grammar location
	if (absolute === null) {
		const location = buildMediaLocation(
			spec,
			identity,
			spec.defaultQuality,
			spec.defaultExtension,
			pathOpts,
		);
		if (existsSync(location.absolutePath)) absolute = location.absolutePath;
	}

	if (absolute === null) return 0;
	const format = (await probeFormat(absolute)) as { format?: { duration?: unknown } } | null;
	const duration = Number(format?.format?.duration ?? 0);
	return Number.isFinite(duration) ? duration : 0;
}

/**
 * build_subtitles_file — generate the WEBVTT file from the transcription text
 * (PHP :827-990). WRITE gate (level 2) on (section_tipo, component_tipo) plus
 * record-in-scope. The target subtitles dir must ALREADY exist (PHP does not
 * create it); on success the VTT is written and its public URL returned.
 */
async function buildSubtitlesFile(ctx: ToolActionContext): Promise<ToolResponse> {
	const o = ctx.options;
	const sectionTipo = String(o.section_tipo ?? '');
	const componentTipo = String(o.component_tipo ?? '');
	const sectionId = Number(o.section_id ?? 0);

	// PHP SEC-024 gate (before validation, when both tipos are present):
	// assert_tipo_permission(section, component, 2) + record-in-scope.
	if (!phpEmpty(o.section_tipo) && !phpEmpty(o.component_tipo)) {
		const tipoGate = await assertActionPermission(
			{ permission: 'tipo', minLevel: 2, handler: async () => fail('unreachable') },
			{ section_tipo: sectionTipo, tipo: componentTipo },
			ctx.principal,
		);
		if (!tipoGate.ok) return fail(tipoGate.msg);
		if (!phpEmpty(o.section_id)) {
			const scopeGate = await assertActionPermission(
				{ permission: 'record', minLevel: 2, handler: async () => fail('unreachable') },
				{ section_tipo: sectionTipo, section_id: sectionId },
				ctx.principal,
			);
			if (!scopeGate.ok) return fail(scopeGate.msg);
		}
	}

	try {
		const lang = String(o.lang ?? '');
		const key = Number(o.key ?? 0); // fixed component dato key, default 0
		const maxCharline = Number(o.max_charline ?? 0);

		const missing: string[] = [];
		if (phpEmpty(o.component_tipo)) missing.push('component_tipo');
		if (phpEmpty(o.section_tipo)) missing.push('section_tipo');
		if (phpEmpty(o.section_id)) missing.push('section_id');
		if (phpEmpty(o.lang)) missing.push('lang');
		if (phpEmpty(o.max_charline)) missing.push('max_charline');
		if (missing.length > 0) {
			return fail(`Missing required parameters: ${missing.join(', ')}`);
		}

		// Read the transcription text (PHP get_data_lang(lang)[key]->value).
		const model = await getModelByTipo(componentTipo);
		if (model === null) return fail(`Failed to instantiate text component: ${componentTipo}`);
		const table = await getMatrixTableFromTipo(sectionTipo);
		const record = table !== null ? await readMatrixRecord(table, sectionTipo, sectionId) : null;
		const items = record !== null ? (readComponentItems(record, componentTipo, model) ?? []) : [];
		const langItems = filterItemsByLang(items, lang);
		const rawValue = (langItems[key] as { value?: unknown } | undefined)?.value;
		const sourceText = String(rawValue ?? '').trim();
		if (sourceText === '') {
			return { result: false, msg: 'Warning. Empty component value!', errors: ['empty value'] };
		}

		// Resolve the related AV component (the ontology 'related' pairing —
		// PHP get_related_component_av_tipo).
		const avTipo = await relatedTipoByModel(componentTipo, 'component_av');
		if (avTipo === null) {
			return fail(
				`Failed to instantiate AV component: no component_av related to ${componentTipo}`,
			);
		}

		// AV duration → total_ms (PHP get_duration * 1000, rounded).
		const {
			spec: avSpec,
			identity: avIdentity,
			pathOpts: avPathOpts,
			items: avItems,
		} = await resolveMediaToolContext({
			component_tipo: avTipo,
			section_tipo: sectionTipo,
			section_id: sectionId,
		});
		const duration = await resolveAvDuration(avSpec, avIdentity, avPathOpts, avItems);
		const totalMs = Math.round(duration * 1000);

		const subtitles = buildSubtitlesText({
			sourceText,
			maxCharLine: maxCharline,
			total_ms: totalMs,
		});
		if (subtitles.result === false) {
			return {
				result: false,
				msg: `Error: ${subtitles.msg}`,
				errors: ['unable to build subtitles'],
			};
		}

		// Target path/url — the ONE shared subtitles grammar (media/path.ts).
		const vttPath = subtitlesPath(avIdentity, lang, avPathOpts.mediaRoot);
		const targetFolder = dirname(vttPath);
		if (!existsSync(targetFolder)) {
			// PHP semantics: the dir must already exist — do NOT create it.
			return {
				result: false,
				msg: 'Error: subtitles dir does not exist!',
				errors: [`subtitles dir not found: ${targetFolder}`],
			};
		}
		writeFileSync(vttPath, subtitles.result);

		return {
			result: true,
			url: subtitlesUrl(avIdentity, lang),
			msg: 'OK. Request done successfully',
			errors: [],
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

/**
 * get_model_sources — where the BROWSER engine may load its model from.
 *
 * The browser cannot read the install's configuration, so without this the
 * operator switches (`DEDALO_AI_MODEL_STORE`, `DEDALO_AI_MODEL_ALLOW_HUB`) would
 * be inert and the worker would be guessing. It answers three facts:
 *   model_host  — the store URL to load weights from (this install's own);
 *   allow_hub   — whether falling back to a public model hub is permitted
 *                 (default NO: the recordings are personal data, and an
 *                 air-gapped archive must work);
 *   store_ready — whether the store actually has anything in it, so the tool can
 *                 say "ask your administrator to seed the model store" instead of
 *                 failing with a 404 from inside the ONNX runtime.
 *
 * No record is addressed and nothing is written; the answer is install
 * configuration the logged-in user's own browser is about to act on.
 */
async function getModelSources(_ctx: ToolActionContext): Promise<ToolResponse> {
	// Which catalog models are USABLE right now, and in what way. A boolean
	// "installed" could not distinguish a model nobody downloaded from one whose
	// download was killed mid-file — and it was the second that reached the
	// browser as "ERROR_CODE: 7 … protobuf parsing failed" with nothing in the UI.
	const installed: string[] = [];
	const models: { name: string; state: string; files: unknown[] }[] = [];
	try {
		// getToolConfig returns the EFFECTIVE config — a flat map of key → resolved
		// value — so `transcriber_quality` IS the catalog array.
		const toolConfig = await getToolConfig('tool_transcription');
		const raw = toolConfig?.transcriber_quality;
		const entries = Array.isArray(raw)
			? raw
			: ((raw as { value?: unknown[] } | undefined)?.value ?? null);
		if (Array.isArray(entries)) {
			for (const rawEntry of entries) {
				if (rawEntry === null || typeof rawEntry !== 'object') continue;
				const entry = rawEntry as {
					name?: unknown;
					tier?: unknown;
					dtype?: Record<string, string>;
				};
				if (typeof entry.name !== 'string') continue;
				if (entry.tier !== undefined && entry.tier !== 'browser') continue;
				const report = modelState(entry.name, entry.dtype);
				models.push({ name: entry.name, state: report.state, files: report.files });
				// `installed` KEEPS its old meaning — "the browser may try this" —
				// so an older client is never made worse by this change. An
				// unverified model is the normal state of every store seeded
				// before the manifest existed: it runs, with a warning.
				if (isRunnableState(report.state)) installed.push(entry.name);
			}
		}
	} catch (error) {
		// A missing/!unreadable catalog must not break the transcription flow: the
		// client falls back to offering everything, exactly as it did before.
		console.error('[tool_transcription] could not read the model catalog:', error);
	}

	// The speaker-detection models (separate catalog slots — never in the ASR
	// quality picker): segmentation (WHO speaks WHEN) + the voice-fingerprint
	// embedding model (the SAME voice keeps the SAME id across the whole
	// recording — without it, long recordings fragment one voice into several
	// detected speakers).
	//
	// BOTH HALVES REPORT THEIR OWN STATE. `installed` here used to be
	// `modelInstalled()` — the old `size > 0` test this whole change exists to
	// retire — so a truncated pyannote file enabled the checkbox and the worker
	// died with exactly the "ERROR_CODE: 7 … protobuf parsing failed" the ASR path
	// no longer produces. And a single boolean could not say WHICH half was
	// broken, so the remedy could not be aimed: the panel's Repair went to the
	// selected ASR model, repaired something that was never broken, and reported
	// success. `models` carries one entry per half, each with its own state and
	// its own name to aim a remedy at.
	let diarization: DiarizationPanel | null = null;
	try {
		diarization = await readDiarizationPanel();
	} catch (error) {
		console.error('[tool_transcription] could not read the diarization model config:', error);
	}

	return {
		result: {
			model_host: AI_MODEL_URL_PREFIX,
			allow_hub: modelHubAllowed(),
			store_ready: modelStoreAvailable(),
			installed,
			models,
			diarization,
		},
		msg: 'OK',
		errors: [],
	};
}

/**
 * The diarization model declared by the tool config (`diarization_model`),
 * or null when the install declares none. Tolerates the raw property-object
 * form ({value: {…}}) like every other config read in this module.
 */
async function readDiarizationModel(): Promise<{
	name: string;
	label?: string;
	size_mb?: number;
	dtype?: Record<string, string>;
} | null> {
	return readModelConfigSlot('diarization_model');
}

/**
 * A model state the browser may attempt. THE one rule, shared by the ASR
 * `installed` list, the diarization panel and the widget's usable count — the
 * five states must mean one thing everywhere or the picker and the refusal
 * disagree again.
 */
function isRunnableState(state: ModelState): boolean {
	return state === 'ready' || state === 'unverified';
}

/** One half of speaker detection, as the client reads it. */
export interface DiarizationPart {
	/** 'segmentation' (who speaks when) | 'embedding' (the voice fingerprint). */
	role: string;
	name: string;
	label?: string;
	state: ModelState;
}

export interface DiarizationPanel {
	name: string;
	label?: string;
	size_mb?: number;
	/** Every half runnable. Kept for older clients; `models` is the real answer. */
	installed: boolean;
	/** The WORST half's state — what the pair as a whole is in. */
	state: ModelState;
	models: DiarizationPart[];
	embedding_name?: string;
}

/** Worst first: what the pair is in is what its unhealthiest half is in. */
const STATE_SEVERITY: readonly ModelState[] = [
	'missing',
	'damaged',
	'incomplete',
	'unverified',
	'ready',
];

function worstState(states: readonly ModelState[]): ModelState {
	for (const candidate of STATE_SEVERITY) {
		if (states.includes(candidate)) return candidate;
	}
	return 'missing';
}

/**
 * The speaker-detection pair, each half answering for itself. Null when the
 * install declares no segmentation model (speaker detection is simply absent).
 */
async function readDiarizationPanel(): Promise<DiarizationPanel | null> {
	const entry = await readDiarizationModel();
	if (entry === null) return null;
	const embedding = await readDiarizationEmbeddingModel();

	const models: DiarizationPart[] = [
		{
			role: 'segmentation',
			name: entry.name,
			label: entry.label,
			state: modelState(entry.name, entry.dtype).state,
		},
	];
	if (embedding !== null) {
		models.push({
			role: 'embedding',
			name: embedding.name,
			label: embedding.label,
			state: modelState(embedding.name, embedding.dtype).state,
		});
	}

	return {
		name: entry.name,
		label: entry.label,
		size_mb: (entry.size_mb ?? 0) + (embedding?.size_mb ?? 0),
		installed: models.every((part) => isRunnableState(part.state)),
		state: worstState(models.map((part) => part.state)),
		models,
		embedding_name: embedding?.name,
	};
}

/** The voice-fingerprint model slot (`diarization_embedding_model`), or null. */
async function readDiarizationEmbeddingModel(): Promise<{
	name: string;
	label?: string;
	size_mb?: number;
	dtype?: Record<string, string>;
} | null> {
	return readModelConfigSlot('diarization_embedding_model');
}

async function readModelConfigSlot(slot: string): Promise<{
	name: string;
	label?: string;
	size_mb?: number;
	dtype?: Record<string, string>;
} | null> {
	const toolConfig = await getToolConfig('tool_transcription');
	const raw = (toolConfig as Record<string, unknown> | null)?.[slot];
	const entry =
		raw !== null && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)
			? (raw as { value?: unknown }).value
			: raw;
	if (entry === null || typeof entry !== 'object') return null;
	const model = entry as {
		name?: unknown;
		label?: string;
		size_mb?: number;
		dtype?: Record<string, string>;
	};
	return typeof model.name === 'string'
		? { name: model.name, label: model.label, size_mb: model.size_mb, dtype: model.dtype }
		: null;
}

/** The background download action name (allowlisted, never client-routable). */
const BACKGROUND_DOWNLOAD_ACTION = 'background_download_model';

/**
 * Read the LIVE model catalog (transcriber_quality) as typed entries.
 * getToolConfig returns the effective config — a flat map — but the raw
 * property-object form is tolerated like everywhere else in this module.
 */
async function readModelCatalog(): Promise<
	{ name: string; tier?: string; size_mb?: number; dtype?: Record<string, string> }[]
> {
	const toolConfig = await getToolConfig('tool_transcription');
	const raw = toolConfig?.transcriber_quality;
	const entries = Array.isArray(raw)
		? raw
		: ((raw as { value?: unknown[] } | undefined)?.value ?? []);
	return entries.filter(
		(entry): entry is { name: string } =>
			entry !== null &&
			typeof entry === 'object' &&
			typeof (entry as { name?: unknown }).name === 'string',
	) as { name: string; tier?: string; size_mb?: number; dtype?: Record<string, string> }[];
}

/**
 * download_model — seed one catalog model into the local store, from the UI.
 *
 * Before this, seeding required shell access (`scripts/fetch_ai_models.ts`) —
 * out of reach for the administrator of a hosted install, whose users saw every
 * uninstalled model greyed out with "ask your administrator" and no way for that
 * administrator to act.
 *
 * GATES, in order:
 *  - GLOBAL ADMIN only. This makes the server fetch ~1 GB from the public hub
 *    and write it to disk — an operator act, not a cataloguer's.
 *  - The model must be IN THE CATALOG. The id becomes a URL path on the hub and
 *    a directory under the store; free-form input would let a request download
 *    arbitrary repos or write outside the intended folder. Catalog names only.
 *
 * The download runs as a DETACHED background job (it can take many minutes;
 * identity captured at enqueue time), and the client polls `get_model_sources`
 * until the model turns up in `installed`. Note the deliberate asymmetry with
 * DEDALO_AI_MODEL_ALLOW_HUB: that flag governs the BROWSER streaming weights at
 * inference time (a per-recording privacy leak); this is the server seeding its
 * own store once, on an explicit admin request.
 */
async function downloadModelAction(ctx: ToolActionContext): Promise<ToolResponse> {
	if (ctx.principal?.isGlobalAdmin !== true) {
		return fail('Only a global administrator can download models');
	}

	const model = String(ctx.options.model ?? '');
	// Catalog names only (see the gate list above). Two slots qualify: the ASR
	// quality catalog, and the diarization model — which downloads a different
	// file set (no tokenizer; the preprocessor config is mandatory).
	const asrEntry = (await readModelCatalog()).find(
		(candidate) => candidate.name === model && (candidate.tier ?? 'browser') === 'browser',
	);
	const diarizationCandidates =
		asrEntry === undefined
			? [await readDiarizationModel(), await readDiarizationEmbeddingModel()]
			: [];
	const diarizationEntry =
		diarizationCandidates.find((candidate) => candidate !== null && candidate.name === model) ??
		undefined;
	const entry = asrEntry ?? diarizationEntry;
	if (entry === undefined) {
		return fail(`Unknown model: '${model}' is not in the transcriber catalog`);
	}
	// STATE-AWARE short-circuit. `modelInstalled` (the old size > 0 test) called a
	// truncated or corrupted install "already installed", so the client — which
	// offers Download for anything absent from `installed`, and that includes
	// `incomplete` and `damaged` — read a success it then polled for thirty
	// minutes against a model that was never going to appear. Only a RUNNABLE
	// model is already installed; a broken one is told what actually fixes it.
	const state = modelState(entry.name, entry.dtype).state;
	if (isRunnableState(state)) {
		return { result: true, msg: 'OK. Model already installed', errors: [] };
	}
	if (state !== 'missing') {
		return fail(
			`Model '${model}' is on disk but ${state}: downloading it again cannot fix that — repair it instead`,
		);
	}

	const loaded = await getLoadedTool('tool_transcription');
	if (loaded === undefined) {
		return fail('tool module not loaded — cannot schedule the download');
	}
	const scheduled = scheduleBackground(
		loaded,
		BACKGROUND_DOWNLOAD_ACTION,
		{ permission: null, handler: backgroundDownloadModel },
		{ model: entry.name, dtype: entry.dtype, kind: asrEntry === undefined ? 'diarization' : 'asr' },
		ctx.principal,
		ctx.userId,
	);
	if (scheduled.result === false) return scheduled;
	// The job handle, so the client can learn that the download FAILED instead of
	// polling the store for half an hour and then saying nothing.
	return {
		result: true,
		msg: 'OK. Download started',
		errors: [],
		job_id: scheduled.job_id,
		background_job_id: scheduled.background_job_id,
	};
}

/** The detached download job. Reads its whole world from the enqueue-time options. */
async function backgroundDownloadModel(ctx: ToolActionContext): Promise<ToolResponse> {
	const model = String(ctx.options.model ?? '');
	const dtype = (ctx.options.dtype ?? undefined) as Record<string, string> | undefined;
	console.log(`[tool_transcription] downloading model '${model}' into the local store…`);
	const fileOptions =
		ctx.options.kind === 'diarization'
			? { commonFiles: DIARIZATION_COMMON_FILES, optionalFiles: [] as string[] }
			: {};
	const report = await downloadModel(model, dtype, { quiet: true, ...fileOptions });
	if (report.ok) {
		console.log(`[tool_transcription] model '${model}' installed (${report.files.length} files)`);
		return { result: true, msg: `OK. Model installed: ${model}`, errors: [] };
	}
	console.error(`[tool_transcription] model download FAILED for '${model}':`, report.errors);
	return { result: false, msg: report.errors.join('; '), errors: report.errors };
}

/** The background repair action name (allowlisted, never client-routable). */
const BACKGROUND_REPAIR_ACTION = 'background_repair_model';

/** Catalog lookup shared by the model actions: ASR entry, else a diarization slot. */
async function catalogEntry(
	model: string,
): Promise<{ name: string; dtype?: Record<string, string>; kind: 'asr' | 'diarization' } | null> {
	const asr = (await readModelCatalog()).find(
		(candidate) => candidate.name === model && (candidate.tier ?? 'browser') === 'browser',
	);
	if (asr !== undefined) return { name: asr.name, dtype: asr.dtype, kind: 'asr' };
	const slots = [await readDiarizationModel(), await readDiarizationEmbeddingModel()];
	const entry = slots.find((candidate) => candidate !== null && candidate.name === model);
	return entry === undefined || entry === null
		? null
		: { name: entry.name, dtype: entry.dtype, kind: 'diarization' };
}

/**
 * verify_model — resolve an `unverified` model into `ready` or `incomplete`.
 *
 * Asks the hub for each file's length and records the ones that match, so the
 * store can answer from disk afterwards. Same two gates as download_model: this
 * makes the server talk to a public host, an operator act. An install with no
 * outbound internet gets a clean "could not be verified", never a false verdict —
 * an air-gapped archive must be able to say "I cannot check", not "it is broken".
 */
async function verifyModelAction(ctx: ToolActionContext): Promise<ToolResponse> {
	if (ctx.principal?.isGlobalAdmin !== true) {
		return fail('Only a global administrator can verify models');
	}
	const model = String(ctx.options.model ?? '');
	const entry = await catalogEntry(model);
	if (entry === null) {
		return fail(`Unknown model: '${model}' is not in the transcriber catalog`);
	}

	const store = modelStoreRoot();
	const report = modelState(entry.name, entry.dtype);
	let checked = 0;
	let unreachable = 0;
	for (const file of report.files) {
		if (!file.present || file.expected !== null) continue;
		// Through the SAME confinement helper the downloader uses. On the
		// dtype-less path these names come from readdirSync, so they are disk
		// content rather than catalog content: hand-assembling a hub URL from them
		// is the one place this module would invent a URL from something it did not
		// validate. Hardening, not a live hole — resolveModelPath already refuses a
		// traversing name at the serving door.
		const resolved = resolveFetchTarget(entry.name, file.file, store);
		if (resolved === null) {
			console.error(
				`[tool_transcription] verify '${model}': refusing the unsafe file name '${file.file}'`,
			);
			unreachable++;
			continue;
		}
		const length = await headContentLength(resolved.url);
		if (length === null) {
			unreachable++;
			continue;
		}
		recordFileComplete(store, entry.name, file.file, length);
		checked++;
	}

	const after = modelState(entry.name, entry.dtype);
	if (unreachable > 0 && checked === 0) {
		return fail(`Could not reach the model hub to verify '${model}'`);
	}
	// Partial unreachability must be VISIBLE, not swallowed into a plain "OK": an
	// admin who reads only "ready" cannot tell a flaky hub (some files unchecked,
	// try again) from a store that predates the manifest entirely (CONVENTIONS §1
	// — nothing is silently dropped).
	if (unreachable > 0) {
		const note = `${unreachable} file(s) could not be reached and remain unchecked`;
		console.warn(`[tool_transcription] verify '${model}': ${note}`);
		return { result: true, msg: `OK. Verified: ${after.state} (${note})`, errors: [] };
	}
	return { result: true, msg: `OK. Verified: ${after.state}`, errors: [] };
}

/**
 * The scheduling call `repair_model` makes, isolated behind a seam.
 *
 * Reaching this point already PROVES the catalog gate bound the requested name
 * (a name outside the catalog fails earlier). The default is the real
 * `scheduleBackground` (a live install has no other way to run a repair); tests
 * inject a spy so a KNOWN catalog name can be proven to pass the gate without
 * the real background job firing a network fetch or writing to the real store —
 * `scheduleBackground` fires the job fully detached, so nothing inside
 * `repairModelAction` itself can otherwise stop it once scheduled.
 */
export type ScheduleRepair = typeof scheduleBackground;

/**
 * REPAIRS IN FLIGHT — at most one per model, process-wide.
 *
 * A repair deletes files and re-fetches them. Two of them over the same paths
 * race `rmSync` against a download: the second job can delete a file the first
 * has just completed, and the first can record a manifest size for a file the
 * second has already removed. With a visible button and a poll that says nothing
 * for minutes, a second click is not an edge case — it is what an impatient
 * administrator does.
 *
 * LIFECYCLE: added by `repairModelAction` immediately before scheduling (and
 * dropped again if the schedule is refused), removed by `backgroundRepairModel`
 * in a `finally`, so a throwing job cannot lock a model out. Process state, never
 * request identity — the same shape as ontology_update's updateInFlight latch.
 * A server restart clears it with the in-process jobs it guards.
 */
const repairsInFlight = new Set<string>();

/**
 * Release the guard for one model.
 *
 * TESTS ONLY: a stubbed `ScheduleRepair` never runs the job, so nothing would
 * reach the `finally` that normally clears it. Never call this from the engine —
 * releasing a lock whose job is still running is exactly the race it exists to
 * prevent.
 */
export function releaseModelRepairLock(model: string): void {
	repairsInFlight.delete(model);
}

/**
 * repair_model — discard the files that fail their check and fetch them again.
 *
 * The remedy for the state this whole change exists to surface. Same gates as
 * download_model (global admin, catalog names only) and the same detached job,
 * so nothing new can be reached from the wire; the client polls the returned job
 * handle, so a repair that FAILS says so instead of leaving a progress line
 * standing forever.
 */
export async function repairModelAction(
	ctx: ToolActionContext,
	schedule: ScheduleRepair = scheduleBackground,
): Promise<ToolResponse> {
	if (ctx.principal?.isGlobalAdmin !== true) {
		return fail('Only a global administrator can repair models');
	}
	const model = String(ctx.options.model ?? '');
	const entry = await catalogEntry(model);
	if (entry === null) {
		return fail(`Unknown model: '${model}' is not in the transcriber catalog`);
	}
	// SERVER-side, because a disabled button is not a guard: the action is on the
	// wire and two tabs reach it independently.
	if (repairsInFlight.has(entry.name)) {
		return fail(`A repair of '${entry.name}' is already running; wait for it to finish`);
	}

	const loaded = await getLoadedTool('tool_transcription');
	if (loaded === undefined) {
		return fail('tool module not loaded — cannot schedule the repair');
	}
	repairsInFlight.add(entry.name);
	const scheduled = schedule(
		loaded,
		BACKGROUND_REPAIR_ACTION,
		{ permission: null, handler: backgroundRepairModel },
		{ model: entry.name, dtype: entry.dtype, kind: entry.kind },
		ctx.principal,
		ctx.userId,
	);
	if (scheduled.result === false) {
		repairsInFlight.delete(entry.name);
		return scheduled;
	}
	return {
		result: true,
		msg: 'OK. Repair started',
		errors: [],
		job_id: scheduled.job_id,
		background_job_id: scheduled.background_job_id,
	};
}

/**
 * The WORLD-TOUCHING collaborator of the repair job, behind a seam.
 *
 * `backgroundRepairModel` is the only code in this subsystem that DELETES files,
 * and it is where every remedy button in both clients ends up. Gating it must not
 * mean fetching a gigabyte from a public hub, so the downloader is injectable;
 * the store itself is relocated by DEDALO_AI_MODEL_STORE, exactly as the other
 * store gates do it.
 */
export interface RepairSeams {
	readonly download?: typeof downloadModel;
}

/** The non-weight files this kind of model needs, and which may legitimately be absent. */
function commonFilesFor(kind: string): { common: readonly string[]; optional: readonly string[] } {
	return kind === 'diarization'
		? { common: DIARIZATION_COMMON_FILES, optional: [] }
		: { common: COMMON_FILES, optional: OPTIONAL_FILES };
}

/** A file that fails its own check: absent, empty, the wrong KIND, or the wrong LENGTH. */
function failsCheck(evidence: ModelFileEvidence): boolean {
	if (!evidence.present || evidence.size === 0) return true;
	if (!evidence.plausible) return true;
	return evidence.expected !== null && evidence.expected !== evidence.size;
}

interface RepairPlan {
	/** Files to delete and fetch again — EXACTLY these, by name. */
	targets: string[];
	/** Files that fail their check but must not be deleted (see planRepair). */
	refused: string[];
}

/**
 * What a repair may touch.
 *
 * TWO RULES, both learned from a way this used to be wrong:
 *
 * 1. PER FILE, never per model. It used to treat every file as suspect as soon as
 *    the model's overall state was `damaged`, so one HTML error page written over
 *    the tokenizer took the weights with it.
 * 2. NEVER DELETE WHAT CANNOT BE NAMED AGAIN. On the dtype-less path the file
 *    names come from the store itself, and when the store holds no complete
 *    weight pair there are no names — `modelFiles()` supplies fp32 PLACEHOLDERS
 *    (`report.namesKnown === false`). Deleting a weight file on that authority
 *    and re-fetching `modelFiles(undefined)` is how a 400 MB working q4 install
 *    became a ~3 GB fp32 set the browser never asks for. Refuse, and say why.
 *
 * The common files (tokenizer.json, preprocessor_config.json…) are checked here
 * too: `modelState` only evidences what the model needs to LOAD, so a corrupt
 * tokenizer used to survive a repair that then reported success.
 */
function planRepair(
	store: string,
	model: string,
	report: ModelStateReport,
	common: readonly string[],
	optional: readonly string[],
): RepairPlan {
	const targets: string[] = [];
	const refused: string[] = [];

	for (const evidence of report.files) {
		if (!failsCheck(evidence)) continue;
		if (!report.namesKnown && evidence.file.endsWith('.onnx')) {
			refused.push(evidence.file);
			continue;
		}
		targets.push(evidence.file);
	}

	for (const file of common) {
		if (targets.includes(file)) continue;
		const evidence = fileEvidence(store, model, file);
		// A model that simply does not publish this file is not broken.
		if (!evidence.present && optional.includes(file)) continue;
		if (failsCheck(evidence)) targets.push(file);
	}

	return { targets, refused };
}

/** Delete one file and drop the manifest's (now stale) claim about it. */
function discardFile(store: string, model: string, file: string): void {
	const path = join(store, model, file);
	try {
		if (existsSync(path)) rmSync(path);
	} catch (error) {
		console.error(`[tool_transcription] could not remove '${path}' during repair:`, error);
	}
	// The manifest's claim about a deleted file is stale; dropping it makes the
	// next fetch ask the hub for the length again instead of trusting the record
	// that let the truncation through.
	forgetFile(store, model, file);
}

/**
 * Did the repair actually work? Re-check EVERY file it touched, not just the
 * ones the load path needs — reporting a success while a corrupt file survives
 * is the one outcome this subsystem forbids.
 */
function repairVerdict(input: {
	model: string;
	dtype?: Record<string, string>;
	store: string;
	common: readonly string[];
	optional: readonly string[];
	plan: RepairPlan;
	download: DownloadReport;
}): ToolResponse {
	const { model, store, plan, download } = input;
	const after = modelState(model, input.dtype);
	const stillFailing = plan.targets.filter((file) => {
		const evidence = fileEvidence(store, model, file);
		if (!evidence.present && input.optional.includes(file)) return false;
		return failsCheck(evidence);
	});

	if (download.ok && isRunnableState(after.state) && stillFailing.length === 0) {
		const msg = `OK. Model repaired: ${model} — ${plan.targets.length} file(s) re-fetched and re-checked (weights, config and ${input.common.length} common file(s)); state: ${after.state}`;
		console.log(`[tool_transcription] ${msg}`);
		return { result: true, msg, errors: [] };
	}

	const errors = [...download.errors];
	if (stillFailing.length > 0) {
		errors.push(`still failing after repair: ${stillFailing.join(', ')}`);
	}
	if (errors.length === 0) errors.push(`state after repair: ${after.state}`);
	console.error(`[tool_transcription] model repair FAILED for '${model}':`, errors);
	return { result: false, msg: errors.join('; '), errors };
}

/**
 * The detached repair job: delete exactly the files that fail their check, fetch
 * back exactly those, and re-check them before claiming anything.
 */
export async function backgroundRepairModel(
	ctx: ToolActionContext,
	seams: RepairSeams = {},
): Promise<ToolResponse> {
	const model = String(ctx.options.model ?? '');
	try {
		return await runModelRepair(model, ctx.options, seams);
	} finally {
		repairsInFlight.delete(model);
	}
}

async function runModelRepair(
	model: string,
	options: Record<string, unknown>,
	seams: RepairSeams,
): Promise<ToolResponse> {
	const dtype = (options.dtype ?? undefined) as Record<string, string> | undefined;
	const store = modelStoreRoot();
	const { common, optional } = commonFilesFor(String(options.kind ?? 'asr'));
	const plan = planRepair(store, model, modelState(model, dtype), common, optional);

	if (plan.refused.length > 0) {
		const msg = `Repair refused for '${model}': this install's catalog declares no quantisation for it and the store holds no complete weight pair, so ${plan.refused.join(', ')} cannot be named to fetch back. Deleting them would destroy what cannot be restored. Re-import the tools registry so the catalog declares the model's dtype, or seed the store directly.`;
		console.error(`[tool_transcription] ${msg}`);
		return { result: false, msg, errors: [msg] };
	}

	if (plan.targets.length === 0) {
		const msg = `OK. Nothing to repair: '${model}' passes every check (weights, config and ${common.length} common file(s))`;
		console.log(`[tool_transcription] ${msg}`);
		return { result: true, msg, errors: [] };
	}

	console.log(
		`[tool_transcription] repairing model '${model}': ${plan.targets.length} file(s) — ${plan.targets.join(', ')}`,
	);
	for (const file of plan.targets) discardFile(store, model, file);

	const download = await (seams.download ?? downloadModel)(model, dtype, {
		quiet: true,
		store,
		// EXACTLY what was removed: see DownloadOptions.files.
		files: plan.targets,
	});

	return repairVerdict({ model, dtype, store, common, optional, plan, download });
}

export const tool: ToolServerModule = {
	name: 'tool_transcription',
	apiActions: {
		get_model_sources: { permission: null, handler: getModelSources },
		download_model: { permission: null, handler: downloadModelAction },
		verify_model: { permission: null, handler: verifyModelAction },
		repair_model: { permission: null, handler: repairModelAction },
		create_transcribable_audio_file: { permission: null, handler: createTranscribableAudioFile },
		delete_transcribable_audio_file: { permission: null, handler: deleteTranscribableAudioFile },
		automatic_transcription: { permission: null, handler: automaticTranscription },
		check_server_transcriber_status: { permission: null, handler: checkServerTranscriberStatus },
		build_subtitles_file: { permission: null, handler: buildSubtitlesFile },
	},
	// Background-only actions: allowlisted here, absent from apiActions
	// (unroutable from the wire) — PHP BACKGROUND_RUNNABLE.
	backgroundRunnable: [
		BACKGROUND_POLL_ACTION,
		BACKGROUND_DOWNLOAD_ACTION,
		BACKGROUND_REPAIR_ACTION,
	],
};
