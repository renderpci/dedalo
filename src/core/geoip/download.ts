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
 */

import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
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
function confinedPath(baseDir: string, fileName: string): string | null {
	if (fileName.includes('/') || fileName.includes('..') || fileName.includes('\0')) return null;
	const resolved = resolve(join(baseDir, fileName));
	if (!resolved.startsWith(resolve(baseDir) + sep)) return null;
	return resolved;
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
function candidateUrls(override: string | undefined): string[] {
	if (override !== undefined && override.trim() !== '') {
		return [override.trim()];
	}
	const now = new Date();
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

	const remote = await fetch(parsed, {
		redirect: 'error',
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (remote.status === 404) {
		throw Object.assign(new Error(`not found: ${url}`), { notFound: true });
	}
	if (!remote.ok) {
		throw new Error(`bad server response code: ${remote.status}`);
	}
	const declared = Number(remote.headers.get('content-length') ?? '0');
	if (declared > MAX_DOWNLOAD_BYTES) {
		throw new Error(`content-length ${declared} > ${MAX_DOWNLOAD_BYTES}`);
	}
	if (remote.body === null) {
		throw new Error('empty data');
	}

	const reader = remote.body.getReader();
	const sink = createWriteStream(destPath);
	let total = 0;
	try {
		for (;;) {
			const chunk = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('download stalled')), DOWNLOAD_STALL_TIMEOUT_MS),
				),
			]);
			if (chunk.done) break;
			total += chunk.value.byteLength;
			if (total > MAX_DOWNLOAD_BYTES) {
				throw new Error(`download exceeds the ${MAX_DOWNLOAD_BYTES}-byte cap`);
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

/** Stream-gunzip `srcPath` to `destPath` under byte + ratio ceilings (zip-bomb guard). */
async function gunzipWithCaps(srcPath: string, destPath: string): Promise<number> {
	const compressedSize = statSync(srcPath).size;
	const gunzip = createGunzip();
	const sink = createWriteStream(destPath);
	let out = 0;
	try {
		await new Promise<void>((resolveDone, reject) => {
			gunzip.on('data', (chunk: Buffer) => {
				out += chunk.byteLength;
				if (out > MAX_DECOMPRESSED_BYTES) {
					gunzip.destroy(new Error(`decompressed output exceeds ${MAX_DECOMPRESSED_BYTES} bytes`));
					return;
				}
				if (compressedSize > 1024 * 1024 && out / compressedSize > MAX_DECOMPRESSION_RATIO) {
					gunzip.destroy(new Error(`decompression ratio exceeds ${MAX_DECOMPRESSION_RATIO}x`));
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
		sink.destroy();
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
): Promise<GeoipDownloadResult> {
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

	const pinToDbip = !(urlOverride !== undefined && urlOverride.trim() !== '');
	const urls = candidateUrls(urlOverride);

	try {
		mkdirSync(dir, { recursive: true });
	} catch (error) {
		return { ok: false, error: `cannot create geoip dir: ${(error as Error).message}` };
	}

	let lastError = 'no candidate URL';
	for (const url of urls) {
		try {
			await streamToFile(url, gzPath, pinToDbip);
			await gunzipWithCaps(gzPath, mmdbPath);
			rmSync(gzPath, { force: true });
			return { ok: true, mmdbPath };
		} catch (error) {
			rmSync(gzPath, { force: true });
			lastError = (error as Error).message;
			// A 404 means this month is not published yet — the loop falls through
			// to the next (previous-month) candidate. Any other error does too.
		}
	}
	return { ok: false, error: lastError };
}
