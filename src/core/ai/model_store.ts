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
import { basename, extname, resolve, sep } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { staticAssetResponse } from '../api/static_asset.ts';
import { DedaloError, toErrorEnvelope } from '../errors/index.ts';
import { expectedSize, MANIFEST_FILE } from './model_manifest.ts';

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
 * WHAT KIND OF MODEL THIS IS — because the required files follow from the kind,
 * never from an assumption.
 *
 * An ASR (Whisper) folder is an encoder plus a merged decoder; a pyannote
 * SEGMENTATION or a WeSpeaker EMBEDDING folder is a single `onnx/model.onnx`.
 * Answering the second with the first's file list reported a perfectly healthy
 * speaker-detection model as `incomplete`, which disabled the checkbox, printed
 * "incomplete download" in the panel, and made the repair refusal tell the
 * administrator to re-import the tools registry — advice that cannot help,
 * because the model was never ASR-shaped at all.
 *
 * `unknown` is a real answer and NOT a synonym for `asr`: a caller that cannot
 * say (a catalog entry with neither `kind` nor `dtype`) gets an honest verdict
 * built from what is actually on disk, rather than a confident wrong one built
 * from guessed filenames. The catalog knows the kind (`register.json` carries
 * `kind: 'diarization'` on both speaker slots) — thread it, never infer it from
 * the model id.
 */
export type ModelKind = 'asr' | 'diarization' | 'unknown';

/**
 * The weight parts a kind has when the catalog declares no `dtype` — the fp32
 * placeholder names. `unknown` has none: there is nothing to place.
 */
const DEFAULT_PARTS: Readonly<Record<ModelKind, Record<string, string>>> = {
	asr: { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
	diarization: { model: 'fp32' },
	unknown: {},
};

/**
 * The weight-file prefixes a kind's ONNX directory must hold, used by the
 * dtype-less fallback to recognise a quantised install by its real filenames.
 * EVERY prefix must be matched: an ASR model needs both halves, a diarization
 * model needs its one.
 */
const WEIGHT_PREFIXES: Readonly<Record<ModelKind, readonly string[]>> = {
	asr: ['encoder_model', 'decoder_model_merged'],
	diarization: ['model'],
	unknown: [],
};

/**
 * The exact files one catalog entry needs in the store to be USABLE — its config
 * plus the ONNX weights for the quantisation the catalog declares. A model whose
 * config is present but whose weights are the wrong variant is NOT installed, and
 * saying so here is what stops the browser failing later with "Could not locate
 * file" from inside the ONNX runtime.
 *
 * `kind` decides the placeholder names used when there is no `dtype`; with one,
 * the declaration itself names the parts and the kind changes nothing.
 */
export function modelFiles(dtype?: Record<string, string>, kind: ModelKind = 'asr'): string[] {
	const parts = dtype ?? DEFAULT_PARTS[kind];
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
export function modelInstalled(
	modelId: string,
	dtype?: Record<string, string>,
	kind: ModelKind = 'asr',
): boolean {
	const root = modelStoreRoot();
	const present = (file: string): boolean => {
		const path = resolve(root, modelId, file);
		try {
			return existsSync(path) && statSync(path).size > 0;
		} catch {
			return false;
		}
	};

	if (dtype !== undefined) return modelFiles(dtype, kind).every(present);

	if (!present(REQUIRED_CONFIG)) return false;
	const weights = onnxDirEntries(root, modelId);
	if (weights === null) return false;
	const has = (prefix: string): boolean =>
		weights.some((file) => file.startsWith(prefix) && file.endsWith('.onnx'));
	// An UNKNOWN kind has no prefix list to satisfy: any weight file at all is the
	// most that can honestly be asserted (`every` over an empty list would say
	// "installed" for a store with none, so ask the disk instead).
	if (kind === 'unknown') return weights.some((file) => file.endsWith('.onnx'));
	return WEIGHT_PREFIXES[kind].every(has);
}

/** The model's `onnx/` listing, or null when there is no such directory. */
function onnxDirEntries(root: string, modelId: string): string[] | null {
	try {
		return readdirSync(resolve(root, modelId, 'onnx'));
	} catch {
		return null;
	}
}

/**
 * The weight filenames `modelState` should evidence for a DTYPE-LESS lookup —
 * the same "any variant present" fallback `modelInstalled` documents above,
 * expressed as real filenames instead of a boolean. Empty when the store does
 * not have BOTH an encoder and a decoder variant, so the caller falls back to
 * the fp32 placeholder names (which correctly reports "missing"/"incomplete"
 * for a genuinely empty or partial store — see modelState).
 */
function fallbackWeightsFiles(root: string, modelId: string, kind: ModelKind): string[] {
	const weights = onnxDirEntries(root, modelId);
	if (weights === null) return [];
	// An UNKNOWN kind cannot say which weights SHOULD be there, so it reports on
	// the ones that ARE: real names, from the disk itself, and never a guess that
	// would manufacture an `incomplete` verdict out of an assumption.
	if (kind === 'unknown') {
		return weights.filter((file) => file.endsWith('.onnx')).map((file) => `onnx/${file}`);
	}
	const found: string[] = [];
	for (const prefix of WEIGHT_PREFIXES[kind]) {
		const match = weights.find((file) => file.startsWith(prefix) && file.endsWith('.onnx'));
		if (match === undefined) return []; // an incomplete pair names nothing
		found.push(`onnx/${match}`);
	}
	return found;
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
	/**
	 * The leading bytes are the RIGHT KIND of payload (see headerPlausible).
	 * PER FILE, not per model: a repair that deletes every file because ONE of
	 * them is an HTML error page destroys the ones that were fine — and, on the
	 * dtype-less path, cannot name them again to fetch them back.
	 */
	plausible: boolean;
}

export interface ModelStateReport {
	state: ModelState;
	files: ModelFileEvidence[];
	/**
	 * The file NAMES in `files` are real, not guessed.
	 *
	 * True when the catalog declared a `dtype` (the names follow from it) or when
	 * the store itself supplied them (fallbackWeightsFiles reads the directory).
	 * FALSE means the names are the fp32 placeholders `modelFiles()` invents for
	 * a dtype-less catalog whose store holds no complete weight pair — a caller
	 * may report on them, but must NEVER delete a weight file on their authority:
	 * the quantisation actually installed is unknown, so what was removed could
	 * not be fetched back (a 400 MB q4 install replaced by a ~3 GB fp32 set the
	 * browser never asks for).
	 */
	namesKnown: boolean;
}

/**
 * The leading bytes of a file that claims to be ONNX or JSON.
 *
 * An ONNX file is a protobuf ModelProto: its first field is `ir_version`
 * (field 1, varint) so the first byte is 0x08 in every model the hub publishes.
 * A JSON payload starts with '{' or '[' (leading whitespace tolerated — a
 * pretty-printed config is not damaged). Anything else — most usefully '<' — is
 * a transport artefact written to disk under a model file's name.
 *
 * A file of a kind we have no rule for is NOT called implausible: no rule means
 * no verdict, and inventing one here would report a healthy install damaged.
 */
const JSON_WHITESPACE: ReadonlySet<number> = new Set([0x20, 0x09, 0x0a, 0x0d]);

/** '{' or '[' after any leading whitespace — a pretty-printed config is fine. */
function jsonHeadPlausible(head: Buffer, read: number): boolean {
	for (let i = 0; i < read; i++) {
		const byte = head[i] as number;
		if (JSON_WHITESPACE.has(byte)) continue;
		return byte === 0x7b || byte === 0x5b;
	}
	return false; // whitespace only
}

/** The verdict for the bytes we read, by file kind. Unknown kind ⇒ no verdict. */
function headPlausible(head: Buffer, read: number, file: string): boolean {
	if (file.endsWith('.json')) return jsonHeadPlausible(head, read);
	if (file.endsWith('.onnx')) return head[0] === 0x08;
	return true;
}

function headerPlausible(path: string, file: string): boolean {
	let fd: number | null = null;
	try {
		fd = openSync(path, 'r');
		const head = Buffer.alloc(8);
		const read = readSync(fd, head, 0, 8, 0);
		if (read < 1) return false;
		return headPlausible(head, read, file);
	} catch {
		return false;
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

/**
 * What the disk says about ONE file of one model, whatever list it came from.
 *
 * Exported because `modelState` only evidences the files a model NEEDS TO RUN
 * (config + weights), while a repair must also answer for the common files
 * (tokenizer.json, preprocessor_config.json…) — a corrupt tokenizer used to
 * survive a repair that then reported success, and a wrong "success" is the one
 * outcome this subsystem forbids.
 */
export function fileEvidence(root: string, modelId: string, file: string): ModelFileEvidence {
	const path = resolve(root, modelId, file);
	let size = 0;
	let present = false;
	try {
		present = existsSync(path);
		size = present ? statSync(path).size : 0;
	} catch {
		present = false;
	}
	return {
		file,
		present,
		size,
		expected: expectedSize(root, modelId, file),
		plausible: present && size > 0 ? headerPlausible(path, file) : false,
	};
}

export function modelState(
	modelId: string,
	dtype?: Record<string, string>,
	kind: ModelKind = 'asr',
): ModelStateReport {
	const root = modelStoreRoot();
	// No dtype declared: an older registered catalog that predates per-model
	// quantisation — which getToolConfig reading straight from the DB makes a
	// LIVE case, not a historical one. Guessing the fp32 filenames would report
	// a quantised install as "missing"; use the real filenames on disk when the
	// modelInstalled fallback (any encoder + any decoder variant) is satisfied,
	// and only fall back to the fp32 placeholders when it is not — which keeps
	// the correct "missing"/"incomplete" verdict for a genuinely empty/partial
	// store.
	//
	// The file list follows the model's KIND, never an ASR assumption: a pyannote
	// segmentation folder holds config.json + onnx/model.onnx and nothing else, so
	// demanding an encoder/decoder pair of it reported a healthy speaker model
	// `incomplete` and aimed a repair at a shape it does not have.
	const fallbackFound = dtype === undefined ? fallbackWeightsFiles(root, modelId, kind) : [];
	const wanted =
		dtype !== undefined
			? modelFiles(dtype, kind)
			: fallbackFound.length > 0
				? [REQUIRED_CONFIG, ...fallbackFound]
				: modelFiles(undefined, kind);

	// With an UNKNOWN kind and no dtype there are no placeholder names to fall
	// back to (modelFiles yields the config alone), so a store holding weights we
	// cannot classify is never called `incomplete` on the strength of a guess.
	const namesKnown = dtype !== undefined || fallbackFound.length > 0;
	const files: ModelFileEvidence[] = wanted.map((file) => fileEvidence(root, modelId, file));
	const verdict = (state: ModelState): ModelStateReport => ({ state, files, namesKnown });

	if (files.every((entry) => !entry.present || entry.size === 0)) return verdict('missing');
	if (files.some((entry) => !entry.present || entry.size === 0)) return verdict('incomplete');
	// Wrong KIND of content beats wrong LENGTH: an HTML error page is a damaged
	// install whatever the manifest claims, and it names a different remedy.
	if (files.some((entry) => !entry.plausible)) return verdict('damaged');
	if (files.some((entry) => entry.expected !== null && entry.expected !== entry.size)) {
		return verdict('incomplete');
	}
	if (files.every((entry) => entry.expected !== null)) return verdict('ready');
	return verdict('unverified');
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
	if (!isServableFile(fullPath)) return null;
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

/**
 * May this NAME be served at all? An allowlisted extension, and not the
 * completion manifest.
 *
 * The manifest is INTERNAL bookkeeping and it is `.json`, so the extension
 * allowlist alone would serve it on this anonymous route. The browser never asks
 * for it — it loads config.json, the tokenizer/preprocessor JSON and the
 * weights — while the manifest names this install's own files and their exact
 * byte lengths. Nothing needs it; nobody outside gets it.
 */
function isServableFile(fullPath: string): boolean {
	if (!SERVABLE_EXTENSIONS.has(extname(fullPath).toLowerCase())) return false;
	return basename(fullPath) !== MANIFEST_FILE;
}

/** 404 without leaking whether the target exists. */
function notFound(): Response {
	// Converter-made body (ERRORS_SPEC §4): this is a STATIC route, so it never
	// entered the dispatch chokepoint and has no correlation id to reuse — the
	// envelope gets a fresh one rather than a fake constant.
	const { status, body } = toErrorEnvelope(new DedaloError('resource.not_found'), {
		requestId: crypto.randomUUID(),
	});
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
