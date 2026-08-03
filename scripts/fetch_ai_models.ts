/**
 * SEED THE LOCAL AI MODEL STORE.
 *
 * Downloads the in-browser models (speech recognition, translation) into the
 * install's own store, so the browser never talks to a public model hub. This is
 * an OPERATOR action, run once per model on a machine that has internet — an
 * air-gapped archive seeds its store by copying the directory in with rsync
 * instead, which is exactly why the store is a plain folder of plain files.
 *
 * Usage:
 *   bun run scripts/fetch_ai_models.ts --list
 *   bun run scripts/fetch_ai_models.ts onnx-community/whisper-large-v3-turbo
 *   bun run scripts/fetch_ai_models.ts --all
 *   bun run scripts/fetch_ai_models.ts <model> --store /data/dedalo/ai_models
 *
 * The store location comes from DEDALO_AI_MODEL_STORE (default
 * <private>/ai_models) unless --store overrides it. Existing files are kept:
 * re-running is a cheap way to complete an interrupted download.
 *
 * A large speech model is ~1.5 GB. Nothing here runs at install time or at
 * request time; an install with an empty store simply has no local models, which
 * the tool reports plainly rather than silently reaching for the internet.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	COMMON_FILES,
	DIARIZATION_COMMON_FILES,
	downloadModel,
	OPTIONAL_FILES,
} from '../src/core/ai/model_fetch.ts';
import { modelFiles, modelStoreRoot } from '../src/core/ai/model_store.ts';

interface CatalogModel {
	id: string;
	label: string;
	note: string;
	/** Per-part quantisation from the catalog; absent = the repo's default files. */
	dtype?: Record<string, string>;
	/** 'diarization' downloads a different file set (no tokenizer, mandatory preprocessor). */
	kind?: 'asr' | 'diarization';
}

/**
 * THE catalog — read from the tool's own `register.json`, never restated here.
 * The picker in the browser and this seeder must offer the same models with the
 * same quantisation, and a second hardcoded list is how those two drift.
 */
function readCatalog(): CatalogModel[] {
	const registerPath = resolve(
		import.meta.dir,
		'..',
		'tools',
		'tool_transcription',
		'register.json',
	);
	const register = JSON.parse(readFileSync(registerPath, 'utf8')) as {
		misc?: Record<string, { value?: Record<string, { value?: unknown[] }> }[]>;
	};
	const configValue = register.misc?.dd1633?.[0]?.value as
		| Record<string, { value?: unknown }>
		| undefined;
	const entries = configValue?.transcriber_quality?.value;
	if (!Array.isArray(entries)) {
		throw new Error(
			'no transcriber_quality catalog found in tools/tool_transcription/register.json',
		);
	}
	// The speaker-detection models ride the same catalog listing: same store,
	// same downloader, their own file profile (kind: 'diarization'). Two
	// slots: segmentation (who speaks when) + the voice-fingerprint embedding
	// (same voice = same id across the whole recording).
	const diarizationModels: CatalogModel[] = [];
	for (const slot of ['diarization_model', 'diarization_embedding_model']) {
		const entry = configValue?.[slot]?.value as
			| {
					name?: string;
					label?: string;
					notes?: string;
					size_mb?: number;
					dtype?: Record<string, string>;
			  }
			| undefined;
		if (entry !== undefined && typeof entry.name === 'string') {
			diarizationModels.push({
				id: entry.name,
				label: entry.label ?? entry.name,
				note: `${entry.notes ?? ''}${entry.size_mb !== undefined ? ` (~${entry.size_mb} MB)` : ''}`.trim(),
				dtype: entry.dtype,
				kind: 'diarization',
			});
		}
	}
	return diarizationModels.concat(
		entries
			.filter(
				(entry): entry is { name: string; tier?: string } =>
					entry !== null &&
					typeof entry === 'object' &&
					typeof (entry as { name?: unknown }).name === 'string',
			)
			.filter((entry) => entry.tier === undefined || entry.tier === 'browser')
			.map((entry) => {
				const model = entry as {
					name: string;
					label?: string;
					notes?: string;
					size_mb?: number;
					dtype?: Record<string, string>;
				};
				return {
					id: model.name,
					label: model.label ?? model.name,
					note: `${model.notes ?? ''}${model.size_mb !== undefined ? ` (~${model.size_mb} MB)` : ''}`.trim(),
					dtype: model.dtype,
				};
			}),
	);
}

/**
 * The exact file list one catalog entry needs in the store.
 *
 * Derived from the ENGINE's own helper, so what this script downloads and what
 * the engine reports as "installed" can never disagree — the failure mode that
 * bug produces is a store that looks full while every transcription 404s.
 */
function filesFor(model: CatalogModel): string[] {
	const common = model.kind === 'diarization' ? DIARIZATION_COMMON_FILES : COMMON_FILES;
	return [...common, ...modelFiles(model.dtype).filter((file) => file !== 'config.json')];
}

function usage(): void {
	console.log(`Seed the local AI model store.

  bun run scripts/fetch_ai_models.ts --list
  bun run scripts/fetch_ai_models.ts <model-id> [--store <dir>]
  bun run scripts/fetch_ai_models.ts --all [--store <dir>]
`);
}

function listCatalog(): void {
	const store = modelStoreRoot();
	console.log(`store: ${store}${existsSync(store) ? '' : '  (does not exist yet)'}\n`);
	for (const model of readCatalog()) {
		// Present means USABLE: every file the catalog's dtype asks for is there.
		const optional = model.kind === 'diarization' ? [] : OPTIONAL_FILES;
		const present = filesFor(model).every(
			(file) =>
				optional.includes(file) ||
				(existsSync(join(store, model.id, file)) && statSync(join(store, model.id, file)).size > 0),
		);
		console.log(`  ${present ? '✓' : ' '} ${model.id}\n      ${model.label} — ${model.note}`);
	}
	console.log('\n✓ = ready to use (all files the catalog asks for are present)');
}

async function fetchModel(modelId: string, store: string): Promise<void> {
	console.log(`\n${modelId} → ${join(store, modelId)}`);

	const catalog = readCatalog();
	const model = catalog.find((entry) => entry.id === modelId) ?? {
		id: modelId,
		label: modelId,
		note: '',
	};
	if (catalog.find((entry) => entry.id === modelId) === undefined) {
		console.log('  (not in the catalog — fetching the default fp32 files)');
	}

	// The SAME downloader the admin UI action uses (src/core/ai/model_fetch.ts) —
	// two download paths would drift on the file list or the quantisation.
	const report = await downloadModel(model.id, model.dtype, {
		store,
		quiet: false,
		onFile: (file) => console.log(`  ↓ ${file}`),
		...(model.kind === 'diarization'
			? { commonFiles: DIARIZATION_COMMON_FILES, optionalFiles: [] as string[] }
			: {}),
	});
	for (const file of report.skipped) console.log(`  - ${file} (not published for this model)`);
	if (!report.ok) {
		throw new Error(report.errors.join('\n'));
	}
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
	usage();
	process.exit(0);
}

const storeFlag = args.indexOf('--store');
const store = storeFlag !== -1 ? (args[storeFlag + 1] ?? modelStoreRoot()) : modelStoreRoot();
const requested = args.filter((arg, index) => {
	if (arg.startsWith('--')) return false;
	if (storeFlag !== -1 && index === storeFlag + 1) return false;
	return true;
});

if (args.includes('--list')) {
	listCatalog();
	process.exit(0);
}

const models = args.includes('--all') ? readCatalog().map((model) => model.id) : requested;
if (models.length === 0) {
	usage();
	process.exit(1);
}

for (const modelId of models) {
	await fetchModel(modelId, store);
}
console.log(`\nDone. Store: ${store}`);
