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
 *
 * The DECISIONS live in three pure exports — `resolveFetchTarget` (path
 * confinement + URL policy), `curlArgv` (transport flags) and
 * `isUsableCachedFile` (cache freshness) — gated by
 * `test/unit/ai_model_fetch_native.test.ts`. What remains is byte plumbing,
 * split one concern per function (`acceptCached` / `recordIfComplete` for the
 * manifest bookkeeping, `curlFetch` / `plainFetch` — over `idleAbort` /
 * `streamToFile` / `pumpToWriter` — and `transport` for the wire),
 * so `fetchOneFile` reads as the six-line sequence it is. That plumbing is NOT
 * gated: it needs the network. The orchestration in `downloadModel` is drivable
 * through the injectable `options.fetchFile`.
 */

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { FileSink } from 'bun';

/** A model id / file segment: word chars, dot, slash, hyphen — and NEVER `..`. */
const SAFE_MODEL_SEGMENT = /^[A-Za-z0-9._/-]+$/;
function isSafeModelSegment(value: string): boolean {
	return value !== '' && SAFE_MODEL_SEGMENT.test(value) && !value.split('/').includes('..');
}

import { expectedSize, recordFileComplete } from './model_manifest.ts';
import { type ModelKind, modelFiles, modelStoreRoot } from './model_store.ts';

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

/**
 * Resolve where one model file lands on disk and where it comes from, or null
 * when the request is refused.
 *
 * MODEL-01 (2026-07-28 audit): modelId/file flow into BOTH the hub URL and the
 * on-disk path (join(store, modelId, file)). Reject traversal / URL-breaking
 * segments so a crafted id cannot write outside the store or rewrite the fetch
 * target, and confirm the resolved path stays under the store. (HUB_BASE is a
 * pinned https:// constant. A full content checksum needs a per-file hash
 * manifest, which the hub does not ship here — tracked separately.)
 */
export function resolveFetchTarget(
	modelId: string,
	file: string,
	store: string,
): { target: string; url: string } | null {
	if (!isSafeModelSegment(modelId) || !isSafeModelSegment(file)) return null;
	const target = join(store, modelId, file);
	const storeRoot = resolve(store);
	if (!resolve(target).startsWith(storeRoot + sep)) return null;
	return { target, url: `${HUB_BASE}/${modelId}/resolve/main/${file}` };
}

/**
 * True when a previous run already left this file COMPLETE on disk.
 *
 * `expected` is the authoritative byte length (the manifest's record, or the hub's
 * Content-Length). Without one — an air-gapped install, or a store seeded before
 * the manifest existed — the answer degrades to the old "non-empty" test, which is
 * the best a machine with no reference can honestly say. WITH one, a short file is
 * a partial download and must be re-fetched: accepting it is what shipped a
 * truncated model to the browser as "installed".
 */
export function isUsableCachedFile(target: string, expected?: number | null): boolean {
	if (!existsSync(target)) return false;
	const size = statSync(target).size;
	if (size === 0) return false;
	if (expected === undefined || expected === null) return true;
	return size === expected;
}

/**
 * How long a HEAD probe waits before giving up. `verify_model` runs this
 * INLINE on the request path (unlike `downloadModel`, which is a detached
 * background job) — behind a drop-all firewall a bare `fetch` with no timeout
 * never resolves, and an admin's click hangs forever instead of getting the
 * clean "could not learn it" this function already promises.
 */
const HEAD_TIMEOUT_MS = 10_000;

/**
 * How long a download may produce NOTHING before it is abandoned.
 *
 * Deliberately an idle bound rather than a total one: weights are gigabytes and a
 * heritage institution's uplink is not a data centre's, so any fixed ceiling would
 * eventually kill a healthy transfer. Silence is the thing that cannot be allowed
 * to last, because the lane it occupies is one of three the whole engine shares.
 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;

/**
 * The hub's byte length for one file, or null when it cannot be learnt (offline,
 * blocked, a timeout, or a hub that does not answer HEAD). Null is not a
 * failure: it drops the caller back to the size-agnostic cache test.
 */
export async function headContentLength(url: string): Promise<number | null> {
	try {
		const response = await fetch(url, {
			method: 'HEAD',
			redirect: 'follow',
			signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		// The hub serves LFS weights through a CDN redirect; x-linked-size is the
		// real object length when Content-Length describes the pointer.
		const linked = response.headers.get('x-linked-size');
		const length = linked ?? response.headers.get('content-length');
		const parsed = Number(length);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * The curl transport invocation.
 * -f: a 404 is a failure, not an HTML error page written to disk.
 * -L: follow the CDN redirect. -C -: resume a partial file.
 */
export function curlArgv(target: string, url: string, quiet: boolean): string[] {
	return [
		'curl',
		'-fL',
		'-C',
		'-',
		'--retry',
		'3',
		// AN IDLE BOUND, NOT A TOTAL ONE (CARRY-14). A model download is a
		// BACKGROUND JOB, and the engine has three background lanes shared by every
		// class of work; a hub that accepted the connection and then stalled held
		// one indefinitely, because this argv carried no time limit of any kind.
		// `--max-time` would be the wrong instrument: a multi-GB weights file
		// legitimately runs for hours on a museum's uplink. What must never be
		// unbounded is SILENCE — under 1 byte/s for this long and the transfer is
		// not slow, it is dead.
		'--speed-limit',
		'1',
		'--speed-time',
		String(Math.floor(DOWNLOAD_IDLE_TIMEOUT_MS / 1000)),
		quiet ? '-sS' : '--progress-bar',
		'-o',
		target,
		url,
	];
}

/** Fetch one file into the store; false = not obtained. */
export type FetchFile = (
	modelId: string,
	file: string,
	store: string,
	quiet: boolean,
) => Promise<boolean>;

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
	/**
	 * WHAT KIND of model this is — which decides the WEIGHT filenames when the
	 * catalog declares no `dtype`. A diarization model is `onnx/model.onnx`, not
	 * an encoder/decoder pair, so seeding a dtype-less speaker model as ASR asked
	 * the hub for two files that do not exist and never fetched the one that does.
	 */
	kind?: ModelKind;
	/**
	 * FETCH EXACTLY THESE FILES, instead of the computed set.
	 *
	 * The repair path's whole contract: re-fetch precisely what it removed. Left
	 * to `modelFiles(dtype)` a dtype-less repair deletes the q4 weights it found
	 * on disk and then downloads the fp32 set — deleting a 400 MB working install
	 * to replace it with ~3 GB the browser never asks for. Names come from the
	 * store's own evidence, so what comes back is what went away.
	 */
	files?: readonly string[];
	/** Transport seam: defaults to the real curl/fetch implementation. Injected
	 * by tests so the orchestration is drivable without the network. */
	fetchFile?: FetchFile;
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
		try {
			curlChecked = Bun.spawnSync(['curl', '--version'], {
				stdout: 'ignore',
				stderr: 'ignore',
			}).success;
		} catch {
			// (!) A MISSING BINARY THROWS, it does not return `{success:false}`.
			// Measured: on a PATH without curl, `Bun.spawnSync(['curl','--version'])`
			// raises `Executable not found in $PATH: "curl"`. Unguarded, that escaped
			// `transport` → `fetchOneFile` → `downloadModel`, so the seed died before
			// a single byte — on exactly the curl-less host `plainFetch` exists to
			// serve. The fallback was correct and unreachable.
			curlChecked = false;
		}
	}
	return curlChecked;
}

/** One file's identity on disk: which model, which file, where the store put it. */
interface FileRef {
	store: string;
	modelId: string;
	file: string;
	target: string;
}

/**
 * The already-on-disk answer. When a cached file proves complete against a size
 * the manifest did not yet hold, the manifest learns it here — that is how a
 * store seeded before the manifest existed becomes verifiable without a re-download.
 */
function acceptCached(ref: FileRef, expected: number | null, recorded: number | null): boolean {
	if (!isUsableCachedFile(ref.target, expected)) return false;
	if (expected !== null && recorded === null) {
		recordFileComplete(ref.store, ref.modelId, ref.file, expected);
	}
	return true;
}

/** Post-transport verdict: complete on disk ⇒ record the actual size and accept. */
function recordIfComplete(ref: FileRef, expected: number | null): boolean {
	if (!isUsableCachedFile(ref.target, expected)) return false;
	recordFileComplete(ref.store, ref.modelId, ref.file, statSync(ref.target).size);
	return true;
}

/**
 * curl transport. Async spawn: a server background job must never block the
 * event loop on a gigabyte download (spawnSync would freeze every request in
 * the process).
 */
async function curlFetch(target: string, url: string, quiet: boolean): Promise<boolean> {
	const proc = Bun.spawn(curlArgv(target, url, quiet), {
		stdout: quiet ? 'ignore' : 'inherit',
		stderr: quiet ? 'ignore' : 'inherit',
	});
	const code = await proc.exited;
	if (code === 0) return true;
	// curl leaves a zero-length file behind on a 404; it must not look cached.
	if (existsSync(target) && statSync(target).size === 0) rmSync(target);
	return false;
}

/**
 * WHAT ONE `fetch` ATTEMPT PRODUCED — four outcomes that are NOT
 * interchangeable. Only an ABORTED body can have left bytes on disk; a refusal
 * never opened the sink, and `unreachable` never got an answer at all.
 * Modelling this as a union instead of a boolean is what lets the decision be
 * taken ONCE, in `plainFetch`'s switch, rather than at every early return.
 */
type PlainFetchOutcome = 'complete' | 'refused' | 'aborted' | 'unreachable';

/**
 * An abort that fires after `ms` of SILENCE. `keepAlive()` restarts the clock —
 * a received byte is proof the transfer is alive — and `cancel()` stops it for
 * good, so a finished download leaves no timer behind.
 */
function idleAbort(ms: number): {
	signal: AbortSignal;
	keepAlive: () => void;
	cancel: () => void;
} {
	const controller = new AbortController();
	let timer = setTimeout(() => controller.abort(), ms);
	return {
		signal: controller.signal,
		keepAlive: (): void => {
			clearTimeout(timer);
			timer = setTimeout(() => controller.abort(), ms);
		},
		cancel: (): void => clearTimeout(timer),
	};
}

/**
 * Drain the body into the sink, one chunk at a time.
 *
 * (!) THE LOOP MUST BE ONE WE OWN, not `Bun.write(target, response)`.
 *
 * Measured (Bun 1.4.0, against a peer that sends headers plus one chunk and
 * then goes quiet): `controller.abort()` errors the response body, but a
 * `Bun.write` already awaiting that stream NEVER SETTLES — it hung >8s after a
 * 400ms abort. So the first version of this fix cancelled nothing and held the
 * lane exactly as long as before, with a timer for company. Reading the same
 * aborted body through a reader we drive ourselves rejects on schedule.
 */
async function pumpToWriter(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	writer: FileSink,
	keepAlive: () => void,
): Promise<void> {
	for (;;) {
		// rejects with the abort reason when the idle timer has fired
		const { done, value } = await reader.read();
		if (done) return;
		keepAlive();
		if (value) writer.write(value);
	}
}

/**
 * One attempt: fetch, then stream the body into `target`.
 *
 * (!) `fetch` ITSELF CAN REJECT, and that is the commonest stall shape, not an
 * exotic one. Measured (Bun 1.4.0): Bun resolves `fetch` on the FIRST BODY
 * BYTE, not on the headers — a peer that sends headers and then goes silent
 * without a single byte rejects at the `await fetch` line, OUTSIDE any reader
 * loop. That is precisely the hub-accepts-then-stalls case this whole fix
 * exists for, and leaving it to propagate broke `FetchFile`'s contract
 * (`false = not obtained`, never a throw): the seed died mid-run instead of
 * reporting one file missing. Connection refused and DNS failure — the ordinary
 * air-gapped and firewalled cases — arrive the same way.
 */
async function streamToFile(
	target: string,
	url: string,
	idle: { signal: AbortSignal; keepAlive: () => void },
): Promise<PlainFetchOutcome> {
	let response: Response;
	try {
		response = await fetch(url, {
			redirect: 'follow', // the hub redirects to its CDN; curl follows too (-L)
			signal: idle.signal,
		});
	} catch {
		return 'unreachable';
	}
	if (!response.ok || response.body === null) {
		// Release the connection rather than leaving an unread body pinned open.
		await response.body?.cancel().catch(() => undefined);
		return 'refused';
	}

	const writer = Bun.file(target).writer();
	try {
		await pumpToWriter(response.body.getReader(), writer, idle.keepAlive);
		await writer.end();
		return 'complete';
	} catch {
		await writer.end();
		return 'aborted';
	}
}

/**
 * Transport fallback for hosts without curl.
 *
 * The bound is not optional here (CARRY-14). Model weights are fetched by a
 * BACKGROUND JOB, and the engine has three background lanes shared by every
 * class of work; a hub that accepts the connection and then stalls held one of
 * them for as long as it liked, with nothing to cancel it.
 *
 * It is an IDLE bound, not a total one: a multi-GB weights file legitimately
 * takes far longer than any fixed budget on a museum's uplink, so what must
 * never be unbounded is SILENCE.
 *
 * EXPORTED, with the bound as a defaulted parameter, for its gate. The invariant
 * here is behavioural — "a stalled peer stops holding the lane, and leaves
 * nothing on disk" — and a source-shape assertion was measured to be defeated by
 * renaming one local. Driving the real function against a LOOPBACK peer is
 * hermetic: it is the third-party hub that may not be reached from a test, not a
 * socket on this machine. The parameter exists because two minutes of silence is
 * the right production bound and an impossible test.
 */
export async function plainFetch(
	target: string,
	url: string,
	idleTimeoutMs: number = DOWNLOAD_IDLE_TIMEOUT_MS,
): Promise<boolean> {
	const idle = idleAbort(idleTimeoutMs);
	try {
		// Exhaustive over PlainFetchOutcome, in ONE place: a fourth outcome stops
		// compiling rather than falling through to an accidental `true`.
		switch (await streamToFile(target, url, idle)) {
			case 'complete':
				return true;
			case 'aborted':
				// A half-written file must not survive: `isUsableCachedFile` compares
				// against the manifest's expected size, but an ABANDONED download of a
				// file whose size was never learnt would otherwise sit there looking
				// complete, and the next run would accept it.
				if (existsSync(target)) rmSync(target);
				return false;
			case 'refused':
			case 'unreachable':
				// No usable response: the sink was never opened, so there is nothing
				// on disk to remove.
				return false;
		}
	} finally {
		idle.cancel();
	}
}

/**
 * The one transport door: curl when it exists, `fetch` otherwise.
 *
 * EXPORTED for its gate: `haveCurl()` is what decides here, and it is memoized
 * for the life of the process, so the only honest way to test the curl-less host
 * is a subprocess that reaches this door with curl absent from PATH.
 */
export function transport(target: string, url: string, quiet: boolean): Promise<boolean> {
	return haveCurl() ? curlFetch(target, url, quiet) : plainFetch(target, url);
}

/**
 * Download one file into the store unless it is already there, complete.
 * Returns false when the file is absent upstream (the caller decides whether
 * that is fatal — it is not for OPTIONAL_FILES).
 */
async function fetchOneFile(
	modelId: string,
	file: string,
	store: string,
	quiet: boolean,
): Promise<boolean> {
	const resolved = resolveFetchTarget(modelId, file, store);
	if (resolved === null) return false;
	const { target, url } = resolved;
	const ref: FileRef = { store, modelId, file, target };

	// What SHOULD be on disk: the manifest first (no network), the hub second.
	// Without either, the cache test stays size-agnostic — see isUsableCachedFile.
	const recorded = expectedSize(store, modelId, file);
	const expected = recorded ?? (await headContentLength(url));

	if (acceptCached(ref, expected, recorded)) return true;

	mkdirSync(dirname(target), { recursive: true });
	if (!(await transport(target, url, quiet))) return false;
	return recordIfComplete(ref, expected);
}

/** Every default `DownloadOptions` leaves open, resolved once. */
interface DownloadPlan {
	store: string;
	quiet: boolean;
	/** The files to fetch, deduplicated. */
	wanted: string[];
	/** Of those, the ones a 404 may not fail. */
	optional: readonly string[];
	fetchFile: FetchFile;
}

/**
 * Which files this download is for. An explicit list is the WHOLE plan (the
 * repair path re-fetches exactly what it removed); otherwise modelFiles carries
 * config.json + the weights and the common files union in.
 */
function wantedFiles(
	dtype: Record<string, string> | undefined,
	options: DownloadOptions,
): string[] {
	if (options.files !== undefined) return [...new Set(options.files)];
	return [
		...new Set([...(options.commonFiles ?? COMMON_FILES), ...modelFiles(dtype, options.kind)]),
	];
}

function planDownload(
	dtype: Record<string, string> | undefined,
	options: DownloadOptions,
): DownloadPlan {
	return {
		store: options.store ?? modelStoreRoot(),
		quiet: options.quiet ?? true,
		wanted: wantedFiles(dtype, options),
		optional: options.optionalFiles ?? OPTIONAL_FILES,
		fetchFile: options.fetchFile ?? fetchOneFile,
	};
}

/**
 * Record one obtained file at its ACTUAL on-disk size. fetchOneFile already does
 * this on its own path; an injected transport (tests, or a future non-curl
 * transport) still needs the manifest to end up correct, so the recording lives
 * here too — recordFileComplete is idempotent.
 */
function recordObtained(store: string, modelId: string, file: string): void {
	const resolved = resolveFetchTarget(modelId, file, store);
	if (resolved !== null && existsSync(resolved.target)) {
		recordFileComplete(store, modelId, file, statSync(resolved.target).size);
	}
}

/**
 * A model with no weights is a FAILED seed, never a quiet success: the browser
 * would fail at transcription time, the surprise the store exists to prevent.
 * Only when weights were ASKED FOR, though — a repair that re-fetches one corrupt
 * tokenizer.json is complete without touching the weights, and calling that a
 * failure would report a successful repair as broken.
 */
function weightsMissing(wanted: readonly string[], gotWeights: boolean): boolean {
	return !gotWeights && wanted.some((file) => file.endsWith('.onnx'));
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
	const { store, quiet, wanted, optional, fetchFile } = planDownload(dtype, options);
	const report: DownloadReport = { ok: false, files: [], skipped: [], errors: [] };

	mkdirSync(store, { recursive: true });

	let gotWeights = false;
	for (const file of wanted) {
		options.onFile?.(file);
		const ok = await fetchFile(modelId, file, store, quiet);
		if (ok) {
			recordObtained(store, modelId, file);
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

	if (weightsMissing(wanted, gotWeights)) {
		report.errors.push(`${modelId}: no ONNX weights were obtained`);
	}

	report.ok = report.errors.length === 0;
	return report;
}
