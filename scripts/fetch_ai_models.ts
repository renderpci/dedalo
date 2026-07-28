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

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { modelStoreRoot } from '../src/core/ai/model_store.ts';

/** Where model files are fetched from when an operator asks for a download. */
const HUB_BASE = 'https://huggingface.co';

/** Files every model needs regardless of quantisation. */
const COMMON_FILES: readonly string[] = [
	'config.json',
	'generation_config.json',
	'preprocessor_config.json',
	'tokenizer.json',
	'tokenizer_config.json',
];

/** Files a model may legitimately lack (not every repo ships every one). */
const OPTIONAL_FILES: readonly string[] = ['generation_config.json', 'preprocessor_config.json'];

/**
 * Transformers.js quantisation → ONNX filename suffix. This mapping is why the
 * seeder reads the catalog instead of guessing: the browser asks for exactly the
 * variant the catalog's `dtype` names, and seeding any other one leaves the store
 * looking full while every transcription 404s.
 */
const DTYPE_SUFFIX: Readonly<Record<string, string>> = {
	fp32: '',
	fp16: '_fp16',
	q4: '_q4',
	q4f16: '_q4f16',
	q8: '_quantized',
	int8: '_int8',
	uint8: '_uint8',
	bnb4: '_bnb4',
};

interface CatalogModel {
	id: string;
	label: string;
	note: string;
	/** Per-part quantisation from the catalog; absent = the repo's default files. */
	dtype?: Record<string, string>;
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
	const entries = register.misc?.dd1633?.[0]?.value?.transcriber_quality?.value;
	if (!Array.isArray(entries)) {
		throw new Error(
			'no transcriber_quality catalog found in tools/tool_transcription/register.json',
		);
	}
	return entries
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
		});
}

/** The exact file list one catalog entry needs in the store. */
function filesFor(model: CatalogModel): string[] {
	const files = [...COMMON_FILES];
	const dtype = model.dtype ?? { encoder_model: 'fp32', decoder_model_merged: 'fp32' };
	for (const [part, quant] of Object.entries(dtype)) {
		const suffix = DTYPE_SUFFIX[quant];
		if (suffix === undefined) {
			throw new Error(`${model.id}: unknown dtype '${quant}' for ${part}`);
		}
		files.push(`onnx/${part}${suffix}.onnx`);
	}
	return files;
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
		const present = filesFor(model).every(
			(file) =>
				OPTIONAL_FILES.includes(file) ||
				(existsSync(join(store, model.id, file)) && statSync(join(store, model.id, file)).size > 0),
		);
		console.log(`  ${present ? '✓' : ' '} ${model.id}\n      ${model.label} — ${model.note}`);
	}
	console.log('\n✓ = ready to use (all files the catalog asks for are present)');
}

/**
 * Download one file unless it is already there. Returns false when it is absent
 * upstream (an optional file this model does not publish).
 *
 * Uses `curl` rather than fetch(): these are multi-hundred-megabyte files behind
 * a CDN redirect, and curl gives resume, retry and a progress bar for free —
 * where Bun's fetch was observed to stall outright on the hub. Falls back to
 * fetch when curl is absent, so the script still works on a box without it.
 */
async function fetchFile(modelId: string, file: string, store: string): Promise<boolean> {
	const target = join(store, modelId, file);
	if (existsSync(target) && statSync(target).size > 0) {
		console.log(`  = ${file} (already present)`);
		return true;
	}

	const url = `${HUB_BASE}/${modelId}/resolve/main/${file}`;
	mkdirSync(dirname(target), { recursive: true });

	if (haveCurl()) {
		console.log(`  ↓ ${file}`);
		// -f: a 404 is a failure, not an HTML page written to disk.
		// -L: follow the CDN redirect. -C -: resume a partial file.
		const proc = Bun.spawnSync(
			['curl', '-fL', '-C', '-', '--retry', '3', '--progress-bar', '-o', target, url],
			{ stdout: 'inherit', stderr: 'inherit' },
		);
		if (!proc.success) {
			// curl leaves a zero-length file behind on a 404; do not let it look cached.
			if (existsSync(target) && statSync(target).size === 0) rmSync(target);
			if (OPTIONAL_FILES.includes(file)) {
				console.log(`  - ${file} (not published for this model)`);
				return false;
			}
			throw new Error(`${file}: download failed from ${url}`);
		}
		console.log(`  + ${file} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
		return true;
	}

	const response = await fetch(url);
	if (!response.ok) {
		if (OPTIONAL_FILES.includes(file)) {
			console.log(`  - ${file} (not published for this model)`);
			return false;
		}
		throw new Error(`${file}: HTTP ${response.status} from ${url}`);
	}
	await Bun.write(target, response);
	console.log(`  + ${file} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
	return true;
}

/** Whether curl is on PATH (checked once). */
let curlChecked: boolean | null = null;
function haveCurl(): boolean {
	if (curlChecked === null) {
		curlChecked = Bun.spawnSync(['curl', '--version'], {
			stdout: 'ignore',
			stderr: 'ignore',
		}).success;
	}
	return curlChecked;
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

	let gotWeights = false;
	for (const file of filesFor(model)) {
		const ok = await fetchFile(modelId, file, store);
		if (ok && file.endsWith('.onnx')) gotWeights = true;
	}

	// A model with no weights is a FAILED seed, not a quiet success: the browser
	// would then fail at transcription time, which is the surprise this store
	// exists to prevent.
	if (!gotWeights) {
		throw new Error(
			`${modelId}: no ONNX weights were found upstream. Check the model id and the catalog dtype, or copy the model directory in by hand.`,
		);
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

mkdirSync(store, { recursive: true });
for (const modelId of models) {
	await fetchModel(modelId, store);
}
console.log(`\nDone. Store: ${store}`);
