/**
 * MODEL COMPLETION MANIFEST — the record of what actually finished downloading.
 *
 * The store's original test for "is this file usable" was `size > 0`. A download
 * interrupted mid-file passes that test, and because the transport resumes with
 * `curl -C -` only for files it decides are incomplete, the partial was never
 * completed: the seed reported success, `modelInstalled()` reported installed, and
 * the browser failed minutes later inside onnxruntime with
 * "ERROR_CODE: 7 … protobuf parsing failed" — a message that names neither the
 * model nor the remedy.
 *
 * Two writers, two honest claims — never conflate them:
 *   - the DOWNLOADER (`recordFileComplete` from `model_fetch.ts`) records what
 *     actually arrived: "this many bytes landed on disk just now";
 *   - `verify_model` (`tools/tool_transcription/server/index.ts`) records what
 *     the hub SAYS should be there for a file already present with no manifest
 *     entry: "this many bytes are expected" — so a later size mismatch against
 *     an unrelated local truncation is still detected as `incomplete`.
 * Either way, absence is not a failure: a store seeded before this existed
 * simply reports `unverified` (see model_store.ts modelState) rather than being
 * declared broken.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** The per-model manifest file, inside the model's own directory. */
export const MANIFEST_FILE = '.dedalo_model.json';

export interface ModelManifest {
	files: Record<string, { size: number }>;
}

/** Same segment law as model_fetch.resolveFetchTarget: no traversal, no URL breakers. */
const SAFE_SEGMENT = /^[A-Za-z0-9._/-]+$/;
function isSafe(value: string): boolean {
	return value !== '' && SAFE_SEGMENT.test(value) && !value.split('/').includes('..');
}

/** The manifest path, or null when the id would escape the store. */
function manifestPath(store: string, modelId: string): string | null {
	if (!isSafe(modelId)) return null;
	const path = join(store, modelId, MANIFEST_FILE);
	if (!resolve(path).startsWith(resolve(store) + sep)) return null;
	return path;
}

/**
 * The model's manifest. A missing, unreadable or malformed file reads as EMPTY:
 * the manifest is evidence of completion, so no evidence means no claim — never
 * an exception on a path that runs during every readiness check.
 */
export function readManifest(store: string, modelId: string): ModelManifest {
	const path = manifestPath(store, modelId);
	if (path === null || !existsSync(path)) return { files: {} };
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		const files = (parsed as ModelManifest | null)?.files;
		if (files === null || typeof files !== 'object') return { files: {} };
		return { files: files as ModelManifest['files'] };
	} catch {
		return { files: {} };
	}
}

/** The recorded byte size of one file, or null when it was never recorded. */
export function expectedSize(store: string, modelId: string, file: string): number | null {
	if (!isSafe(file)) return null;
	const entry = readManifest(store, modelId).files[file];
	return typeof entry?.size === 'number' ? entry.size : null;
}

/**
 * Record that one file completed at `size` bytes. Read-modify-write: a model's
 * files are fetched sequentially by downloadModel, so there is no concurrent
 * writer to lose.
 */
export function recordFileComplete(
	store: string,
	modelId: string,
	file: string,
	size: number,
): void {
	const path = manifestPath(store, modelId);
	if (path === null || !isSafe(file)) return;
	const manifest = readManifest(store, modelId);
	manifest.files[file] = { size };
	try {
		writeFileSync(path, JSON.stringify(manifest, null, '\t'));
	} catch (error) {
		// A store on read-only media still serves models; losing the manifest costs
		// verification, not service. Never silent (CONVENTIONS §1).
		console.error(`[ai] could not write the model manifest for '${modelId}':`, error);
	}
}

/**
 * Drop the claim about one file — used when a repair deletes it.
 *
 * Deliberately NOT `recordFileComplete(…, 0)`: a manifest entry is a claim that
 * this many bytes arrived, and writing a false claim to mean "no claim" would make
 * every later reader reason from a lie. Absence already has the right meaning.
 */
export function forgetFile(store: string, modelId: string, file: string): void {
	const path = manifestPath(store, modelId);
	if (path === null || !isSafe(file)) return;
	const manifest = readManifest(store, modelId);
	if (manifest.files[file] === undefined) return;
	delete manifest.files[file];
	try {
		writeFileSync(path, JSON.stringify(manifest, null, '\t'));
	} catch (error) {
		console.error(`[ai] could not update the model manifest for '${modelId}':`, error);
	}
}
