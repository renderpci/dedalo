/**
 * ai_models widget — the local AI model store, for an administrator.
 *
 * In-browser transcription only works if the model is in THIS install's store, and
 * until now nothing in the interface said whether it was. A model whose download
 * was killed mid-file reported itself installed and failed inside the browser's
 * ONNX runtime minutes later; the administrator's only diagnostic was a console
 * line in someone else's browser.
 *
 * DISPLAY-ONLY, deliberately: the download / verify / repair executes live in the
 * transcription tool's own server module, admin-gated there. This widget shows the
 * truth (per model: state, bytes on disk) and points the operator at that tool,
 * rather than growing a second copy of the download machinery — and a second gate
 * to keep right. So: no `apiActions`, nothing new reachable from the wire.
 *
 * No network I/O: every fact here is read from the install's own disk and config.
 */

import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	modelFiles,
	modelHubAllowed,
	type ModelState,
	modelState,
	modelStoreAvailable,
	modelStoreRoot,
} from '../../ai/model_store.ts';
import { getToolConfig } from '../../tools/config.ts';
import type { WidgetModule } from './support.ts';

export interface AiModelRow {
	name: string;
	label: string;
	state: ModelState;
	bytes: number;
}

/**
 * A TYPE ALIAS, not an interface: `eagerValue` returns
 * `Record<string, unknown> | null`, and an interface (being open to
 * declaration merging) has no implicit index signature to satisfy it.
 */
export type AiModelsPanel = {
	store_path: string;
	store_available: boolean;
	hub_allowed: boolean;
	models: AiModelRow[];
	usable_count: number;
	total_bytes: number;
};

/** The panel shape, from already-read facts. Pure: the gate drives it directly. */
export function buildAiModelsPanel(input: {
	storePath: string;
	storeAvailable: boolean;
	hubAllowed: boolean;
	models: AiModelRow[];
}): AiModelsPanel {
	const models = input.storeAvailable ? input.models : [];
	return {
		store_path: input.storePath,
		store_available: input.storeAvailable,
		hub_allowed: input.hubAllowed,
		models,
		// "Usable" is what the browser may attempt: ready, or present-but-unverified
		// (the normal state of every store seeded before the manifest existed). It is
		// the same meaning tool_transcription's `installed` list carries, so the
		// dashboard count and the tool's model picker cannot disagree.
		usable_count: models.filter((model) => model.state === 'ready' || model.state === 'unverified')
			.length,
		total_bytes: models.reduce((sum, model) => sum + model.bytes, 0),
	};
}

/** Bytes on disk for one model's required files (absent files count as zero). */
function modelBytes(root: string, name: string, dtype?: Record<string, string>): number {
	let total = 0;
	for (const file of modelFiles(dtype)) {
		try {
			total += statSync(resolve(root, name, file)).size;
		} catch {
			// absent — already reflected in the state
		}
	}
	return total;
}

/**
 * The I/O shell: read the transcriber catalog, ask the store about each entry.
 *
 * Fail-soft like every eager maintenance value (CONVENTIONS §1 — reported, never
 * swallowed): an unreadable catalog yields an empty model list and the store facts
 * we do have, never a broken dashboard. That case is precisely when the operator
 * needs the dashboard that would let them fix it.
 */
async function readAiModels(): Promise<AiModelsPanel> {
	const root = modelStoreRoot();
	const rows: AiModelRow[] = [];
	try {
		// getToolConfig returns the EFFECTIVE config — a flat map of key → resolved
		// value — so `transcriber_quality` IS the catalog array. The raw
		// property-object form is tolerated like everywhere else that reads it.
		const toolConfig = await getToolConfig('tool_transcription');
		const raw = toolConfig?.transcriber_quality;
		const entries = Array.isArray(raw)
			? raw
			: ((raw as { value?: unknown[] } | undefined)?.value ?? []);
		for (const rawEntry of entries) {
			if (rawEntry === null || typeof rawEntry !== 'object') continue;
			const entry = rawEntry as {
				name?: unknown;
				label?: unknown;
				tier?: unknown;
				dtype?: Record<string, string>;
			};
			if (typeof entry.name !== 'string') continue;
			if (entry.tier !== undefined && entry.tier !== 'browser') continue;
			rows.push({
				name: entry.name,
				label: typeof entry.label === 'string' ? entry.label : entry.name,
				state: modelState(entry.name, entry.dtype).state,
				bytes: modelBytes(root, entry.name, entry.dtype),
			});
		}
	} catch (error) {
		console.error('[ai_models] could not read the transcriber catalog:', error);
	}

	return buildAiModelsPanel({
		storePath: root,
		storeAvailable: modelStoreAvailable(),
		hubAllowed: modelHubAllowed(),
		models: rows,
	});
}

export const widget: WidgetModule = {
	spec: {
		id: 'ai_models',
		category: 'system',
		label: { kind: 'literal', text: 'AI models' },
	},
	getValue: async () => ({ result: await readAiModels(), msg: 'OK', errors: [] }),
	eagerValue: () => readAiModels(),
};
