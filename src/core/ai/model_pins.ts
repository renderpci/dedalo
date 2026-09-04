/**
 * MODEL PINS — the repo-owned answer to "which bytes ARE this model".
 *
 * `model_pins.json` beside this file records, per catalog model id, the hub's
 * IMMUTABLE revision (a 40-hex commit sha) and, per file the downloader can ask
 * for, the sha256 and byte size. It plays the role `vendor/vendor_manifest.json`
 * plays for vendored client code and the `.sha256` sidecar plays for a code
 * update: a downloaded artifact is fetched BY the pinned revision, hashed after
 * transport, and refused — quarantined — when the digest disagrees. A model with
 * no pin is refused before a byte (the hub's `main` is a mutable head, and
 * fetching whatever it points at today is exactly CARRY-06).
 *
 * Where the digests come from: `bun run scripts/pin_ai_models.ts --model <id>
 * --reason "<why>"` — the hub's model API answers the revision sha and, for
 * every LFS weight, `lfs.oid` (its sha256, no gigabyte download needed); the
 * small non-LFS files (config, tokenizer) carry only a git blob id, so the
 * script downloads them at the pinned revision and hashes the bytes. That is the
 * ONE documented way to change a digest, and every change carries `pinned_at`
 * and a `reason` (leg (g) of `model_artifact_integrity_native` refuses an
 * entry without them).
 *
 * UNPINNED models and files — policy, recorded here so the choice is visible:
 *   - An operator's OWN model (rsynced into the store, outside the catalog, or a
 *     file outside `wantedFiles()`) is still SERVABLE and reports `unverified`;
 *     the store was always a folder of files an institution owns.
 *   - An ENGINE-DRIVEN download of an unpinned model is refused: the engine
 *     will not fetch bytes it cannot verify.
 *   - A catalog model the hub does not serve (`unpinned` block, with a reason)
 *     is enumerated, shrink-only, by the gate — never a hand-invented digest.
 *
 * `PINS` is parsed once at module load and frozen — data, not state. The
 * `table` parameter on every reader is a TEST SEAM (a gate pins a fixture model
 * against a loopback hub); production callers never pass it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DedaloError } from '../errors/index.ts';
import { SHA256_HEX } from './model_integrity.ts';

/** The pin of one file: what its bytes must hash to, and how many there are. */
export interface FilePin {
	sha256: string;
	size: number;
}

/** The pin of one model: the immutable revision and every pinned file. */
export interface ModelPin {
	/** The hub's commit sha the files were pinned at (40 hex). */
	revision: string;
	/** ISO date the pin was taken or last changed. */
	pinned_at: string;
	/** Why this pin exists or changed — a sentence, never empty. */
	reason: string;
	files: Record<string, FilePin>;
}

export interface PinTable {
	models: Record<string, ModelPin>;
	/** Catalog models that COULD NOT be pinned, each with the reason. Shrink-only. */
	unpinned: Record<string, { reason: string }>;
}

/** The pin file's location — beside this module, inside the repo. */
export const MODEL_PINS_PATH = resolve(import.meta.dir, 'model_pins.json');

/** A 40-hex git commit sha — the only revision shape the fetch URL accepts. */
export const REVISION_HEX = /^[0-9a-f]{40}$/;

/**
 * Parse a pin table, dropping nothing silently: a malformed file THROWS, because
 * a pin table that reads as empty would make every download refuse with "no
 * pin" for a reason the operator could not see.
 */
export function parsePinTable(text: string): PinTable {
	const parsed = asObject(JSON.parse(text), 'model pins') as Partial<PinTable>;
	return {
		models: asObject(parsed.models ?? {}, 'model pins `models`') as PinTable['models'],
		unpinned: asObject(parsed.unpinned ?? {}, 'model pins `unpinned`') as PinTable['unpinned'],
	};
}

/** The value as a plain object, or the typed refusal that names what was expected. */
function asObject(value: unknown, what: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new DedaloError('ai.model_integrity', { message: `${what}: not an object` });
	}
	return value as Record<string, unknown>;
}

/** The repo's pin table, read once. */
const PINS: PinTable = Object.freeze(parsePinTable(readFileSync(MODEL_PINS_PATH, 'utf8')));

/** The whole table (the gate censuses it). */
export function readPinTable(): PinTable {
	return PINS;
}

/** The immutable revision a model is pinned at, or null when it has no pin. */
export function pinnedRevision(modelId: string, table: PinTable = PINS): string | null {
	const revision = table.models[modelId]?.revision;
	return typeof revision === 'string' && REVISION_HEX.test(revision) ? revision : null;
}

/**
 * The pin of one file of one model, or null when either is unpinned. A pin with
 * a malformed digest is treated as absent — a digest that cannot match is not a
 * pin, and treating it as one would refuse every download of that file with a
 * "mismatch" that names the wrong cause.
 */
export function pinFor(modelId: string, file: string, table: PinTable = PINS): FilePin | null {
	const pin = table.models[modelId]?.files[file];
	if (pin === undefined || !isWellFormedPin(pin)) return null;
	return { sha256: pin.sha256, size: pin.size };
}

/**
 * The pin a store-relative path (`org/name/onnx/model.onnx`, forward slashes)
 * names, at WHATEVER depth the model id sits and under WHATEVER letter-case the
 * path was requested with — or null. The exact name is tried first; then every
 * pinned `<id>/<file>` is compared CASE-FOLDED. The store lives on a filesystem
 * the engine does not choose, and on a case-insensitive one (macOS APFS, the
 * dev target) `xenova/whisper-small/CONFIG.json` resolves to the very bytes the
 * exact-case name pins — a serve door keyed on the requested spelling handed
 * them out UNVERIFIED (review of P1-25, 2026-09-04). Judging a case-variant by
 * the pin its bytes would alias is correct on both kinds of filesystem: on a
 * case-sensitive one the variant either does not exist (404 before this) or is
 * a different file planted under a catalog id, which the catalog pin may refuse.
 * The returned names are the PIN'S spelling.
 */
export function pinForPath(relPath: string, table: PinTable = PINS): PinMatch | null {
	return pinForExactPath(relPath, table) ?? pinForFoldedPath(relPath, table);
}

/** The pin a request resolved to, in the PIN'S spelling. */
export interface PinMatch {
	modelId: string;
	file: string;
	pin: FilePin;
}

/** Pass 1 of pinForPath: the exact name, at every `<model id>/<file>` split. */
function pinForExactPath(relPath: string, table: PinTable): PinMatch | null {
	const segments = relPath.split('/');
	for (let split = segments.length - 1; split >= 1; split--) {
		const modelId = segments.slice(0, split).join('/');
		const file = segments.slice(split).join('/');
		const pin = pinFor(modelId, file, table);
		if (pin !== null) return { modelId, file, pin };
	}
	return null;
}

/** Pass 2 of pinForPath: every pinned name compared CASE-FOLDED (see header). */
function pinForFoldedPath(relPath: string, table: PinTable): PinMatch | null {
	const folded = relPath.toLowerCase();
	for (const [modelId, model] of Object.entries(table.models)) {
		for (const file of Object.keys(model.files)) {
			if (`${modelId}/${file}`.toLowerCase() !== folded) continue;
			const pin = pinFor(modelId, file, table);
			if (pin !== null) return { modelId, file, pin };
		}
	}
	return null;
}

/** A 64-hex digest and a non-negative integer size — anything else is not a pin. */
function isWellFormedPin(pin: Partial<FilePin>): pin is FilePin {
	if (typeof pin.sha256 !== 'string' || !SHA256_HEX.test(pin.sha256)) return false;
	return typeof pin.size === 'number' && Number.isInteger(pin.size) && pin.size >= 0;
}
