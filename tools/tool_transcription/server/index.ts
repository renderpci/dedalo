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
	type CatalogModel,
	findCatalogModel,
	readTranscriberCatalog,
	type TranscriberCatalog,
} from '../../../src/core/ai/model_catalog.ts';
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
	type ModelKind,
	type ModelState,
	type ModelStateReport,
	modelHubAllowed,
	modelState,
	modelStoreAvailable,
	modelStoreRoot,
} from '../../../src/core/ai/model_store.ts';
import type { MediaTypeSpec } from '../../../src/core/concepts/media.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import { DedaloError, LEGACY_TOKEN_MAP, ok } from '../../../src/core/errors/index.ts';
import { probeFormat } from '../../../src/core/media/engine/ffmpeg.ts';
import { mediaJobs } from '../../../src/core/media/jobs.ts';
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
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
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

/**
 * The unreachable handler a synthetic ToolActionSpec needs when a gate is run
 * imperatively (assertActionPermission takes a whole spec). It is never called;
 * calling it is an engine invariant break, so it throws.
 */
async function unreachableHandler(): Promise<ToolResponse> {
	throw new DedaloError('internal.unexpected', {
		message: 'tool_transcription: the synthetic permission-gate handler was invoked',
	});
}

/**
 * A gate refusal from `assertActionPermission`, as the registered code the
 * dispatch chokepoint converts. security.ts still answers with a legacy token
 * (its own sweep is separate), so the token is mapped here exactly as
 * src/core/tools/dispatch.ts maps it.
 */
function permissionRefusal(check: { msg: string; errors: string[] }, action: string): DedaloError {
	return new DedaloError(LEGACY_TOKEN_MAP[check.errors[0] ?? ''] ?? 'perm.denied', {
		coordinates: { tool: 'tool_transcription', action },
		message: check.msg,
	});
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
async function gateRecord(ddo: MediaDdo, ctx: ToolActionContext, minLevel: number): Promise<void> {
	const check = await assertActionPermission(
		{ permission: 'record', minLevel, handler: unreachableHandler },
		{ section_tipo: ddo.section_tipo, section_id: ddo.section_id },
		ctx.principal,
	);
	if (!check.ok) throw permissionRefusal(check, `record gate (level ${minLevel})`);
}

/** PHP in-method gate: WRITE level 2 on the media_ddo section + record-in-scope. */
async function gateRecordWrite(ddo: MediaDdo, ctx: ToolActionContext): Promise<void> {
	await gateRecord(ddo, ctx, 2);
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
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { tool: 'tool_transcription' },
			message:
				'DEDALO_MEDIA_EXPORT_BASE is not set: an external transcriber cannot fetch a relative media URL. Set it to the public media base (e.g. https://host/dedalo/media) in ../private/.env.',
		});
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
	readonly gate?: (ddo: MediaDdo, ctx: ToolActionContext) => Promise<void>;
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
	const ddo = readMediaDdo(ctx.options);
	await gateRecordWrite(ddo, ctx);

	const { spec, identity, pathOpts } = await resolveMediaToolContext({
		component_tipo: ddo.component_tipo,
		section_tipo: ddo.section_tipo,
		section_id: ddo.section_id,
	});
	const relativePath = await ensureTranscribableAudio(spec, identity, pathOpts);
	return ok(clientMediaUrl(relativePath), { requestId: toolRequestId(ctx) });
}

async function deleteTranscribableAudioFile(ctx: ToolActionContext): Promise<ToolResponse> {
	const ddo = readMediaDdo(ctx.options);
	await gateRecordWrite(ddo, ctx);

	const { spec, identity, pathOpts } = await resolveMediaToolContext({
		component_tipo: ddo.component_tipo,
		section_tipo: ddo.section_tipo,
		section_id: ddo.section_id,
	});
	// `deleted` says whether a file was actually there — a FACT of the payload
	// (the legacy body carried it only inside its `msg` prose).
	const deleted = deleteTranscribableAudio(spec, identity, pathOpts);
	return ok({ deleted }, { requestId: toolRequestId(ctx) });
}

/**
 * automatic_transcription — the REMOTE ASR submit (external seam). Ensure the
 * audio quality, submit its URL to the configured transcriber server (which
 * returns a job PID), then detach the bounded background completion poll that
 * writes the transcript back (PHP exec_background_check_transcription →
 * check_background_transcriber_status → process_file).
 */
async function automaticTranscription(ctx: ToolActionContext): Promise<ToolResponse> {
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
		throw new DedaloError('request.invalid_options', {
			publicMessage:
				'Missing required parameters: source_lang, transcriber_quality, media_ddo, transcription_ddo',
		});
	}

	// WRITE gate on the transcription target (PHP assert_section_permission 2 + scope).
	await gateRecordWrite(transcriptionDdo, ctx);

	// TOOLS-06 (2026-07-28 audit): ALSO gate READ on the media SOURCE.
	// Transcription reads the audio CONTENT of media_ddo — without this a
	// caller who can write their OWN transcription target could transcribe the
	// restricted audio of ANY AV record (one they cannot read) into a record
	// they control. Read level 1 + record-in-scope on the source media record.
	await gateRecord(mediaDdo, ctx, 1);

	const { provider, error: providerError } = resolveTranscriberProvider(engine);
	if (provider === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: providerError ?? 'unknown transcriber engine',
			coordinates: { engine },
		});
	}
	// Config entry is looked up by the ORIGINAL engine name; the POSTed
	// engine field uses the mapped one ('local' → babel) — PHP does both.
	const cfg = resolveTranscriberConfig(await getToolConfig('tool_transcription'), engine);
	if (cfg === null) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { engine },
			message: `Transcriber config (uri/key) is not defined for '${engine}'`,
		});
	}
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
	const audioPath = isLocalEngine ? absoluteFromRelative(audioRel, pathOpts.mediaRoot) : undefined;
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
	// The submit seam answers its own internal `{ok, pid|msg}` outcome
	// (src/core/tools/transcription_asr.ts TranscribeResult): an
	// unreachable/blocked ASR server is a dependency failure, not a caller fault.
	if (!result.ok) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { engine: mappedEngine },
			message: result.msg,
		});
	}

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
				pid: result.pid,
			},
			ctx.principal,
			ctx.userId,
		);
	} else {
		console.error(
			'[tool_transcription] could not schedule the background completion poll (module not loaded); the client can still poll check_server_transcriber_status',
		);
	}

	// WC-007: the legacy body's success msg is dropped — `ok` IS the success.
	return ok({ pid: result.pid }, { requestId: toolRequestId(ctx) });
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

	// A BACKGROUND job: a refusal here is the job's terminal state (background.ts
	// records `error` on the job record), not a wire body.
	if (!outcome.ok) {
		throw new DedaloError('tool.action_failed', {
			coordinates: { action: BACKGROUND_POLL_ACTION },
			message: outcome.msg,
		});
	}
	return ok(true, { requestId: toolRequestId(ctx) });
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
		await gate(ddo, ctx);
	}

	const rawDdo = ctx.options.media_ddo ?? null;
	const engine = String(ctx.options.transcriber_engine ?? '');
	const pid = ctx.options.pid;

	const missing: string[] = [];
	if (rawDdo === null) missing.push('media_ddo');
	if (phpEmpty(engine)) missing.push('transcriber_engine');
	if (phpEmpty(pid)) missing.push('pid');
	if (missing.length > 0) {
		throw new DedaloError('request.invalid_options', {
			publicMessage: `Missing required parameters: ${missing.join(', ')}`,
		});
	}

	const cfg = await (seams.transcriberConfig ?? defaultTranscriberConfig)(engine);
	if (cfg === null) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { engine },
			message: `Transcriber config (uri/key) is not defined for '${engine}'`,
		});
	}

	const { provider, error: providerError } = (
		seams.statusProvider ?? resolveTranscriberStatusProvider
	)(engine);
	if (provider === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: providerError ?? `Sorry. '${engine}' is not implemented yet`,
			coordinates: { engine },
		});
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
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `'${String(ddo.component_tipo)}' is not component_av`,
			coordinates: { tipo: String(ddo.component_tipo ?? ''), model: spec.model },
		});
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
	// blocked (SSRF) URI comes back as the provider's `{ok:false, msg}`
	// outcome, NOT as a thrown error. Report it as a FAILURE — WC-007 rewrites
	// the msg on the SUCCESS branch only; a down ASR server must never read OK.
	if (result === null || result === undefined) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { engine },
			message: 'Transcriber server returned no status',
		});
	}
	if (typeof result === 'object' && (result as { ok?: unknown }).ok === false) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { engine },
			message: String((result as { msg?: unknown }).msg ?? 'transcriber request failed'),
		});
	}

	// WC-007: the legacy body's success msg is dropped — `ok` IS the success.
	return ok(result, { requestId: toolRequestId(ctx) });
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
			{ permission: 'tipo', minLevel: 2, handler: unreachableHandler },
			{ section_tipo: sectionTipo, tipo: componentTipo },
			ctx.principal,
		);
		if (!tipoGate.ok) throw permissionRefusal(tipoGate, 'build_subtitles_file (tipo)');
		if (!phpEmpty(o.section_id)) {
			const scopeGate = await assertActionPermission(
				{ permission: 'record', minLevel: 2, handler: unreachableHandler },
				{ section_tipo: sectionTipo, section_id: sectionId },
				ctx.principal,
			);
			if (!scopeGate.ok) throw permissionRefusal(scopeGate, 'build_subtitles_file (record)');
		}
	}

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
		throw new DedaloError('request.invalid_options', {
			publicMessage: `Missing required parameters: ${missing.join(', ')}`,
		});
	}

	// Read the transcription text (PHP get_data_lang(lang)[key]->value).
	const model = await getModelByTipo(componentTipo);
	if (model === null) {
		throw new DedaloError('request.invalid_tipo', { coordinates: { tipo: componentTipo } });
	}
	const table = await getMatrixTableFromTipo(sectionTipo);
	const record = table !== null ? await readMatrixRecord(table, sectionTipo, sectionId) : null;
	const items = record !== null ? (readComponentItems(record, componentTipo, model) ?? []) : [];
	const langItems = filterItemsByLang(items, lang);
	const rawValue = (langItems[key] as { value?: unknown } | undefined)?.value;
	const sourceText = String(rawValue ?? '').trim();
	if (sourceText === '') {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: 'The transcription component is empty; there is nothing to subtitle',
			coordinates: { tipo: componentTipo, section_tipo: sectionTipo, section_id: sectionId },
		});
	}

	// Resolve the related AV component (the ontology 'related' pairing —
	// PHP get_related_component_av_tipo).
	const avTipo = await relatedTipoByModel(componentTipo, 'component_av');
	if (avTipo === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `No component_av is related to '${componentTipo}'`,
			coordinates: { tipo: componentTipo },
		});
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
	if (subtitles.data === false) {
		throw new DedaloError('tool.action_failed', {
			coordinates: { tipo: componentTipo, section_id: sectionId },
			message: `Unable to build subtitles: ${subtitles.msg}`,
		});
	}

	// Target path/url — the ONE shared subtitles grammar (media/path.ts).
	const vttPath = subtitlesPath(avIdentity, lang, avPathOpts.mediaRoot);
	const targetFolder = dirname(vttPath);
	if (!existsSync(targetFolder)) {
		// PHP semantics: the dir must already exist — do NOT create it. The path
		// is a server-side location: LOG-only (coordinates), never on the wire.
		throw new DedaloError('tool.action_failed', {
			coordinates: { subtitles_dir: targetFolder },
			message: `The subtitles dir does not exist: ${targetFolder}`,
		});
	}
	writeFileSync(vttPath, subtitles.data);

	// `url` stays a TOP-LEVEL extension key: the client reads response.url.
	return ok(true, {
		requestId: toolRequestId(ctx),
		extend: { url: subtitlesUrl(avIdentity, lang) },
	});
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
async function getModelSources(ctx: ToolActionContext): Promise<ToolResponse> {
	// The facts that hold whatever the catalog does: they come from config and the
	// filesystem, never from the database.
	const base = {
		model_host: AI_MODEL_URL_PREFIX,
		allow_hub: modelHubAllowed(),
		store_ready: modelStoreAvailable(),
	};

	return ok(buildModelSourcesPayload(await readTranscriberCatalog(), base), {
		requestId: toolRequestId(ctx),
	});
}

/**
 * THE DEGRADED-ANSWER CONTRACT, as a pure function of what the catalog read
 * produced — so it can be gated without a database, and so the one decision it
 * encodes (absent ≠ empty) has a name.
 *
 * Gate: test/unit/tool_transcription.test.ts, "the degraded answer".
 */
export function buildModelSourcesPayload(
	catalog: TranscriberCatalog,
	base: { model_host: string; allow_hub: boolean; store_ready: boolean },
): Record<string, unknown> {
	if (!catalog.readable) {
		// THE DEGRADED ANSWER. `installed` and `models` are OMITTED — not empty.
		//
		// An empty array is a real answer ("nothing is installed") that the client
		// acts on: it greys the model out, refuses the run, and offers a Download
		// the server then contradicts. A momentary database hiccup would therefore
		// tell every archivist their model was never installed. An ABSENT field is
		// the wire's way of saying "this server cannot tell", and every consumer
		// keeps its previous permissive behaviour when it sees one. Same rule for
		// `diarization`: absent = cannot tell, null = this install declares no
		// speaker detection.
		console.error(
			'[tool_transcription] get_model_sources: the model catalog could not be read — reporting the model fields as UNKNOWN (absent), never as empty',
		);
		return { ...base };
	}

	// Which catalog models are USABLE right now, and in what way. A boolean
	// "installed" could not distinguish a model nobody downloaded from one whose
	// download was killed mid-file — and it was the second that reached the
	// browser as "ERROR_CODE: 7 … protobuf parsing failed" with nothing in the UI.
	const installed: string[] = [];
	const models: { name: string; state: string; files: unknown[] }[] = [];
	for (const entry of catalog.asr) {
		const report = modelState(entry.name, entry.dtype, entry.kind);
		models.push({ name: entry.name, state: report.state, files: report.files });
		// `installed` KEEPS its old meaning — "the browser may try this" — so an
		// older client is never made worse by this change. An unverified model is
		// the normal state of every store seeded before the manifest existed: it
		// runs, with a warning.
		if (isRunnableState(report.state)) installed.push(entry.name);
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
	return {
		...base,
		installed,
		models,
		diarization: buildDiarizationPanel(catalog.diarization),
	};
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
 * install declares no segmentation model (speaker detection is simply absent) —
 * which is a REAL answer, unlike the absent field a degraded read produces.
 *
 * Pure: the catalog was already read (once) by the caller, so the same slots
 * cannot be read twice and disagree.
 */
function buildDiarizationPanel(entries: readonly CatalogModel[]): DiarizationPanel | null {
	const segmentation = entries.find((entry) => entry.role === 'segmentation');
	if (segmentation === undefined) return null;
	const embedding = entries.find((entry) => entry.role === 'embedding');

	const models: DiarizationPart[] = entries.map((entry) => ({
		role: entry.role ?? 'segmentation',
		name: entry.name,
		label: entry.label,
		state: modelState(entry.name, entry.dtype, entry.kind).state,
	}));

	return {
		name: segmentation.name,
		label: segmentation.label,
		size_mb: (segmentation.size_mb ?? 0) + (embedding?.size_mb ?? 0),
		installed: models.every((part) => isRunnableState(part.state)),
		state: worstState(models.map((part) => part.state)),
		models,
		embedding_name: embedding?.name,
	};
}

/** The background download action name (allowlisted, never client-routable). */
const BACKGROUND_DOWNLOAD_ACTION = 'background_download_model';

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
		throw new DedaloError('perm.denied', {
			coordinates: { tool: 'tool_transcription', action: 'download_model' },
		});
	}

	const model = String(ctx.options.model ?? '');
	// Catalog names only (see the gate list above). Two slots qualify: the ASR
	// quality catalog, and the diarization models — which download a different
	// file set (no tokenizer; the preprocessor config is mandatory).
	const entry = await findCatalogModel(model);
	if (entry === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `Unknown model: '${model}' is not in the transcriber catalog`,
			coordinates: { model },
		});
	}
	// SAME guard as repair, and the same reason: two `curl -C -` runs over one
	// target interleave their resumes. One button, one poll that says nothing for
	// minutes — a second click is what an impatient administrator does. Checked
	// BEFORE the state is read, because a model another job is actively writing
	// has no settled state to short-circuit on.
	const busy = modelJobInFlight(entry.name);
	if (busy !== null) refuseBusyModel(entry.name, busy);

	// STATE-AWARE short-circuit. `modelInstalled` (the old size > 0 test) called a
	// truncated or corrupted install "already installed", so the client — which
	// offers Download for anything absent from `installed`, and that includes
	// `incomplete` and `damaged` — read a success it then polled for thirty
	// minutes against a model that was never going to appear. Only a RUNNABLE
	// model is already installed; a broken one is told what actually fixes it.
	const state = modelState(entry.name, entry.dtype, entry.kind).state;
	if (isRunnableState(state)) {
		return ok({ already_installed: true, state }, { requestId: toolRequestId(ctx) });
	}
	if (state !== 'missing') {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `Model '${model}' is on disk but ${state}: downloading it again cannot fix that — repair it instead`,
			coordinates: { model, state },
		});
	}

	const loaded = await getLoadedTool('tool_transcription');
	if (loaded === undefined) {
		throw new DedaloError('tool.no_server_module', {
			coordinates: { tool: 'tool_transcription', action: 'download_model' },
		});
	}
	return scheduleModelJob({
		action: BACKGROUND_DOWNLOAD_ACTION,
		label: 'download',
		handler: backgroundDownloadModel,
		loaded,
		entry,
		ctx,
		schedule: scheduleBackground,
		okMsg: 'OK. Download started',
	});
}

/** The detached download job. Reads its whole world from the enqueue-time options. */
async function backgroundDownloadModel(ctx: ToolActionContext): Promise<ToolResponse> {
	const model = String(ctx.options.model ?? '');
	try {
		return await runModelDownload(model, ctx.options);
	} finally {
		// Belt and braces: the claim is keyed on job liveness, so this only makes
		// the model answerable again a poll earlier.
		modelJobsInFlight.delete(model);
	}
}

async function runModelDownload(
	model: string,
	options: Record<string, unknown>,
): Promise<ToolResponse> {
	const dtype = (options.dtype ?? undefined) as Record<string, string> | undefined;
	const kind = modelKindOf(options.kind);
	console.log(`[tool_transcription] downloading model '${model}' into the local store…`);
	const fileOptions =
		kind === 'diarization'
			? { commonFiles: DIARIZATION_COMMON_FILES, optionalFiles: [] as string[] }
			: {};
	const report = await downloadModel(model, dtype, { quiet: true, kind, ...fileOptions });
	if (report.ok) {
		console.log(`[tool_transcription] model '${model}' installed (${report.files.length} files)`);
		return ok({ model, files: report.files.length }, { requestId: '' });
	}
	console.error(`[tool_transcription] model download FAILED for '${model}':`, report.errors);
	// BACKGROUND job: the throw IS the job's terminal state (background.ts keeps
	// `error` on the record, which get_background_job_status serves).
	throw new DedaloError('tool.action_failed', {
		coordinates: { model, action: 'download_model' },
		message: report.errors.join('; '),
	});
}

/**
 * The enqueued `kind` back as a ModelKind. A job payload crosses a process
 * boundary in shape only, but it still crosses one: an unreadable word is
 * 'unknown' (the store then answers from what is on disk) rather than silently
 * ASR, which is the assumption this whole finding is about.
 */
function modelKindOf(raw: unknown): ModelKind {
	return raw === 'asr' || raw === 'diarization' ? raw : 'unknown';
}

/** The background repair action name (allowlisted, never client-routable). */
const BACKGROUND_REPAIR_ACTION = 'background_repair_model';

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
		throw new DedaloError('perm.denied', {
			coordinates: { tool: 'tool_transcription', action: 'verify_model' },
		});
	}
	const model = String(ctx.options.model ?? '');
	const entry = await findCatalogModel(model);
	if (entry === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `Unknown model: '${model}' is not in the transcriber catalog`,
			coordinates: { model },
		});
	}

	const store = modelStoreRoot();
	const report = modelState(entry.name, entry.dtype, entry.kind);
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

	const after = modelState(entry.name, entry.dtype, entry.kind);
	if (unreachable > 0 && checked === 0) {
		throw new DedaloError('tool.dependency_unavailable', {
			coordinates: { model },
			message: `Could not reach the model hub to verify '${model}'`,
		});
	}
	// Partial unreachability must be VISIBLE, not swallowed into a plain "OK": an
	// admin who reads only "ready" cannot tell a flaky hub (some files unchecked,
	// try again) from a store that predates the manifest entirely (CONVENTIONS §1
	// — nothing is silently dropped).
	// Partial unreachability is part of the PAYLOAD (CONVENTIONS §1: never
	// swallowed into a plain OK), so it travels in `data`, not in a msg string.
	if (unreachable > 0) {
		const note = `${unreachable} file(s) could not be reached and remain unchecked`;
		console.warn(`[tool_transcription] verify '${model}': ${note}`);
		return ok(
			{ state: after.state, checked, unreachable, note },
			{ requestId: toolRequestId(ctx) },
		);
	}
	return ok({ state: after.state, checked, unreachable: 0 }, { requestId: toolRequestId(ctx) });
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
 * MODEL JOBS IN FLIGHT — at most one download OR repair per model, process-wide.
 *
 * Both actions write the same files: a repair deletes and re-fetches them, a
 * download resumes them with `curl -C -`. Two jobs over the same paths race —
 * the second can delete a file the first has just completed, and the first can
 * record a manifest size for a file the second has already removed. With a
 * visible button and a poll that says nothing for minutes, a second click is not
 * an edge case; it is what an impatient administrator does.
 *
 * KEYED ON THE JOB, NOT ON A FLAG. The guard used to be a bare Set cleared by
 * the job's own `finally` — which never runs when the job is CANCELLED WHILE
 * STILL QUEUED (`MediaJobManager.run` finishes it 'stopped' without invoking the
 * worker at all). Cancelling a queued job is a first-class button in the jobs
 * UI, so one press left that model answering "a repair is already running"
 * forever, with no recovery short of a server restart. The claim now carries the
 * job's id and is checked against the job registry: a job that is done, failed,
 * stopped, interrupted or gone is not in flight, whoever forgot to clear what.
 *
 * A claim with NO job id (only a stubbed scheduler produces one) keeps the old
 * flag behaviour, and `releaseModelJobLock` is how a test drops it.
 */
interface ModelJobClaim {
	/** What is running, for the refusal message. */
	action: 'download' | 'repair';
	/** The media-jobs handle whose liveness IS the guard. */
	jobId?: string;
}
const modelJobsInFlight = new Map<string, ModelJobClaim>();

/** A job the registry still considers live is one the job registry can still stop. */
function isLiveJob(jobId: string): boolean {
	const record = mediaJobs.status(jobId);
	return record !== null && (record.status === 'queued' || record.status === 'running');
}

/** The claim on this model, or null — releasing a claim whose job is over. */
function modelJobInFlight(model: string): ModelJobClaim | null {
	const claim = modelJobsInFlight.get(model);
	if (claim === undefined) return null;
	if (claim.jobId !== undefined && !isLiveJob(claim.jobId)) {
		modelJobsInFlight.delete(model);
		return null;
	}
	return claim;
}

/**
 * The model is already claimed by a live job — a CONFLICT, not a caller fault.
 * The sentence names the running action, which is safe to show, so the code's
 * disclosure carries it (`tool.unsupported_target` is the public-facing half of
 * the pair; the conflict status is what the client keys on).
 */
function refuseBusyModel(model: string, claim: ModelJobClaim): never {
	throw new DedaloError('resource.conflict', {
		coordinates: { model, running_action: claim.action },
		message: `A ${claim.action} of '${model}' is already running; wait for it to finish`,
	});
}

/**
 * Release the guard for one model.
 *
 * TESTS ONLY: a stubbed scheduler returns no job handle, so there is no job
 * whose liveness could answer for it. Never call this from the engine — releasing
 * a claim whose job is still running is exactly the race it exists to prevent.
 */
export function releaseModelRepairLock(model: string): void {
	modelJobsInFlight.delete(model);
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
		throw new DedaloError('perm.denied', {
			coordinates: { tool: 'tool_transcription', action: 'repair_model' },
		});
	}
	const model = String(ctx.options.model ?? '');
	const entry = await findCatalogModel(model);
	if (entry === null) {
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `Unknown model: '${model}' is not in the transcriber catalog`,
			coordinates: { model },
		});
	}
	// SERVER-side, because a disabled button is not a guard: the action is on the
	// wire and two tabs reach it independently.
	const busy = modelJobInFlight(entry.name);
	if (busy !== null) refuseBusyModel(entry.name, busy);

	const loaded = await getLoadedTool('tool_transcription');
	if (loaded === undefined) {
		throw new DedaloError('tool.no_server_module', {
			coordinates: { tool: 'tool_transcription', action: 'repair_model' },
		});
	}
	return scheduleModelJob({
		action: BACKGROUND_REPAIR_ACTION,
		label: 'repair',
		handler: backgroundRepairModel,
		loaded,
		entry,
		ctx,
		schedule,
		okMsg: 'OK. Repair started',
	});
}

/**
 * Claim the model and schedule the job — the ONE place both write actions are
 * started, so the guard cannot be right in one of them and wrong in the other.
 *
 * The re-check here is not redundant: it is the half that runs with NO `await`
 * between the check and the claim, which is what makes two concurrent requests
 * impossible to interleave (the caller's earlier check only saves the work of
 * loading the tool).
 */
async function scheduleModelJob(input: {
	action: string;
	label: 'download' | 'repair';
	handler: (ctx: ToolActionContext) => Promise<ToolResponse>;
	loaded: NonNullable<Awaited<ReturnType<typeof getLoadedTool>>>;
	entry: CatalogModel;
	ctx: ToolActionContext;
	schedule: ScheduleRepair;
	okMsg: string;
}): Promise<ToolResponse> {
	const { entry, ctx } = input;
	const busy = modelJobInFlight(entry.name);
	if (busy !== null) refuseBusyModel(entry.name, busy);

	const scheduled = input.schedule(
		input.loaded,
		input.action,
		{ permission: null, handler: input.handler },
		{ model: entry.name, dtype: entry.dtype, kind: entry.kind },
		ctx.principal,
		ctx.userId,
	);
	// scheduleBackground THROWS `tool.background_not_allowed` for a method not
	// in BACKGROUND_RUNNABLE (P1 sweep); a returned value is the ok envelope.
	modelJobsInFlight.set(entry.name, {
		action: input.label,
		jobId: typeof scheduled.job_id === 'string' ? scheduled.job_id : undefined,
	});
	// The job handle rides as EXTENSION KEYS (the client reads them by name), so
	// it can learn that the job FAILED instead of polling the store forever.
	return ok(true, {
		requestId: toolRequestId(ctx),
		extend: {
			job_id: scheduled.job_id,
			background_job_id: scheduled.background_job_id,
		},
	});
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

/**
 * The non-weight files this kind of model needs, and which may legitimately be
 * absent. An UNKNOWN kind demands NONE: inventing a requirement (the ASR
 * tokenizer, for a model that may not be ASR at all) is how a healthy install
 * gets called broken, and the repair then only touches the files the store's own
 * evidence named.
 */
function commonFilesFor(kind: ModelKind): {
	common: readonly string[];
	optional: readonly string[];
} {
	if (kind === 'diarization') return { common: DIARIZATION_COMMON_FILES, optional: [] };
	if (kind === 'unknown') return { common: [], optional: [] };
	return { common: COMMON_FILES, optional: OPTIONAL_FILES };
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
	kind: ModelKind;
	store: string;
	common: readonly string[];
	optional: readonly string[];
	plan: RepairPlan;
	download: DownloadReport;
}): ToolResponse {
	const { model, store, plan, download } = input;
	const after = modelState(model, input.dtype, input.kind);
	const stillFailing = plan.targets.filter((file) => {
		const evidence = fileEvidence(store, model, file);
		if (!evidence.present && input.optional.includes(file)) return false;
		return failsCheck(evidence);
	});

	if (download.ok && isRunnableState(after.state) && stillFailing.length === 0) {
		console.log(
			`[tool_transcription] OK. Model repaired: ${model} — ${plan.targets.length} file(s) re-fetched and re-checked (weights, config and ${input.common.length} common file(s)); state: ${after.state}`,
		);
		return ok({ model, state: after.state, repaired: plan.targets.length }, { requestId: '' });
	}

	const errors = [...download.errors];
	if (stillFailing.length > 0) {
		errors.push(`still failing after repair: ${stillFailing.join(', ')}`);
	}
	if (errors.length === 0) errors.push(`state after repair: ${after.state}`);
	console.error(`[tool_transcription] model repair FAILED for '${model}':`, errors);
	// BACKGROUND job — the throw is the terminal state (see runModelDownload).
	throw new DedaloError('tool.action_failed', {
		coordinates: { model, action: 'repair_model' },
		message: errors.join('; '),
	});
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
		// Belt and braces: the claim is keyed on job liveness (see
		// modelJobsInFlight), so this only frees the model a poll earlier.
		modelJobsInFlight.delete(model);
	}
}

async function runModelRepair(
	model: string,
	options: Record<string, unknown>,
	seams: RepairSeams,
): Promise<ToolResponse> {
	const dtype = (options.dtype ?? undefined) as Record<string, string> | undefined;
	const kind = modelKindOf(options.kind);
	const store = modelStoreRoot();
	const { common, optional } = commonFilesFor(kind);
	const plan = planRepair(store, model, modelState(model, dtype, kind), common, optional);

	if (plan.refused.length > 0) {
		// The remedy has to fit the reason. "Re-import the tools registry so the
		// catalog declares the dtype" is the fix when the KIND is known and only
		// the quantisation is missing; it cannot help when the catalog declares a
		// kind this build cannot read, because then the file shape itself is a
		// guess and no dtype would settle it.
		const remedy =
			kind === 'unknown'
				? "this install's catalog declares a model kind this engine does not recognise, so the files it needs cannot be named"
				: "this install's catalog declares no quantisation for it and the store holds no complete weight pair";
		const advice =
			kind === 'unknown'
				? 'Upgrade the engine or correct the catalog entry, or seed the store directly.'
				: "Re-import the tools registry so the catalog declares the model's dtype, or seed the store directly.";
		const msg = `Repair refused for '${model}': ${remedy}, so ${plan.refused.join(', ')} cannot be named to fetch back. Deleting them would destroy what cannot be restored. ${advice}`;
		console.error(`[tool_transcription] ${msg}`);
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: msg,
			coordinates: { model, refused: plan.refused.join(', ') },
		});
	}

	if (plan.targets.length === 0) {
		console.log(
			`[tool_transcription] OK. Nothing to repair: '${model}' passes every check (weights, config and ${common.length} common file(s))`,
		);
		return ok(
			{ model, repaired: 0, state: modelState(model, dtype, kind).state },
			{ requestId: '' },
		);
	}

	console.log(
		`[tool_transcription] repairing model '${model}': ${plan.targets.length} file(s) — ${plan.targets.join(', ')}`,
	);
	for (const file of plan.targets) discardFile(store, model, file);

	const download = await (seams.download ?? downloadModel)(model, dtype, {
		quiet: true,
		store,
		kind,
		// EXACTLY what was removed: see DownloadOptions.files.
		files: plan.targets,
	});

	return repairVerdict({ model, dtype, kind, store, common, optional, plan, download });
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
