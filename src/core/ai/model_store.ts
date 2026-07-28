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

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { staticAssetResponse } from '../api/static_asset.ts';

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
	return fullPath;
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
