/**
 * THE TRANSCRIBER CATALOG AS THE REPO SHIPS IT — read from
 * `tools/tool_transcription/register.json`, never restated.
 *
 * Three readers need the same list: the store seeder (`fetch_ai_models.ts`),
 * the pin generator (`pin_ai_models.ts`) and the integrity gate
 * (`model_artifact_integrity_native`, which asserts every catalog model is
 * pinned). One copy, so the picker in the browser, the seeder and the pin
 * census can never drift on which models exist or which quantisation they use.
 *
 * (The engine's own runtime read is `src/core/ai/model_catalog.ts`, from the
 * DATABASE — a live install's registered catalog. This one reads the FILE the
 * repo ships, which is what a script on an operator's machine and a hermetic
 * gate can see.)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	COMMON_FILES,
	DIARIZATION_COMMON_FILES,
	OPTIONAL_FILES,
} from '../../src/core/ai/model_fetch.ts';
import { type ModelKind, modelFiles } from '../../src/core/ai/model_store.ts';

export interface RegisterCatalogModel {
	id: string;
	label: string;
	note: string;
	/** Per-part quantisation from the catalog; absent = the repo's default files. */
	dtype?: Record<string, string>;
	/** 'diarization' downloads a different file set (no tokenizer, mandatory preprocessor). */
	kind?: 'asr' | 'diarization';
}

export const REGISTER_PATH = resolve(
	import.meta.dir,
	'..',
	'..',
	'tools',
	'tool_transcription',
	'register.json',
);

interface RawEntry {
	name?: string;
	label?: string;
	notes?: string;
	size_mb?: number;
	tier?: string;
	dtype?: Record<string, string>;
}

function note(entry: RawEntry): string {
	return `${entry.notes ?? ''}${entry.size_mb !== undefined ? ` (~${entry.size_mb} MB)` : ''}`.trim();
}

/** Every browser-tier catalog model: the speaker-detection pair first, then the ASR list. */
export function readRegisterCatalog(registerPath: string = REGISTER_PATH): RegisterCatalogModel[] {
	const register = JSON.parse(readFileSync(registerPath, 'utf8')) as {
		misc?: Record<string, { value?: Record<string, { value?: unknown }> }[]>;
	};
	const configValue = register.misc?.dd1633?.[0]?.value;
	const entries = configValue?.transcriber_quality?.value;
	if (!Array.isArray(entries)) {
		throw new Error(`no transcriber_quality catalog found in ${registerPath}`);
	}
	const models: RegisterCatalogModel[] = [];
	for (const slot of ['diarization_model', 'diarization_embedding_model']) {
		const entry = configValue?.[slot]?.value as RawEntry | undefined;
		if (entry !== undefined && typeof entry.name === 'string') {
			models.push({
				id: entry.name,
				label: entry.label ?? entry.name,
				note: note(entry),
				dtype: entry.dtype,
				kind: 'diarization',
			});
		}
	}
	for (const raw of entries) {
		if (raw === null || typeof raw !== 'object') continue;
		const entry = raw as RawEntry;
		if (typeof entry.name !== 'string') continue;
		if (entry.tier !== undefined && entry.tier !== 'browser') continue;
		models.push({
			id: entry.name,
			label: entry.label ?? entry.name,
			note: note(entry),
			dtype: entry.dtype,
		});
	}
	return models;
}

/** The non-weight files a kind needs, and which of them may be absent upstream. */
export function commonFilesFor(kind: ModelKind): {
	common: readonly string[];
	optional: readonly string[];
} {
	if (kind === 'diarization') return { common: DIARIZATION_COMMON_FILES, optional: [] };
	return { common: COMMON_FILES, optional: OPTIONAL_FILES };
}

/**
 * The exact file list one catalog entry needs in the store — the ENGINE's own
 * `modelFiles` plus the kind's common files, so seeder, pinner and store can
 * never disagree on what "installed" means.
 */
export function filesFor(model: RegisterCatalogModel): string[] {
	const kind: ModelKind = model.kind ?? 'asr';
	return [...new Set([...commonFilesFor(kind).common, ...modelFiles(model.dtype, kind)])];
}
