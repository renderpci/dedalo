/**
 * THE LOCAL AI MODEL STORE — where in-browser models come from when the archive
 * is not allowed to talk to a model hub.
 *
 * WHY THIS EXISTS. The transcription tool runs speech recognition INSIDE the
 * browser precisely because interview recordings hold personal data that must not
 * be uploaded anywhere. That promise was only half kept: the runtime came from a
 * CDN and the model weights streamed from the Hugging Face hub at inference time,
 * so a machine with no outbound internet could not transcribe at all, and a
 * machine with it announced to a third party exactly when a record was worked on.
 *
 * The runtime now comes from the client-lib registry; the WEIGHTS come from here:
 * a directory of model folders on the install's own disk, served read-only at
 * `/dedalo/ai_models/<model>/<file>`. An air-gapped institution seeds it by rsync
 * (or `bun run scripts/fetch_ai_models.ts` where there is a network) and never
 * needs the hub again.
 *
 * WHY NOT THE REPO. A single Whisper large-v3 is ~1.5 GB. It is data, not code,
 * it is not diffable, and this repo already carries scars from large files in its
 * history. The store therefore lives OUTSIDE the checkout (default: a sibling
 * `private/ai_models/`, relocatable with DEDALO_AI_MODEL_STORE), exactly like the
 * media root.
 *
 * SECURITY. Same fail-closed shape as the client-lib route: an allowlist of
 * extensions, canonical-realpath confinement to the store root, and a plain 404
 * for everything else (never an existence leak). Nothing here is writable over
 * HTTP — seeding is an operator action, not an engine action.
 */

import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readSync,
	realpathSync,
	statSync,
} from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { staticAssetResponse } from '../api/static_asset.ts';
import { expectedSize } from './model_manifest.ts';

/** URL prefix the store is served at. */
export const AI_MODEL_URL_PREFIX = '/dedalo/ai_models/';

/**
 * Servable extensions. Deliberately short: an ONNX model folder is weights, the
 * tokenizer/config JSON beside them, and occasionally a `.bin`/`.data` external
 * weights blob. Anything else in the directory (a README, a licence, a stray
 * script) is not part of what the browser needs and is not served.
 */
const SERVABLE_EXTENSIONS: ReadonlySet<string> = new Set([
	'.onnx',
	'.onnx_data',
	'.json',
	'.bin',
	'.data',
	'.txt',
	'.model',
	'.wasm',
]);

/**
 * Transformers.js quantisation → ONNX filename suffix.
 *
 * THE single copy: the seeding script downloads by it and the "is this model
 * installed" check below reads by it, so a store can never look full while the
 * browser asks for a file that was never fetched.
 */
export const DTYPE_SUFFIX: Readonly<Record<string, string>> = {
	fp32: '',
	fp16: '_fp16',
	q4: '_q4',
	q4f16: '_q4f16',
	q8: '_quantized',
	int8: '_int8',
	uint8: '_uint8',
	bnb4: '_bnb4',
};

/** The config every model needs before anything else can load. */
const REQUIRED_CONFIG = 'config.json';

/**
 * The exact files one catalog entry needs in the store to be USABLE — its config
 * plus the ONNX weights for the quantisation the catalog declares. A model whose
 * config is present but whose weights are the wrong variant is NOT installed, and
 * saying so here is what stops the browser failing later with "Could not locate
 * file" from inside the ONNX runtime.
 */
export function modelFiles(dtype?: Record<string, string>): string[] {
	const parts = dtype ?? { encoder_model: 'fp32', decoder_model_merged: 'fp32' };
	const files = [REQUIRED_CONFIG];
	for (const [part, quant] of Object.entries(parts)) {
		const suffix = DTYPE_SUFFIX[quant];
		if (suffix === undefined) continue; // an unknown dtype is a catalog bug, not a missing file
		files.push(`onnx/${part}${suffix}.onnx`);
	}
	return files;
}

/**
 * True when the browser can actually LOAD this model from the store.
 *
 * With a `dtype` (the catalog's declaration) the check is exact: those files, or
 * not installed. WITHOUT one — an older registered catalog that predates the
 * per-model quantisation, which is what a live install has until the tools
 * registry is re-imported — an exact check would be a guess, and guessing fp32
 * would report every store empty. So the fallback asks the weaker but true
 * question: is there a config and at least one encoder AND one decoder variant?
 */
export function modelInstalled(modelId: string, dtype?: Record<string, string>): boolean {
	const root = modelStoreRoot();
	const present = (file: string): boolean => {
		const path = resolve(root, modelId, file);
		try {
			return existsSync(path) && statSync(path).size > 0;
		} catch {
			return false;
		}
	};

	if (dtype !== undefined) return modelFiles(dtype).every(present);

	if (!present(REQUIRED_CONFIG)) return false;
	let weights: string[];
	try {
		weights = readdirSync(resolve(root, modelId, 'onnx'));
	} catch {
		return false;
	}
	const has = (prefix: string): boolean =>
		weights.some((file) => file.startsWith(prefix) && file.endsWith('.onnx'));
	return has('encoder_model') && has('decoder_model_merged');
}

/**
 * What the store can honestly say about one model.
 *
 * `unverified` is not a hedge, it is the truth about a store seeded before the
 * completion manifest existed: TRUNCATION CANNOT BE SEEN IN THE BYTES. A header
 * probe catches a file that is the wrong KIND of thing (an HTML error page saved
 * as weights); only a comparison against a known expected length catches a file
 * that is the right kind and half as long. This function performs no network I/O,
 * so where there is no manifest there is no verdict to give — the `verify_model`
 * action is what resolves it.
 */
export type ModelState = 'ready' | 'unverified' | 'incomplete' | 'damaged' | 'missing';

export interface ModelFileEvidence {
	file: string;
	present: boolean;
	size: number;
	/** The manifest's recorded length, or null when never recorded. */
	expected: number | null;
}

export interface ModelStateReport {
	state: ModelState;
	files: ModelFileEvidence[];
}

/**
 * The leading bytes of a file that claims to be ONNX or JSON.
 *
 * An ONNX file is a protobuf ModelProto: its first field is `ir_version`
 * (field 1, varint) so the first byte is 0x08 in every model the hub publishes.
 * A JSON config starts with '{'. Anything else — most usefully '<' — is a
 * transport artefact written to disk under a model file's name.
 */
function headerPlausible(path: string, file: string): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, 'r');
		const head = Buffer.alloc(1);
		if (readSync(fd, head, 0, 1, 0) < 1) return false;
		return file.endsWith('.json') ? head[0] === 0x7b : head[0] === 0x08;
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

export function modelState(modelId: string, dtype?: Record<string, string>): ModelStateReport {
	const root = modelStoreRoot();
	const wanted = modelFiles(dtype);

	const files: ModelFileEvidence[] = wanted.map((file) => {
		const path = resolve(root, modelId, file);
		let size = 0;
		let present = false;
		try {
			present = existsSync(path);
			size = present ? statSync(path).size : 0;
		} catch {
			present = false;
		}
		return { file, present, size, expected: expectedSize(root, modelId, file) };
	});

	if (files.every((entry) => !entry.present || entry.size === 0)) {
		return { state: 'missing', files };
	}
	if (files.some((entry) => !entry.present || entry.size === 0)) {
		return { state: 'incomplete', files };
	}
	// Wrong KIND of content beats wrong LENGTH: an HTML error page is a damaged
	// install whatever the manifest claims, and it names a different remedy.
	if (files.some((entry) => !headerPlausible(resolve(root, modelId, entry.file), entry.file))) {
		return { state: 'damaged', files };
	}
	if (files.some((entry) => entry.expected !== null && entry.expected !== entry.size)) {
		return { state: 'incomplete', files };
	}
	if (files.every((entry) => entry.expected !== null)) {
		return { state: 'ready', files };
	}
	return { state: 'unverified', files };
}

/**
 * The store root. `DEDALO_AI_MODEL_STORE` when set (absolute, or relative to the
 * private dir), else `<private>/ai_models`.
 *
 * Read per call rather than memoized: the tests relocate it, and the cost is one
 * env lookup against a request that is about to move megabytes.
 */
export function modelStoreRoot(): string {
	const configured = (readString('DEDALO_AI_MODEL_STORE') ?? '').trim();
	if (configured === '') return resolve(privateDir, 'ai_models');
	return resolve(privateDir, configured);
}

/** True when the store directory exists — the honest answer to "can we run locally". */
export function modelStoreAvailable(): boolean {
	const root = modelStoreRoot();
	try {
		return existsSync(root) && statSync(root).isDirectory();
	} catch {
		return false;
	}
}

/**
 * True when the engine may fall back to a public model hub. Default FALSE: the
 * privacy promise is the default, and an install that wants the convenience of
 * on-demand downloads has to say so.
 */
export function modelHubAllowed(): boolean {
	return (readString('DEDALO_AI_MODEL_ALLOW_HUB') ?? '').trim() === 'true';
}

/**
 * Resolve `/dedalo/ai_models/<subpath>` to a confined absolute path, or null to
 * 404. Exported so a gate can assert the mapping without standing a server up.
 */
export function resolveModelPath(subPath: string): string | null {
	const root = modelStoreRoot();
	if (!existsSync(root)) return null;

	// Confine on the CANONICAL root: the store is very likely a symlink to a data
	// volume, so compare realpaths, never the raw strings.
	let canonicalRoot: string;
	try {
		canonicalRoot = realpathSync(root);
	} catch {
		return null;
	}

	const fullPath = resolve(canonicalRoot, subPath);
	if (fullPath !== canonicalRoot && !fullPath.startsWith(canonicalRoot + sep)) {
		return null; // traversal attempt
	}
	if (!SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) return null;
	if (!existsSync(fullPath)) return null;
	// MODEL-02 (2026-07-28 audit): the string check above only confines resolve()'s
	// path — a SYMLINK LEAF inside the store still reads its target. Realpath the
	// final file and RE-CONFINE, so a symlink pointing OUT of the store (planted
	// by whoever seeded it, or a crafted rsync) cannot exfiltrate an arbitrary
	// file through this anonymous route.
	let realFull: string;
	try {
		realFull = realpathSync(fullPath);
	} catch {
		return null;
	}
	if (realFull !== canonicalRoot && !realFull.startsWith(canonicalRoot + sep)) return null;
	return realFull;
}

/**
 * Serve a `/dedalo/ai_models/*` request, or return null when the pathname is not
 * one (the caller falls through to the next handler).
 *
 * Model files are immutable once written — a model id names an exact set of
 * weights — so they are served with a long-lived cache, which is what keeps a
 * second transcription from re-downloading a gigabyte over the LAN.
 */
export async function serveModelRequest(
	pathname: string,
	request: Request,
): Promise<Response | null> {
	if (!pathname.startsWith(AI_MODEL_URL_PREFIX)) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return notFound();
	}

	const fullPath = resolveModelPath(decoded.slice(AI_MODEL_URL_PREFIX.length));
	if (fullPath === null) return notFound();

	const response = await staticAssetResponse(fullPath, request);
	if (response === null) return notFound();

	// Immutable content: a model id IS its version.
	if (response.status === 200) {
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}
	return response;
}

/** 404 without leaking whether the target exists. */
function notFound(): Response {
	return new Response(JSON.stringify({ result: false, msg: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}
