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

import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../../src/config/config.ts';
import { downloadModel } from '../../../src/core/ai/model_fetch.ts';
import {
	AI_MODEL_URL_PREFIX,
	modelHubAllowed,
	modelInstalled,
	modelStoreAvailable,
} from '../../../src/core/ai/model_store.ts';
import type { MediaTypeSpec } from '../../../src/core/concepts/media.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import { probeFormat } from '../../../src/core/media/engine/ffmpeg.ts';
import {
	type MediaIdentity,
	type MediaPathOptions,
	absoluteFromRelative,
	buildMediaLocation,
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
} from '../../../src/core/tools/transcription_asr.ts';

interface MediaDdo {
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
 */
async function checkServerTranscriberStatus(ctx: ToolActionContext): Promise<ToolResponse> {
	// PHP gates BEFORE validation, only when media_ddo->section_tipo is present.
	const ddo = readMediaDdo(ctx.options);
	if (!phpEmpty(ddo.section_tipo)) {
		const denied = await gateRecord(ddo, ctx, 1);
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

		// Config entry by the ORIGINAL engine name (PHP $transcriber_name).
		const cfg = resolveTranscriberConfig(await getToolConfig('tool_transcription'), engine);
		if (cfg === null) return fail(`Transcriber config (uri/key) is not defined for '${engine}'`);

		const { provider, error: providerError } = resolveTranscriberStatusProvider(engine);
		if (provider === null) {
			return {
				result: false,
				msg: providerError ?? `Sorry. '${engine}' is not implemented yet`,
				errors: ['transcriber not implemented'],
			};
		}

		// Rebuild av_url EXACTLY as automatic_transcription does (same context
		// resolution, same quality ensure, same URL builder) — the transcriber
		// backend identifies the job by this URL, so it must match byte-for-byte.
		const { spec, identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: ddo.component_tipo,
			section_tipo: ddo.section_tipo,
			section_id: ddo.section_id,
		});
		const audioRel = await ensureAudioQuality(spec, identity, pathOpts);

		const result = await provider({
			uri: cfg.uri,
			key: cfg.key,
			avUrl: externalMediaUrl(audioRel),
			engine: mapTranscriberEngine(engine),
			userId: ctx.userId,
			entityName: config.entity,
			pid: pid as string | number,
			deleteResult: false,
		});

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
	// Which catalog models are actually USABLE right now. Without this the picker
	// happily offers a model nobody downloaded, and the run dies deep inside the
	// ONNX runtime with "Could not locate file: …/config.json" — a message that
	// tells an archivist nothing and an administrator almost nothing.
	const installed: string[] = [];
	try {
		// getToolConfig returns the EFFECTIVE config — a flat map of key → resolved
		// value — so `transcriber_quality` IS the catalog array.
		const toolConfig = await getToolConfig('tool_transcription');
		const raw = toolConfig?.transcriber_quality;
		const entries = Array.isArray(raw)
			? raw
			: ((raw as { value?: unknown[] } | undefined)?.value ?? null);
		if (Array.isArray(entries)) {
			for (const raw of entries) {
				if (raw === null || typeof raw !== 'object') continue;
				const entry = raw as { name?: unknown; tier?: unknown; dtype?: Record<string, string> };
				if (typeof entry.name !== 'string') continue;
				if (entry.tier !== undefined && entry.tier !== 'browser') continue;
				if (modelInstalled(entry.name, entry.dtype)) installed.push(entry.name);
			}
		}
	} catch (error) {
		// A missing/!unreadable catalog must not break the transcription flow: the
		// client falls back to offering everything, exactly as it did before.
		console.error('[tool_transcription] could not read the model catalog:', error);
	}

	return {
		result: {
			model_host: AI_MODEL_URL_PREFIX,
			allow_hub: modelHubAllowed(),
			store_ready: modelStoreAvailable(),
			installed,
		},
		msg: 'OK',
		errors: [],
	};
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
	const entry = (await readModelCatalog()).find(
		(candidate) => candidate.name === model && (candidate.tier ?? 'browser') === 'browser',
	);
	if (entry === undefined) {
		return fail(`Unknown model: '${model}' is not in the transcriber catalog`);
	}
	if (modelInstalled(entry.name, entry.dtype)) {
		return { result: true, msg: 'OK. Model already installed', errors: [] };
	}

	const loaded = await getLoadedTool('tool_transcription');
	if (loaded === undefined) {
		return fail('tool module not loaded — cannot schedule the download');
	}
	scheduleBackground(
		loaded,
		BACKGROUND_DOWNLOAD_ACTION,
		{ permission: null, handler: backgroundDownloadModel },
		{ model: entry.name, dtype: entry.dtype },
		ctx.principal,
		ctx.userId,
	);
	return { result: true, msg: 'OK. Download started', errors: [] };
}

/** The detached download job. Reads its whole world from the enqueue-time options. */
async function backgroundDownloadModel(ctx: ToolActionContext): Promise<ToolResponse> {
	const model = String(ctx.options.model ?? '');
	const dtype = (ctx.options.dtype ?? undefined) as Record<string, string> | undefined;
	console.log(`[tool_transcription] downloading model '${model}' into the local store…`);
	const report = await downloadModel(model, dtype, { quiet: true });
	if (report.ok) {
		console.log(`[tool_transcription] model '${model}' installed (${report.files.length} files)`);
		return { result: true, msg: `OK. Model installed: ${model}`, errors: [] };
	}
	console.error(`[tool_transcription] model download FAILED for '${model}':`, report.errors);
	return { result: false, msg: report.errors.join('; '), errors: report.errors };
}

export const tool: ToolServerModule = {
	name: 'tool_transcription',
	apiActions: {
		get_model_sources: { permission: null, handler: getModelSources },
		download_model: { permission: null, handler: downloadModelAction },
		create_transcribable_audio_file: { permission: null, handler: createTranscribableAudioFile },
		delete_transcribable_audio_file: { permission: null, handler: deleteTranscribableAudioFile },
		automatic_transcription: { permission: null, handler: automaticTranscription },
		check_server_transcriber_status: { permission: null, handler: checkServerTranscriberStatus },
		build_subtitles_file: { permission: null, handler: buildSubtitlesFile },
	},
	// Background-only actions: allowlisted here, absent from apiActions
	// (unroutable from the wire) — PHP BACKGROUND_RUNNABLE.
	backgroundRunnable: [BACKGROUND_POLL_ACTION, BACKGROUND_DOWNLOAD_ACTION],
};
