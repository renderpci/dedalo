/**
 * MODEL DOWNLOADER — pull one model's files from the public hub into the local
 * store. The ONE implementation behind both doors:
 *
 *   - `scripts/fetch_ai_models.ts` (the operator CLI, with a progress bar);
 *   - the tool's admin-gated `download_model` action (quiet, in a background job),
 *     which is how an administrator seeds a model from the browser without shell
 *     access to the server.
 *
 * Downloading is an OPERATOR/ADMIN act, distinct from `DEDALO_AI_MODEL_ALLOW_HUB`:
 * that flag governs whether the BROWSER may stream weights from the hub at
 * inference time (a per-recording privacy leak); this module runs on the server,
 * once per model, on an explicit request. An air-gapped install simply gets a
 * clean failure here and seeds the store by rsync instead.
 *
 * Transport is `curl` (resume, retry, and — observed on this project's own dev
 * box — Bun's fetch stalling outright against the hub's CDN redirect), with a
 * fetch fallback for hosts without curl. Files land only under the store root,
 * and only for model ids the CALLER has already validated against the catalog —
 * this module never invents a URL from user input on its own.
 */

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** A model id / file segment: word chars, dot, slash, hyphen — and NEVER `..`. */
const SAFE_MODEL_SEGMENT = /^[A-Za-z0-9._/-]+$/;
function isSafeModelSegment(value: string): boolean {
	return value !== '' && SAFE_MODEL_SEGMENT.test(value) && !value.split('/').includes('..');
}

import { modelFiles, modelStoreRoot } from './model_store.ts';

/** Where model files are fetched from when a download is requested. */
export const HUB_BASE = 'https://huggingface.co';

/** Files every model needs regardless of quantisation (modelFiles adds the weights). */
export const COMMON_FILES: readonly string[] = [
	'generation_config.json',
	'preprocessor_config.json',
	'tokenizer.json',
	'tokenizer_config.json',
];

/** Files a model may legitimately lack (not every repo publishes every one). */
export const OPTIONAL_FILES: readonly string[] = [
	'generation_config.json',
	'preprocessor_config.json',
];

/**
 * The common files of a DIARIZATION model (pyannote segmentation): no
 * tokenizer, no generation config — but the preprocessor config is REQUIRED
 * (AutoProcessor cannot build without it), so unlike the ASR list nothing
 * here is optional. Callers pass these via DownloadOptions when the catalog
 * entry declares `kind: 'diarization'`.
 */
export const DIARIZATION_COMMON_FILES: readonly string[] = ['preprocessor_config.json'];

export interface DownloadOptions {
	/** Target store root; defaults to the configured one. */
	store?: string;
	/** true = no terminal progress (the server path); false = curl's progress bar (the CLI). */
	quiet?: boolean;
	/** Called before each file starts (for logging/progress). */
	onFile?: (file: string) => void;
	/** Per-model-kind file lists: the non-weight files to fetch (default
	 * COMMON_FILES, the ASR set) and which of the wanted files may 404 without
	 * failing the seed (default OPTIONAL_FILES). A diarization model passes
	 * DIARIZATION_COMMON_FILES and an empty optional list. */
	commonFiles?: readonly string[];
	optionalFiles?: readonly string[];
}

export interface DownloadReport {
	ok: boolean;
	/** Files now present (downloaded or already there). */
	files: string[];
	/** Optional files the model does not publish (informational). */
	skipped: string[];
	errors: string[];
}

/** Whether curl is on PATH (checked once per process). */
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

/**
 * Download one file into the store unless it is already there, non-empty.
 * Returns false when the file is absent upstream (the caller decides whether
 * that is fatal — it is not for OPTIONAL_FILES).
 */
async function fetchOneFile(
	modelId: string,
	file: string,
	store: string,
	quiet: boolean,
): Promise<boolean> {
	// MODEL-01 (2026-07-28 audit): modelId/file flow into BOTH the hub URL and the
	// on-disk path (join(store, modelId, file)). Reject traversal / URL-breaking
	// segments so a crafted id cannot write outside the store or rewrite the fetch
	// target, and confirm the resolved path stays under the store. (HUB_BASE is a
	// pinned https:// constant. A full content checksum needs a per-file hash
	// manifest, which the hub does not ship here — tracked separately.)
	if (!isSafeModelSegment(modelId) || !isSafeModelSegment(file)) return false;
	const target = join(store, modelId, file);
	const storeRoot = resolve(store);
	if (!resolve(target).startsWith(storeRoot + sep)) return false;
	if (existsSync(target) && statSync(target).size > 0) return true;

	const url = `${HUB_BASE}/${modelId}/resolve/main/${file}`;
	mkdirSync(dirname(target), { recursive: true });

	if (haveCurl()) {
		// -f: a 404 is a failure, not an HTML error page written to disk.
		// -L: follow the CDN redirect. -C -: resume a partial file.
		const argv = [
			'curl',
			'-fL',
			'-C',
			'-',
			'--retry',
			'3',
			quiet ? '-sS' : '--progress-bar',
			'-o',
			target,
			url,
		];
		// Async spawn: a server background job must never block the event loop on
		// a gigabyte download (spawnSync would freeze every request in the process).
		const proc = Bun.spawn(argv, {
			stdout: quiet ? 'ignore' : 'inherit',
			stderr: quiet ? 'ignore' : 'inherit',
		});
		const code = await proc.exited;
		if (code !== 0) {
			// curl leaves a zero-length file behind on a 404; it must not look cached.
			if (existsSync(target) && statSync(target).size === 0) rmSync(target);
			return false;
		}
		return true;
	}

	const response = await fetch(url);
	if (!response.ok) return false;
	await Bun.write(target, response);
	return statSync(target).size > 0;
}

/**
 * Download everything one catalog entry needs: the common files plus the ONNX
 * weights for the quantisation the catalog declares (`dtype` — absent means the
 * repo's plain fp32 files). Idempotent: present files are kept, so re-running
 * completes an interrupted download.
 */
export async function downloadModel(
	modelId: string,
	dtype: Record<string, string> | undefined,
	options: DownloadOptions = {},
): Promise<DownloadReport> {
	const store = options.store ?? modelStoreRoot();
	const quiet = options.quiet ?? true;
	const report: DownloadReport = { ok: false, files: [], skipped: [], errors: [] };

	mkdirSync(store, { recursive: true });

	// modelFiles carries config.json + the weights; union in the common files.
	const wanted = [...new Set([...(options.commonFiles ?? COMMON_FILES), ...modelFiles(dtype)])];
	const optional = options.optionalFiles ?? OPTIONAL_FILES;

	let gotWeights = false;
	for (const file of wanted) {
		options.onFile?.(file);
		const ok = await fetchOneFile(modelId, file, store, quiet);
		if (ok) {
			report.files.push(file);
			if (file.endsWith('.onnx')) gotWeights = true;
			continue;
		}
		if (optional.includes(file)) {
			report.skipped.push(file);
			continue;
		}
		report.errors.push(`${file}: download failed from ${HUB_BASE}/${modelId}`);
	}

	// A model with no weights is a FAILED seed, never a quiet success: the browser
	// would then fail at transcription time, the surprise the store exists to prevent.
	if (!gotWeights) {
		report.errors.push(`${modelId}: no ONNX weights were obtained`);
	}

	report.ok = report.errors.length === 0;
	return report;
}
