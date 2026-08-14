/**
 * THE TRANSCRIBER MODEL CATALOG — the ONE read of what models this install
 * declares, for every consumer that has to answer for them.
 *
 * There are two: the transcription tool's own server module (which downloads,
 * verifies and repairs them) and the `ai_models` maintenance widget (which
 * reports on them for an administrator). They used to read the config
 * separately, and they diverged exactly where it mattered — the widget read only
 * `transcriber_quality`, so the dashboard could say "2 of 2 usable" in green
 * while the tool showed a damaged segmentation model. Two humans, two truths,
 * one install.
 *
 * WHAT IT ANSWERS. Three catalog slots, never one:
 *   - `transcriber_quality` — the ASR (Whisper) quality catalog, an array;
 *   - `diarization_model` — WHO speaks WHEN (pyannote segmentation);
 *   - `diarization_embedding_model` — the VOICE FINGERPRINT that keeps one voice
 *     under one speaker id across a whole recording.
 * The two diarization slots are a PAIR: speaker detection needs both, so they
 * are reported as one group and never folded into the ASR list (they are not
 * pickable qualities).
 *
 * `readable` IS PART OF THE ANSWER. A config read can fail — the tool config
 * lives in the database. An unreadable catalog is NOT an empty catalog, and the
 * whole point of this subsystem is that a wrong sentence ("nothing is installed")
 * is worse than no sentence. Callers must branch on `readable` before they say
 * anything about what is or is not there.
 *
 * NO STORE I/O: this module reads configuration only. What is on disk is
 * `model_store.ts`'s answer, and the kind recorded here is what lets that
 * answer be shaped correctly (`ModelKind`).
 */

import { getToolConfig } from '../tools/config.ts';
import type { ModelKind } from './model_store.ts';

/** The tool whose config carries the catalog. */
const TOOL = 'tool_transcription';

/** Which half of the speaker-detection pair an entry is. */
export type DiarizationRole = 'segmentation' | 'embedding';

/** One declared model, whatever slot it came from. */
export interface CatalogModel {
	name: string;
	label?: string;
	/** 'browser' (or absent) for the models this install's browsers run. */
	tier?: string;
	size_mb?: number;
	dtype?: Record<string, string>;
	/** What FILES it needs — never guessed from the id (see ModelKind). */
	kind: ModelKind;
	/** Only on the diarization pair. */
	role?: DiarizationRole;
}

export interface TranscriberCatalog {
	/**
	 * FALSE when the config could not be read at all. Everything below is then
	 * empty because nothing is KNOWN — never because nothing is declared.
	 */
	readable: boolean;
	/** The ASR quality catalog, browser tier only. */
	asr: CatalogModel[];
	/** The speaker-detection pair, in role order (segmentation first). */
	diarization: CatalogModel[];
}

/** The array behind either config shape (flat effective value, or `{value:[…]}`). */
function arrayValue(raw: unknown): unknown[] {
	if (Array.isArray(raw)) return raw;
	const nested = (raw as { value?: unknown } | null | undefined)?.value;
	return Array.isArray(nested) ? nested : [];
}

/** The object behind either config shape. */
function objectValue(raw: unknown): Record<string, unknown> | null {
	if (raw === null || typeof raw !== 'object') return null;
	const nested = (raw as { value?: unknown }).value;
	const entry = nested !== undefined ? nested : raw;
	return entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
}

/** A declared `kind`, or the slot's own default. An unreadable word is 'unknown'. */
function readKind(raw: unknown, fallback: ModelKind): ModelKind {
	if (raw === undefined || raw === null) return fallback;
	if (raw === 'asr' || raw === 'diarization') return raw;
	// A kind this build has not learned yet: say so rather than assume the
	// fallback's file shape and report a healthy model broken.
	return 'unknown';
}

/** A config field that must be a string to be reported at all. */
function optString(raw: unknown): string | undefined {
	return typeof raw === 'string' ? raw : undefined;
}

/** A config field that must be a number to be reported at all. */
function optNumber(raw: unknown): number | undefined {
	return typeof raw === 'number' ? raw : undefined;
}

/** One raw catalog value → a named model, or null when it cannot be one. */
function toModel(
	raw: unknown,
	fallbackKind: ModelKind,
	role?: DiarizationRole,
): CatalogModel | null {
	const entry = objectValue(raw);
	if (entry === null || typeof entry.name !== 'string') return null;
	return {
		name: entry.name,
		label: optString(entry.label),
		tier: optString(entry.tier),
		size_mb: optNumber(entry.size_mb),
		dtype: (entry.dtype ?? undefined) as Record<string, string> | undefined,
		kind: readKind(entry.kind, fallbackKind),
		role,
	};
}

/** Only the models the BROWSER runs are in this store; a tier-less entry is one. */
function isBrowserTier(entry: CatalogModel): boolean {
	return entry.tier === undefined || entry.tier === 'browser';
}

/**
 * The whole declared catalog, or `{readable:false}` when the config cannot be
 * read. Never throws: every caller is a status reader, and a status reader that
 * throws is a blank panel.
 */
export async function readTranscriberCatalog(): Promise<TranscriberCatalog> {
	let toolConfig: Record<string, unknown> | null;
	try {
		toolConfig = (await getToolConfig(TOOL)) as Record<string, unknown> | null;
	} catch (error) {
		// CONVENTIONS §1: reported, never swallowed — and never turned into "there
		// are no models", which is a different, false sentence.
		console.error('[ai] could not read the transcriber model catalog:', error);
		return { readable: false, asr: [], diarization: [] };
	}

	return {
		readable: true,
		asr: readAsrEntries(toolConfig?.transcriber_quality),
		diarization: readDiarizationPair(toolConfig),
	};
}

/** The ASR quality catalog: named, browser-tier entries only. */
function readAsrEntries(raw: unknown): CatalogModel[] {
	const asr: CatalogModel[] = [];
	for (const entry of arrayValue(raw)) {
		const model = toModel(entry, 'asr');
		if (model !== null && isBrowserTier(model)) asr.push(model);
	}
	return asr;
}

/** The speaker-detection slots, segmentation first (the pair's own order). */
function readDiarizationPair(toolConfig: Record<string, unknown> | null): CatalogModel[] {
	const pair = [
		toModel(toolConfig?.diarization_model, 'diarization', 'segmentation'),
		toModel(toolConfig?.diarization_embedding_model, 'diarization', 'embedding'),
	];
	return pair.filter((entry): entry is CatalogModel => entry !== null);
}

/**
 * One declared model by name, from any slot — the lookup every model ACTION
 * (download / verify / repair) binds its argument against, so a free-form id can
 * never become a hub URL or a directory under the store.
 *
 * Null covers both "not declared" and "cannot tell": an action must refuse in
 * either case, and `readTranscriberCatalog().readable` is where a STATUS reader
 * tells them apart.
 */
export async function findCatalogModel(name: string): Promise<CatalogModel | null> {
	if (name === '') return null;
	const catalog = await readTranscriberCatalog();
	return (
		catalog.asr.find((entry) => entry.name === name) ??
		catalog.diarization.find((entry) => entry.name === name) ??
		null
	);
}
