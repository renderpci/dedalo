/**
 * ai_models widget — the local AI model store, for an administrator.
 *
 * In-browser transcription only works if the model is in THIS install's store, and
 * until now nothing in the interface said whether it was. A model whose download
 * was killed mid-file reported itself installed and failed inside the browser's
 * ONNX runtime minutes later; the administrator's only diagnostic was a console
 * line in someone else's browser.
 *
 * EVERYTHING THE TOOL ANSWERS FOR, this widget answers for too. It used to read
 * only the ASR quality catalog, so the dashboard could say "2 of 2 usable" in
 * green while the transcription tool showed a damaged speaker-segmentation model:
 * two humans, two truths, one install. Both now read the SAME catalog module
 * (`src/core/ai/model_catalog.ts`), and speaker detection is its own row group
 * whose worst half counts against the headline.
 *
 * DISPLAY-ONLY, deliberately: the download / verify / repair executes live in the
 * transcription tool's own server module, admin-gated there. This widget shows the
 * truth (per model: state, bytes on disk) and points the operator at that tool,
 * rather than growing a second copy of the download machinery — and a second gate
 * to keep right. So: no `apiActions`, nothing new reachable from the wire.
 *
 * No network I/O: every fact here is read from the install's own disk and config.
 */

import { type CatalogModel, readTranscriberCatalog } from '../../ai/model_catalog.ts';
import {
	type ModelState,
	modelHubAllowed,
	modelState,
	modelStoreAvailable,
	modelStoreRoot,
} from '../../ai/model_store.ts';
import type { WidgetModule } from './support.ts';

export interface AiModelRow {
	name: string;
	label: string;
	state: ModelState;
	bytes: number;
	/** Only on the speaker pair: which half this is. */
	role?: string;
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
	/**
	 * FALSE when the tool catalog could not be read. An empty `models` then means
	 * "not known", never "none declared" — the client must not print a verdict it
	 * does not have (an archivist acts on what this says).
	 */
	catalog_readable: boolean;
	models: AiModelRow[];
	/** The speaker-detection pair (segmentation + voice fingerprint), own group. */
	speakers: AiModelRow[];
	usable_count: number;
	total_bytes: number;
};

/** A state the browser may attempt — the ONE rule, shared with the tool. */
function isUsable(state: ModelState): boolean {
	return state === 'ready' || state === 'unverified';
}

/** The panel shape, from already-read facts. Pure: the gate drives it directly. */
export function buildAiModelsPanel(input: {
	storePath: string;
	storeAvailable: boolean;
	hubAllowed: boolean;
	catalogReadable?: boolean;
	models: AiModelRow[];
	speakers?: AiModelRow[];
}): AiModelsPanel {
	const models = input.storeAvailable ? input.models : [];
	const speakers = input.storeAvailable ? (input.speakers ?? []) : [];
	// ONE population for the headline. The speaker pair is a separate ROW GROUP,
	// not a separate truth: a damaged segmentation model must not leave "2 of 2
	// usable" standing in green, which is exactly the disagreement between this
	// dashboard and the transcription tool that this widget existed to prevent.
	const all = [...models, ...speakers];
	return {
		store_path: input.storePath,
		store_available: input.storeAvailable,
		hub_allowed: input.hubAllowed,
		catalog_readable: input.catalogReadable ?? true,
		models,
		speakers,
		// "Usable" is what the browser may attempt: ready, or present-but-unverified
		// (the normal state of every store seeded before the manifest existed). It is
		// the same meaning tool_transcription's `installed` list carries, so the
		// dashboard count and the tool's model picker cannot disagree.
		usable_count: all.filter((model) => isUsable(model.state)).length,
		total_bytes: all.reduce((sum, model) => sum + model.bytes, 0),
	};
}

/**
 * One catalog entry → one panel row.
 *
 * EXPORTED for its gate: the size and the state answering for the same files is
 * the whole point, and a pure panel builder cannot see it.
 *
 * The size and the state answer for THE SAME FILES. They used to disagree: the
 * bytes were summed over the fp32 placeholder names while the state read the
 * real ones off disk, so a healthy quantised install showed "Installed, not
 * verified" beside a size of "—" and undercounted the store total.
 */
export function toModelRow(entry: CatalogModel): AiModelRow {
	const report = modelState(entry.name, entry.dtype, entry.kind);
	return {
		name: entry.name,
		label: entry.label ?? entry.name,
		state: report.state,
		bytes: report.files.reduce((sum, file) => sum + file.size, 0),
		role: entry.role,
	};
}

/**
 * The I/O shell: read the transcriber catalog, ask the store about each entry.
 *
 * Fail-soft like every eager maintenance value (CONVENTIONS §1 — reported, never
 * swallowed), but never fail-QUIET: an unreadable catalog sets
 * `catalog_readable:false` so the panel says it cannot tell, instead of drawing
 * the same empty list a genuinely model-less install draws. That case is
 * precisely when the operator needs the dashboard that would let them fix it.
 */
async function readAiModels(): Promise<AiModelsPanel> {
	const catalog = await readTranscriberCatalog();
	return buildAiModelsPanel({
		storePath: modelStoreRoot(),
		storeAvailable: modelStoreAvailable(),
		hubAllowed: modelHubAllowed(),
		catalogReadable: catalog.readable,
		models: catalog.asr.map(toModelRow),
		speakers: catalog.diarization.map(toModelRow),
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
