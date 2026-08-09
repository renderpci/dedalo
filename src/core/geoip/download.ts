/**
 * GEOIP — country database download + decompression.
 *
 * Fetches the DB-IP IP-to-Country Lite database (CC-BY-4.0, no signup) and
 * gunzips it into the geoip cache dir. Mirrors the hardened remote-file posture
 * of the ontology downloader (src/core/ontology/data_io_import.ts, WC-023):
 * TLS peer verification stays ON, redirects are refused, the stream runs under
 * byte + stall ceilings, decompression is capped (zip-bomb guard), and the
 * target path is confined. Kept self-contained (its own copies of the confine
 * helper + caps) so the lean geoip subsystem does not pull in the ontology /
 * DB / install import graph — the same "duplicate the tiny confine helper
 * rather than cross-import a module-private one" choice data_io_import.ts made.
 *
 * Source URL: https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz
 * (plain gzip of the .mmdb, NOT a tarball — a single gunzip yields the DB). The
 * current month is tried first, then the previous month (DB-IP publishes monthly
 * and the new file can lag in the first days). An operator override URL bypasses
 * the month logic entirely.
 *
 * COVERAGE POSTURE (rewrite/CRAP_COVERAGE_PLAN.md §3.15): every decision — URL
 * policy, response policy, byte/stall ceilings, zip-bomb caps, month fallback,
 * path confinement — is an exported, injectable seam gated by
 * test/unit/geoip_download_native.test.ts. What stays EXEMPT is the
 * `validate → fetch → assert → pump` composition inside `streamToFile` (4 lines,
 * each step separately gated) — a real network fetch is never made in a test.
 *
 * `gunzipWithCaps` here is deliberately a SECOND implementation, not a re-export
 * of src/core/ontology/data_io_import.ts's: different ceilings, different message
 * text, and importing the ontology one would drag the ontology / DB / install
 * graph into the lean geoip subsystem (see the paragraph above).
 */

import { createWriteStream, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import { readEnv } from '../../config/env.ts';

const DOWNLOAD_TIMEOUT_MS = 600_000; // total per-file deadline
const DOWNLOAD_STALL_TIMEOUT_MS = 60_000; // per-read idle guard
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024; // .mmdb.gz is ~8 MB; generous ceiling
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024; // the .mmdb is ~15 MB
const MAX_DECOMPRESSION_RATIO = 100; // out/in ceiling once in > 1 MiB

/** DB-IP free download host — the only origin the default URL may point at. */
const DBIP_ORIGIN = 'https://download.db-ip.com';

/** Stable on-disk name of the decompressed database (month-independent). */
export const DB_BASENAME = 'dbip-country-lite.mmdb';

/** Result of a download attempt. */
export interface GeoipDownloadResult {
	ok: boolean;
	mmdbPath?: string;
	error?: string;
}

/**
 * Refuse to run with process-wide TLS verification disabled — that env var
 * silently drops peer verification for every fetch (same guard as the ontology
 * ingest, WC-023 D1).
 */
function assertTlsVerificationOn(): void {
	if (readEnv('NODE_TLS_REJECT_UNAUTHORIZED') === '0') {
		throw new Error(
			'geoip download refused: NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS peer verification process-wide. Remove it; pin private CAs via NODE_EXTRA_CA_CERTS instead.',
		);
	}
}

/** Confine a filename under a base dir, rejecting traversal / shell-hostile bytes. */
export function confinedPath(baseDir: string, fileName: string): string | null {
	if (fileName.includes('/') || fileName.includes('..') || fileName.includes('\0')) return null;
	const resolved = resolve(join(baseDir, fileName));
	if (!resolved.startsWith(resolve(baseDir) + sep)) return null;
	return resolved;
}

/**
 * Is an operator override URL configured? ONE reading of the rule, shared by
 * `candidateUrls` (which URLs to try) and `downloadCountryDb` (whether to
 * origin-pin), so the two can never disagree about what "an override" is.
 */
function hasOperatorOverride(override: string | undefined): boolean {
	return override !== undefined && override.trim() !== '';
}

/** The default DB-IP monthly URL for a given year/month. */
function dbipUrl(year: number, month: number): string {
	const mm = String(month).padStart(2, '0');
	return `${DBIP_ORIGIN}/free/dbip-country-lite-${year}-${mm}.mmdb.gz`;
}

/**
 * Candidate URLs to try in order: an operator override if set, else the current
 * month followed by the previous month.
 */
export function candidateUrls(override: string | undefined, now: Date = new Date()): string[] {
	if (hasOperatorOverride(override)) {
		return [(override as string).trim()];
	}
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth() + 1; // 1-12
	const prevYear = month === 1 ? year - 1 : year;
	const prevMonth = month === 1 ? 12 : month - 1;
	return [dbipUrl(year, month), dbipUrl(prevYear, prevMonth)];
}

/**
 * Stream one URL to `destPath` under byte + stall ceilings, refusing redirects.
 * The default DB-IP URLs are additionally origin-pinned to download.db-ip.com;
 * an operator override is trusted to its own (https) origin. Returns the byte
 * count on success, or throws. `notFound` is signalled so the caller can try the
 * next candidate month.
 */
async function streamToFile(url: string, destPath: string, pinToDbip: boolean): Promise<number> {
	const parsed = validateDownloadUrl(url, pinToDbip);
	const remote = await fetch(parsed, {
		redirect: 'error',
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	const body = assertAcceptableResponse(remote, url);
	return await pumpToFile(body, destPath);
}

/**
 * URL policy: syntactically valid, https, and (for the default month URLs)
 * origin-pinned to DB-IP. An operator override is trusted to its own https
 * origin. Returns the parsed URL, or throws.
 */
export function validateDownloadUrl(url: string, pinToDbip: boolean): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`invalid geoip download URL: ${url}`);
	}
	if (parsed.protocol !== 'https:') {
		throw new Error(`geoip download URL must be https: ${url}`);
	}
	if (pinToDbip && parsed.origin !== DBIP_ORIGIN) {
		throw new Error(`geoip download origin mismatch: ${parsed.origin} != ${DBIP_ORIGIN}`);
	}
	return parsed;
}

/**
 * Response policy: 404 is marked so a caller could try the next candidate month,
 * any other non-2xx is fatal, a declared content-length above the cap is refused
 * before a byte is read, and a null body is "empty data". Returns the body
 * stream, or throws.
 */
export function assertAcceptableResponse(
	remote: Response,
	url: string,
	maxBytes: number = MAX_DOWNLOAD_BYTES,
): ReadableStream<Uint8Array> {
	if (remote.status === 404) {
		// `notFound` is READ by downloadCountryDb's candidate loop (D11, wired
		// 2026-08-09): only a 404 — "this month is not published yet" — may
		// consume the next candidate month. Any other failure aborts the loop.
		throw Object.assign(new Error(`not found: ${url}`), { notFound: true });
	}
	if (!remote.ok) {
		throw new Error(`bad server response code: ${remote.status}`);
	}
	const declared = Number(remote.headers.get('content-length') ?? '0');
	if (declared > maxBytes) {
		throw new Error(`content-length ${declared} > ${maxBytes}`);
	}
	if (remote.body === null) {
		throw new Error('empty data');
	}
	return remote.body as ReadableStream<Uint8Array>;
}

/**
 * Drain `body` into `destPath` under a total-byte ceiling and a per-read idle
 * (stall) guard. Returns the byte count; throws on a cap trip, a stall, or an
 * empty stream.
 */
export async function pumpToFile(
	body: ReadableStream<Uint8Array>,
	destPath: string,
	maxBytes: number = MAX_DOWNLOAD_BYTES,
	stallMs: number = DOWNLOAD_STALL_TIMEOUT_MS,
): Promise<number> {
	const reader = body.getReader();
	const sink = createWriteStream(destPath);
	let total = 0;
	try {
		for (;;) {
			const chunk = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('download stalled')), stallMs),
				),
			]);
			if (chunk.done) break;
			total += chunk.value.byteLength;
			if (total > maxBytes) {
				throw new Error(`download exceeds the ${maxBytes}-byte cap`);
			}
			if (!sink.write(chunk.value)) {
				await new Promise<void>((drain) => sink.once('drain', () => drain()));
			}
		}
	} finally {
		await new Promise<void>((end) => sink.end(() => end()));
		reader.releaseLock();
	}
	if (total === 0) {
		throw new Error('empty data');
	}
	return total;
}

/** Ceilings for `gunzipWithCaps`; each defaults to this module's constant. */
export interface GunzipCaps {
	maxBytes?: number;
	maxRatio?: number;
	ratioFloorBytes?: number;
}

/** Stream-gunzip `srcPath` to `destPath` under byte + ratio ceilings (zip-bomb guard). */
export async function gunzipWithCaps(
	srcPath: string,
	destPath: string,
	caps: GunzipCaps = {},
): Promise<number> {
	const maxBytes = caps.maxBytes ?? MAX_DECOMPRESSED_BYTES;
	const maxRatio = caps.maxRatio ?? MAX_DECOMPRESSION_RATIO;
	const ratioFloorBytes = caps.ratioFloorBytes ?? 1024 * 1024;
	const compressedSize = statSync(srcPath).size;
	const gunzip = createGunzip();
	const sink = createWriteStream(destPath);
	let out = 0;
	try {
		await new Promise<void>((resolveDone, reject) => {
			gunzip.on('data', (chunk: Buffer) => {
				out += chunk.byteLength;
				if (out > maxBytes) {
					gunzip.destroy(new Error(`decompressed output exceeds ${maxBytes} bytes`));
					return;
				}
				if (compressedSize > ratioFloorBytes && out / compressedSize > maxRatio) {
					gunzip.destroy(new Error(`decompression ratio exceeds ${maxRatio}x`));
					return;
				}
				if (!sink.write(chunk)) {
					gunzip.pause();
					sink.once('drain', () => gunzip.resume());
				}
			});
			gunzip.on('error', reject);
			gunzip.on('end', () => sink.end(() => resolveDone()));
			gunzip.end(readFileSync(srcPath));
		});
		return out;
	} catch (error) {
		// `createWriteStream` opens the fd ASYNCHRONOUSLY. On a fast failure (a
		// non-gzip body errors on the first chunk) that open is still pending here,
		// so a bare rmSync deletes nothing and the open then RE-CREATES the file —
		// measured at 27-45% of failures. Wait for 'close', which fires only after
		// the pending open has resolved, so the unlink is deterministic.
		sink.destroy();
		await new Promise<void>((closed) => sink.once('close', () => closed()));
		rmSync(destPath, { force: true });
		throw error;
	}
}

/**
 * Download + decompress the country database into `dir`. Returns the path to the
 * ready-to-load .mmdb on success. Never throws — every failure is returned as
 * `{ ok:false, error }` so the boot task degrades soft.
 */
export async function downloadCountryDb(
	dir: string,
	urlOverride: string | undefined,
	deps: {
		streamToFile?: (url: string, destPath: string, pinToDbip: boolean) => Promise<number>;
		gunzipWithCaps?: (srcPath: string, destPath: string) => Promise<number>;
	} = {},
): Promise<GeoipDownloadResult> {
	const fetchFile = deps.streamToFile ?? streamToFile;
	const decompress = deps.gunzipWithCaps ?? gunzipWithCaps;
	try {
		assertTlsVerificationOn();
	} catch (error) {
		return { ok: false, error: (error as Error).message };
	}

	const gzPath = confinedPath(dir, `${DB_BASENAME}.gz`);
	const mmdbPath = confinedPath(dir, DB_BASENAME);
	if (gzPath === null || mmdbPath === null) {
		return { ok: false, error: 'unconfined geoip download path' };
	}

	const pinToDbip = !hasOperatorOverride(urlOverride);
	const urls = candidateUrls(urlOverride);

	try {
		mkdirSync(dir, { recursive: true });
	} catch (error) {
		return { ok: false, error: `cannot create geoip dir: ${(error as Error).message}` };
	}

	let lastError = 'no candidate URL';
	for (const url of urls) {
		const attempt = await attemptCandidate(url, gzPath, mmdbPath, pinToDbip, fetchFile, decompress);
		if (attempt.ok) return { ok: true, mmdbPath };
		lastError = attempt.error;
		// D11 (wired 2026-08-09): ONLY a 404 — "this month is not published yet"
		// — falls through to the previous-month candidate. A hard failure
		// (origin mismatch, cap trip, stall, TLS refusal) is not month-specific:
		// retrying burns the fallback and reports the wrong cause, so it stops
		// here with its own message.
		if (!attempt.notFound) break;
	}
	return { ok: false, error: lastError };
}

/**
 * One candidate URL: fetch, decompress, drop the .gz. On failure the partial
 * files are removed and the 404 marker (`notFound`) is surfaced so the caller
 * can decide whether the next candidate month is worth trying.
 */
async function attemptCandidate(
	url: string,
	gzPath: string,
	mmdbPath: string,
	pinToDbip: boolean,
	fetchFile: (url: string, destPath: string, pinToDbip: boolean) => Promise<number>,
	decompress: (srcPath: string, destPath: string) => Promise<number>,
): Promise<{ ok: true } | { ok: false; error: string; notFound: boolean }> {
	try {
		await fetchFile(url, gzPath, pinToDbip);
		await decompress(gzPath, mmdbPath);
		safeRemove(gzPath);
		return { ok: true };
	} catch (error) {
		safeRemove(gzPath);
		// Defence in depth: a half-written .mmdb must never survive a failed
		// candidate. A leftover zero-byte file dates to NOW, so decideGeoipAction
		// reads it as present+fresh and suppresses the re-download for the whole
		// REFRESH_AFTER_MS window — one bad response would disable geoip for 30 days.
		safeRemove(mmdbPath);
		return {
			ok: false,
			error: (error as Error).message,
			notFound: (error as { notFound?: boolean }).notFound === true,
		};
	}
}

/**
 * Best-effort unlink. `rmSync(force:true)` still throws on EACCES/EPERM/EBUSY
 * (a root-owned or read-only cache dir), which would break downloadCountryDb's
 * documented "never throws" contract and, through it, skip ensureGeoipDb's
 * load of a perfectly good pre-existing .mmdb (D13, fixed 2026-08-09).
 */
function safeRemove(path: string): void {
	try {
		rmSync(path, { force: true });
	} catch (error) {
		console.warn(`[geoip] could not remove ${path}: ${(error as Error).message}`);
	}
}
